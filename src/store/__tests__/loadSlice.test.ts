/**
 * Unit tests for the load slice against the recording database: the
 * portfolio load with its thirty-second guard, the cross-project preload
 * paging past the thousand-row limit, the per-project load that always
 * brings the cash and never repeats itself, the cash refresh that
 * re-derives the custodies, the audit log, and the realtime channel that
 * applies inserts, updates and deletes to the lists it carries.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Company, Custody, Expense } from '@/types/project';

interface Call { table: string; ops: [string, unknown[]][] }
const calls: Call[] = [];
const answers: unknown[] = [];
function builder(table: string) {
  const call: Call = { table, ops: [] };
  calls.push(call);
  const b: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(answers.shift() ?? { data: null, error: null }).then(resolve, reject),
  };
  for (const op of ['select', 'eq', 'order', 'limit', 'range', 'insert', 'update', 'delete', 'single']) {
    b[op] = (...args: unknown[]) => { call.ops.push([op, args]); return b; };
  }
  return b;
}
type Handler = (payload: { table: string; eventType: string; new?: unknown; old?: unknown }) => void;
const channel = { handler: null as Handler | null, on: vi.fn(), subscribe: vi.fn(), removeChannel: vi.fn(), name: '' };
channel.on.mockImplementation((_e: string, _f: unknown, h: Handler) => { channel.handler = h; return channel; });
channel.subscribe.mockImplementation(() => channel);
vi.mock('@/services/db', () => ({
  db: {
    from: (table: string) => builder(table),
    raw: { channel: (name: string) => { channel.name = name; return channel; }, removeChannel: (c: unknown) => channel.removeChannel(c) },
  },
  unwrap: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { useStore } from '@/store/useStore';

const P = 'p1';
const ops = (i: number) => calls[i].ops.map(([op, args]) => [op, ...args]);
const loaders = { loadFundsForProject: vi.fn(async () => {}), loadResourcePayablesForProject: vi.fn(async () => {}), loadCashTransfersForProject: vi.fn(async () => {}) };
const custodyRow = (over: Record<string, unknown> = {}) => ({ id: 'c1', project_id: P, company_id: null, resource_name: 'عمر', amount: '5000', notes: null, created_at: 'c', received_date: null, closed_date: null, status: 'active', source_fund_id: null, ...over });

beforeEach(() => {
  calls.length = 0;
  answers.length = 0;
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  useStore.setState({
    loading: true, detailsLoading: false, detailsLoaded: false, projectDataLoaded: new Set(), _lastLoadedAt: undefined,
    companies: [], portfolios: [], projects: [], budgetItems: [], expenses: [], revenues: [], resources: [], custodies: [],
    milestones: [], changeOrders: [], risks: [], indirectCosts: [], commitments: [], auditLog: [], cashTransfers: [], ...loaders,
  });
});

describe('loadAll', () => {
  it('loads the three lists newest first, clears the flag, and skips a repeat inside thirty seconds', async () => {
    answers.push({ data: [{ id: 'c1', name: 'شركة', description: null, logo: null, status: null, created_at: 'c' }], error: null }, { data: [], error: null }, { data: [], error: null });
    await useStore.getState().loadAll();
    expect(calls.map((c) => c.table)).toEqual(['companies', 'portfolios', 'projects']);
    expect(ops(0)).toEqual([['select', '*'], ['order', 'created_at', { ascending: false }]]);
    const s = useStore.getState();
    expect(s.companies[0]).toMatchObject({ id: 'c1', status: 'active' });
    expect(s.loading).toBe(false);
    expect(s._lastLoadedAt).toBeGreaterThan(0);

    await useStore.getState().loadAll();
    expect(calls).toHaveLength(3);
  });

  it('clears the flag and rethrows when a list is refused', async () => {
    answers.push({ data: null, error: { message: 'denied' } }, { data: [], error: null }, { data: [], error: null });
    await expect(useStore.getState().loadAll()).rejects.toEqual({ message: 'denied' });
    expect(useStore.getState().loading).toBe(false);
    expect(useStore.getState()._lastLoadedAt).toBeUndefined();
  });
});

describe('loadDetails', () => {
  it('pages a table past a thousand rows, derives the custodies from the expenses, and marks the details loaded', async () => {
    const page = Array.from({ length: 1000 }, (_, i) => ({ id: `b${i}`, project_id: P, category: 'salary', description: 'x', planned_amount: '1', month: null, start_month: null, end_month: null, cost_type: null, cost_class: null, resource_id: null }));
    answers.push({ data: page, error: null });
    answers.push({ data: [{ id: 'e1', project_id: P, custody_id: 'c1', amount: '1200', category: 'salary', description: 'x', date: 'd', month: 1, approval_status: 'approved' }], error: null });
    answers.push({ data: [], error: null }, { data: [], error: null });
    answers.push({ data: [custodyRow()], error: null });
    await useStore.getState().loadDetails();
    const budgetCalls = calls.filter((c) => c.table === 'budget_items');
    expect(budgetCalls.map((c) => c.ops.find(([o]) => o === 'range')?.[1])).toEqual([[0, 999], [1000, 1999]]);
    expect(calls.find((c) => c.table === 'milestones')?.ops).toContainEqual(['order', ['sort_order', { ascending: true }]]);
    const s = useStore.getState();
    expect(s.budgetItems).toHaveLength(1000);
    expect(s.custodies[0]).toMatchObject({ id: 'c1', spent: 1200, remaining: 3800 });
    expect(s.detailsLoaded).toBe(true);
    expect(s.detailsLoading).toBe(false);

    await useStore.getState().loadDetails();
    expect(calls.filter((c) => c.table === 'budget_items')).toHaveLength(2);
  });
});

describe('the cash', () => {
  it('always brings the funds, the payables and the transfers, and swallows one loader failing', async () => {
    loaders.loadResourcePayablesForProject.mockRejectedValueOnce(new Error('down'));
    await useStore.getState().ensureProjectCashData(P);
    expect(loaders.loadFundsForProject).toHaveBeenCalledWith(P);
    expect(loaders.loadCashTransfersForProject).toHaveBeenCalledWith(P);
    expect(console.warn).toHaveBeenCalled();
  });

  it('refreshes the cash and re-derives the project\'s custodies from its expenses, keeping the others', async () => {
    useStore.setState({
      expenses: [{ id: 'e1', projectId: P, custodyId: 'c1', amount: 700 } as Expense, { id: 'e2', projectId: 'p2', custodyId: 'c1', amount: 999 } as Expense],
      custodies: [{ id: 'c-old', projectId: P, resourceName: 'قديمة' } as Custody, { id: 'c-other', projectId: 'p2', resourceName: 'أخرى' } as Custody],
    });
    answers.push({ data: [custodyRow()], error: null });
    await useStore.getState().refreshCashDerivations(P);
    expect(loaders.loadFundsForProject).toHaveBeenCalledWith(P);
    expect(ops(0)).toContainEqual(['eq', 'project_id', P]);
    expect(useStore.getState().custodies.map((c) => [c.id, c.spent])).toEqual([['c-other', undefined], ['c1', 700]]);
  });
});

describe('loadProjectData', () => {
  it('brings the cash, loads the project\'s nine lists in place of its old rows, and never repeats itself', async () => {
    useStore.setState({ expenses: [{ id: 'e-old', projectId: P } as Expense, { id: 'e-keep', projectId: 'p2' } as Expense] });
    answers.push({ data: [], error: null });
    answers.push({ data: [{ id: 'e-new', project_id: P, amount: '5', category: 'salary', description: 'x', date: 'd', month: 1 }], error: null });
    await useStore.getState().loadProjectData(P);
    expect(loaders.loadFundsForProject).toHaveBeenCalledWith(P);
    expect(calls.map((c) => c.table)).toEqual(['budget_items', 'expenses', 'revenues', 'resources', 'custodies', 'milestones', 'change_orders', 'risks', 'commitments']);
    expect(ops(0)).toContainEqual(['eq', 'project_id', P]);
    expect(useStore.getState().expenses.map((e) => e.id)).toEqual(['e-keep', 'e-new']);
    expect(useStore.getState().projectDataLoaded.has(P)).toBe(true);

    await useStore.getState().loadProjectData(P);
    expect(calls).toHaveLength(9);
    expect(loaders.loadFundsForProject).toHaveBeenCalledTimes(2);
  });

  it('skips the lists once the cross-project preload has them, but still brings the cash', async () => {
    useStore.setState({ detailsLoaded: true });
    await useStore.getState().loadProjectData(P);
    expect(calls).toHaveLength(0);
    expect(loaders.loadFundsForProject).toHaveBeenCalledWith(P);
  });
});

describe('loadCompanyData and loadAuditLog', () => {
  it('loads the company\'s indirect costs in place of its old ones, then each of its projects', async () => {
    useStore.setState({
      projects: [{ id: P, companyId: 'c1' } as never, { id: 'p2', companyId: 'c2' } as never],
      indirectCosts: [{ id: 'ic-old', companyId: 'c1' } as never, { id: 'ic-keep', companyId: 'c2' } as never],
    });
    answers.push({ data: [{ id: 'ic-new', company_id: 'c1', category: 'rent', description: 'x', amount: '100', month: 1, date: 'd', allocation_method: null, created_at: 'c' }], error: null });
    await useStore.getState().loadCompanyData('c1');
    expect(calls[0].table).toBe('indirect_costs');
    expect(ops(0)).toContainEqual(['eq', 'company_id', 'c1']);
    expect(useStore.getState().indirectCosts.map((i) => i.id)).toEqual(['ic-keep', 'ic-new']);
    expect(loaders.loadFundsForProject).toHaveBeenCalledTimes(1);
    expect(loaders.loadFundsForProject).toHaveBeenCalledWith(P);
    expect(useStore.getState().projectDataLoaded.has(P)).toBe(true);
  });

  it('loads the latest hundred audit rows of the project', async () => {
    answers.push({ data: [{ id: 'a1', user_id: 'u', action: 'DELETE', table_name: 'expenses', record_id: 'e1', record_data: { amount: 5 }, project_id: P, created_at: 'c' }], error: null });
    await useStore.getState().loadAuditLog(P);
    expect(ops(0)).toEqual([['select', '*'], ['eq', 'project_id', P], ['order', 'created_at', { ascending: false }], ['limit', 100]]);
    expect(useStore.getState().auditLog[0]).toEqual({ id: 'a1', userId: 'u', action: 'DELETE', tableName: 'expenses', recordId: 'e1', recordData: { amount: 5 }, projectId: P, createdAt: 'c' });
  });
});

describe('subscribeToProject', () => {
  it('opens a channel on the project, applies inserts, updates and deletes to the list a table lands in, and closes it', () => {
    useStore.setState({ expenses: [{ id: 'e1', projectId: P, amount: 5 } as Expense], milestones: [] });
    const unsubscribe = useStore.getState().subscribeToProject(P);
    expect(channel.name).toBe(`project-${P}`);
    expect(channel.on).toHaveBeenCalledWith('postgres_changes', { event: '*', schema: 'public', filter: `project_id=eq.${P}` }, expect.any(Function));
    const h = channel.handler as Handler;

    h({ table: 'milestones', eventType: 'INSERT', new: { id: 'm1', project_id: P, name: 'أ', sort_order: 1, weight: '1', percent_complete: 0, status: 'planned', created_at: 'c' } });
    expect(useStore.getState().milestones.map((m) => m.id)).toEqual(['m1']);
    h({ table: 'expenses', eventType: 'UPDATE', new: { id: 'e1', project_id: P, amount: '9', category: 'salary', description: 'x', date: 'd', month: 1 } });
    expect(useStore.getState().expenses[0].amount).toBe(9);
    h({ table: 'expenses', eventType: 'DELETE', old: { id: 'e1' } });
    expect(useStore.getState().expenses).toEqual([]);
    h({ table: 'risks', eventType: 'INSERT', new: { id: 'r1' } });
    expect(useStore.getState().risks).toEqual([]);

    unsubscribe();
    expect(channel.removeChannel).toHaveBeenCalledWith(channel);
  });

  it('takes the echo of a row this session already added as that row, not a second one', () => {
    // addExpense puts the saved row in the list; Supabase then sends the same insert back.
    const row = { id: 'e9', project_id: P, amount: '700', category: 'salary', description: 'حافز', date: '2026-11-05', month: 4 };
    useStore.setState({ expenses: [{ id: 'e9', projectId: P, amount: 700 } as Expense], revenues: [] });
    useStore.getState().subscribeToProject(P);
    const h = channel.handler as Handler;
    h({ table: 'expenses', eventType: 'INSERT', new: row });
    expect(useStore.getState().expenses.map((e) => e.id)).toEqual(['e9']);
    expect(useStore.getState().expenses.reduce((s, e) => s + e.amount, 0)).toBe(700);
    // And an echo that lands before the local add is not doubled by it either.
    h({ table: 'revenues', eventType: 'INSERT', new: { id: 'r9', project_id: P, amount: '50', description: 'د', date: 'd', month: 1, revenue_type: 'milestone', status: 'collected' } });
    h({ table: 'revenues', eventType: 'INSERT', new: { id: 'r9', project_id: P, amount: '50', description: 'د', date: 'd', month: 1, revenue_type: 'milestone', status: 'collected' } });
    expect(useStore.getState().revenues.map((r) => r.id)).toEqual(['r9']);
  });
});
