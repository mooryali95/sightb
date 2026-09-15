/**
 * Unit tests for the project slice and the baseline slice against the
 * recording database: portfolios and projects written and mirrored, the
 * archive gate on a delete and the sweep of a deleted project's rows, and
 * the baselines cut from the budget with their versions and their one
 * active flag.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { BudgetItem, Commitment, CostBaseline, Expense, Portfolio, Project } from '@/types/project';

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
  for (const op of ['select', 'eq', 'order', 'limit', 'insert', 'update', 'upsert', 'delete', 'single']) {
    b[op] = (...args: unknown[]) => { call.ops.push([op, args]); return b; };
  }
  return b;
}
vi.mock('@/services/db', () => ({ db: { from: (table: string) => builder(table) }, unwrap: vi.fn() }));
vi.mock('../helpers', async (orig) => ({ ...(await orig<typeof import('../helpers')>()), getUserId: vi.fn(async () => 'user-1'), logDeletion: vi.fn(async () => {}) }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { useStore } from '@/store/useStore';

const P = 'p1';
const argOf = (i: number, op: string) => calls[i].ops.find(([o]) => o === op)?.[1][0];
const ops = (i: number) => calls[i].ops.map(([op, args]) => [op, ...args]);
const project = (over: Partial<Project> = {}): Project => ({ id: P, companyId: 'c1', name: 'مشروع', status: 'active', contractValue: 1000, currency: 'SAR', durationMonths: 6, resourceCount: 0, percentComplete: 0, ...over } as Project);
const projectRow = (over: Record<string, unknown> = {}) => ({
  id: 'p-new', user_id: 'user-1', company_id: 'c1', portfolio_id: null, name: 'جديد', description: null, contract_value: '250000', currency: 'SAR',
  start_date: '2026-01-01', end_date: null, duration_months: 12, resource_count: 0, status: 'planning', client_logo: null, contract_type: null,
  retention_percent: '0', management_reserve: '0', tax_percent: '15', vat_inclusive: false, percent_complete: 0, created_at: 'c', updated_at: 'u', ...over,
});

beforeEach(() => {
  calls.length = 0;
  answers.length = 0;
  vi.clearAllMocks();
  useStore.setState({
    portfolios: [], projects: [], budgetItems: [], expenses: [], revenues: [], milestones: [], changeOrders: [], risks: [], resources: [],
    custodies: [], commitments: [], projectFunds: [], fundSettlements: [], baselines: [], indirectCosts: [], snapshots: [],
  });
});

describe('portfolios', () => {
  it('inserts with zeroed targets, clears a text field with null on the wire and undefined in the row, and unlinks its projects on delete', async () => {
    answers.push({ data: { id: 'pf1', company_id: 'c1', name: 'محفظة', description: 'وصف', target_revenue: null, target_margin: '20', fiscal_year: null, notes: null, created_at: 'c' }, error: null });
    await useStore.getState().addPortfolio({ companyId: 'c1', name: 'محفظة', description: 'وصف', targetMargin: 20 } as Omit<Portfolio, 'id' | 'createdAt'>);
    expect(argOf(0, 'insert')).toEqual({ user_id: 'user-1', company_id: 'c1', name: 'محفظة', description: 'وصف', target_revenue: 0, target_margin: 20, fiscal_year: null, notes: null });
    expect(useStore.getState().portfolios[0]).toMatchObject({ targetRevenue: 0, targetMargin: 20, description: 'وصف' });

    answers.push({ error: null });
    await useStore.getState().updatePortfolio('pf1', { description: null, targetRevenue: 5000 });
    expect(argOf(1, 'update')).toEqual({ description: null, target_revenue: 5000 });
    expect(useStore.getState().portfolios[0].description).toBeUndefined();
    expect(useStore.getState().portfolios[0].targetRevenue).toBe(5000);

    useStore.setState({ projects: [project({ portfolioId: 'pf1' }), project({ id: 'p2', portfolioId: 'pf2' })] });
    answers.push({ error: null });
    await useStore.getState().deletePortfolio('pf1');
    expect(useStore.getState().portfolios).toEqual([]);
    expect(useStore.getState().projects.map((p) => p.portfolioId)).toEqual([undefined, 'pf2']);
  });
});

describe('projects', () => {
  it('inserts with the contract defaults, treating "none" as no portfolio', async () => {
    answers.push({ data: projectRow(), error: null });
    const id = await useStore.getState().addProject({ companyId: 'c1', portfolioId: 'none', name: 'جديد', contractValue: 250000, currency: 'SAR', durationMonths: 12, resourceCount: 0, status: 'planning', startDate: '2026-01-01', taxPercent: 0 } as Omit<Project, 'id' | 'createdAt'>);
    expect(id).toBe('p-new');
    expect(argOf(0, 'insert')).toMatchObject({ user_id: 'user-1', portfolio_id: null, contract_type: 'lump_sum', retention_percent: 0, management_reserve: 0, tax_percent: 0, vat_inclusive: false });
    expect(useStore.getState().projects[0]).toMatchObject({ id: 'p-new', contractValue: 250000, durationMonths: 12 });
  });

  it('updates only the fields given, and archives and unarchives by status', async () => {
    useStore.setState({ projects: [project()] });
    answers.push({ error: null });
    await useStore.getState().updateProject(P, { percentComplete: 40, taxPercent: 0 });
    expect(argOf(0, 'update')).toEqual({ percent_complete: 40, tax_percent: 0 });
    expect(useStore.getState().projects[0]).toMatchObject({ percentComplete: 40, taxPercent: 0, name: 'مشروع' });

    answers.push({ error: null });
    await useStore.getState().archiveProject(P);
    expect(argOf(1, 'update')).toEqual({ status: 'archived' });
    expect(useStore.getState().projects[0].status).toBe('archived');
    answers.push({ error: null });
    await useStore.getState().unarchiveProject(P);
    expect(useStore.getState().projects[0].status).toBe('active');
  });

  it('refuses to delete a project that is not archived, without touching the database', async () => {
    useStore.setState({ projects: [project()] });
    await expect(useStore.getState().deleteProject(P)).rejects.toThrow('يجب أرشفة المشروع قبل حذفه نهائياً');
    expect(calls).toHaveLength(0);
  });

  it('sweeps an archived project\'s rows table by table, then the project, and drops every row of it from the store', async () => {
    useStore.setState({
      projects: [project({ status: 'archived' }), project({ id: 'p2' })],
      budgetItems: [{ id: 'b1', projectId: P } as BudgetItem, { id: 'b2', projectId: 'p2' } as BudgetItem],
      expenses: [{ id: 'e1', projectId: P } as Expense],
      commitments: [{ id: 'cm1', projectId: P } as Commitment, { id: 'cm2', projectId: 'p2' } as Commitment],
      baselines: [{ id: 'bl1', projectId: P } as CostBaseline, { id: 'bl2', projectId: 'p2' } as CostBaseline],
    });
    for (let i = 0; i < 11; i++) answers.push({ error: null });
    await useStore.getState().deleteProject(P);
    expect(calls.map((c) => c.table)).toEqual(['risks', 'change_orders', 'milestones', 'revenues', 'expenses', 'budget_items', 'resources', 'custodies', 'commitments', 'cost_baselines', 'projects']);
    expect(ops(0)).toEqual([['delete'], ['eq', 'project_id', P]]);
    expect(ops(10)).toEqual([['delete'], ['eq', 'id', P]]);
    const s = useStore.getState();
    expect(s.projects.map((p) => p.id)).toEqual(['p2']);
    expect(s.budgetItems.map((b) => b.id)).toEqual(['b2']);
    expect(s.expenses).toEqual([]);
    expect(s.commitments.map((c) => c.id)).toEqual(['cm2']);
    expect(s.baselines.map((b) => b.id)).toEqual(['bl2']);
  });
});

describe('baselines', () => {
  const budget = [
    { id: 'b1', projectId: P, category: 'salary', description: 'رواتب', plannedAmount: 30000, costType: 'recurring', startMonth: 1, endMonth: 3 } as BudgetItem,
    { id: 'b2', projectId: P, category: 'travel', description: 'سفر', plannedAmount: 5000, costType: 'fixed' } as BudgetItem,
    { id: 'b-other', projectId: 'p2', category: 'other', description: 'x', plannedAmount: 999 } as BudgetItem,
  ];

  it('refuses a baseline of an empty budget', async () => {
    await expect(useStore.getState().createBaseline(P, 'v1')).rejects.toThrow('لا توجد بنود موازنة لإنشاء خط أساس');
    expect(calls).toHaveLength(0);
  });

  it('cuts the first baseline from the project\'s budget alone, with its total over the months and its items', async () => {
    useStore.setState({ budgetItems: budget });
    answers.push({ data: { id: 'bl1', project_id: P, name: 'v1', version: 1, is_active: true, total_planned: '95000', created_at: 'c' }, error: null });
    answers.push({ data: [{ id: 'i1', baseline_id: 'bl1', category: 'salary', description: 'رواتب', planned_amount: '30000', month: null, start_month: 1, end_month: 3, cost_type: 'recurring' }], error: null });
    const id = await useStore.getState().createBaseline(P, 'v1');
    expect(id).toBe('bl1');
    expect(calls.map((c) => c.table)).toEqual(['cost_baselines', 'baseline_items']);
    // 30,000 a month for three months, plus 5,000 once.
    expect(argOf(0, 'insert')).toEqual({ project_id: P, user_id: 'user-1', name: 'v1', version: 1, is_active: true, total_planned: 95000 });
    const items = argOf(1, 'insert') as Record<string, unknown>[];
    expect(items.map((i) => [i.description, i.planned_amount, i.cost_type, i.start_month])).toEqual([['رواتب', 30000, 'recurring', 1], ['سفر', 5000, 'fixed', null]]);
    expect(useStore.getState().baselines[0]).toMatchObject({ id: 'bl1', version: 1, isActive: true, totalPlanned: 95000 });
    expect(useStore.getState().baselines[0].items).toHaveLength(1);
  });

  it('numbers the next baseline after the highest of the project and retires the others, in the database and in the store', async () => {
    useStore.setState({ budgetItems: budget, baselines: [{ id: 'bl1', projectId: P, version: 3, isActive: true } as CostBaseline, { id: 'bl-other', projectId: 'p2', version: 9, isActive: true } as CostBaseline] });
    answers.push({ error: null });
    answers.push({ data: { id: 'bl4', project_id: P, name: 'v4', version: 4, is_active: true, total_planned: '35000', created_at: 'c' }, error: null });
    answers.push({ data: [], error: null });
    await useStore.getState().createBaseline(P, 'v4');
    expect(calls.map((c) => c.table)).toEqual(['cost_baselines', 'cost_baselines', 'baseline_items']);
    expect(ops(0)).toEqual([['update', { is_active: false }], ['eq', 'project_id', P]]);
    expect(argOf(1, 'insert')).toMatchObject({ version: 4, is_active: true });
    const s = useStore.getState();
    expect(s.baselines.map((b) => [b.id, b.isActive])).toEqual([['bl4', true], ['bl1', false], ['bl-other', true]]);
  });

  it('activates one baseline of a project and no other', async () => {
    useStore.setState({ baselines: [{ id: 'bl1', projectId: P, version: 1, isActive: true } as CostBaseline, { id: 'bl2', projectId: P, version: 2, isActive: false } as CostBaseline, { id: 'bl-other', projectId: 'p2', version: 1, isActive: true } as CostBaseline] });
    answers.push({ error: null }, { error: null });
    await useStore.getState().setActiveBaseline('bl2', P);
    expect(ops(0)).toEqual([['update', { is_active: false }], ['eq', 'project_id', P]]);
    expect(ops(1)).toEqual([['update', { is_active: true }], ['eq', 'id', 'bl2']]);
    expect(useStore.getState().baselines.map((b) => [b.id, b.isActive])).toEqual([['bl1', false], ['bl2', true], ['bl-other', true]]);
  });

  it('replaces one entity\'s snapshot for a period on save, and keeps the rest', async () => {
    useStore.setState({ snapshots: [{ id: 's-old', entityType: 'project', entityId: P, period: '2026-03', snapshotDate: 'd', metrics: {} } as never, { id: 's-other', entityType: 'project', entityId: 'p2', period: '2026-03', snapshotDate: 'd', metrics: {} } as never] });
    answers.push({ data: { id: 's-new', user_id: 'user-1', entity_type: 'project', entity_id: P, period: '2026-03', snapshot_date: '2026-03-31', metrics: { spent: 1 }, created_at: 'c' }, error: null });
    await useStore.getState().saveSnapshot({ entityType: 'project', entityId: P, period: '2026-03', snapshotDate: '2026-03-31', metrics: { spent: 1 } } as never);
    expect(calls[0].ops[0]).toEqual(['upsert', [{ user_id: 'user-1', entity_type: 'project', entity_id: P, period: '2026-03', snapshot_date: '2026-03-31', metrics: { spent: 1 } }, { onConflict: 'entity_type,entity_id,period' }]]);
    expect(useStore.getState().snapshots.map((s) => s.id)).toEqual(['s-new', 's-other']);
  });
});
