/**
 * Unit tests for the company slice and the budget amendment slice against
 * the recording database: a company written, cleared, archived and deleted
 * with everything under it; an amendment opened on a snapshot of the
 * budget with its total over the months, cancelled, or approved on a
 * second snapshot.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { BudgetAmendment, BudgetItem, Company, Custody, IndirectCost, Portfolio, Project } from '@/types/project';

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
  for (const op of ['select', 'eq', 'order', 'limit', 'insert', 'update', 'delete', 'single']) {
    b[op] = (...args: unknown[]) => { call.ops.push([op, args]); return b; };
  }
  return b;
}
vi.mock('@/services/db', () => ({ db: { from: (table: string) => builder(table) }, unwrap: vi.fn() }));
vi.mock('../helpers', async (orig) => ({ ...(await orig<typeof import('../helpers')>()), getUserId: vi.fn(async () => 'user-1'), logDeletion: vi.fn(async () => {}) }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { useStore } from '@/store/useStore';

const C = 'c1';
const P = 'p1';
const argOf = (i: number, op: string) => calls[i].ops.find(([o]) => o === op)?.[1][0];
const ops = (i: number) => calls[i].ops.map(([op, args]) => [op, ...args]);

beforeEach(() => {
  calls.length = 0;
  answers.length = 0;
  vi.clearAllMocks();
  useStore.setState({
    companies: [], portfolios: [], projects: [], indirectCosts: [], custodies: [], budgetItems: [], budgetAmendments: [],
    expenses: [], revenues: [], milestones: [], changeOrders: [], risks: [], resources: [], commitments: [], baselines: [], projectFunds: [], fundSettlements: [],
  });
});

describe('companies', () => {
  it('inserts an active company, clears a field with null on the wire and undefined in the row, and archives and unarchives', async () => {
    answers.push({ data: { id: C, name: 'شركة', description: 'وصف', logo: null, status: 'active', created_at: 'c' }, error: null });
    const id = await useStore.getState().addCompany({ name: 'شركة', description: 'وصف' } as Omit<Company, 'id' | 'createdAt'>);
    expect(id).toBe(C);
    expect(argOf(0, 'insert')).toEqual({ user_id: 'user-1', name: 'شركة', description: 'وصف', logo: null, status: 'active' });
    expect(useStore.getState().companies[0]).toMatchObject({ name: 'شركة', description: 'وصف', logo: undefined, status: 'active' });

    answers.push({ error: null });
    await useStore.getState().updateCompany(C, { description: null, name: 'شركة الأفق' });
    expect(argOf(1, 'update')).toEqual({ description: null, name: 'شركة الأفق' });
    expect(useStore.getState().companies[0].description).toBeUndefined();
    expect(useStore.getState().companies[0].name).toBe('شركة الأفق');

    answers.push({ error: null });
    await useStore.getState().archiveCompany(C);
    expect(argOf(2, 'update')).toEqual({ status: 'archived' });
    expect(useStore.getState().companies[0].status).toBe('archived');
    answers.push({ error: null });
    await useStore.getState().unarchiveCompany(C);
    expect(useStore.getState().companies[0].status).toBe('active');
  });

  it('deletes a company after its archived projects, then its portfolios, indirect costs and custodies, and drops all of them from the store', async () => {
    useStore.setState({
      companies: [{ id: C, name: 'x', status: 'active' } as Company, { id: 'c2', name: 'y', status: 'active' } as Company],
      projects: [{ id: P, companyId: C, status: 'archived' } as Project, { id: 'p2', companyId: 'c2', status: 'active' } as Project],
      portfolios: [{ id: 'pf1', companyId: C } as Portfolio, { id: 'pf2', companyId: 'c2' } as Portfolio],
      indirectCosts: [{ id: 'ic1', companyId: C } as IndirectCost],
      custodies: [{ id: 'cu1', companyId: C, resourceName: 'عهدة شركة' } as Custody, { id: 'cu2', projectId: 'p2', resourceName: 'أخرى' } as Custody],
    });
    for (let i = 0; i < 15; i++) answers.push({ error: null });
    await useStore.getState().deleteCompany(C);
    const tables = calls.map((c) => c.table);
    expect(tables.slice(-4)).toEqual(['portfolios', 'indirect_costs', 'custodies', 'companies']);
    expect(tables).toContain('projects');
    expect(ops(calls.length - 1)).toEqual([['delete'], ['eq', 'id', C]]);
    const s = useStore.getState();
    expect(s.companies.map((c) => c.id)).toEqual(['c2']);
    expect(s.projects.map((p) => p.id)).toEqual(['p2']);
    expect(s.portfolios.map((p) => p.id)).toEqual(['pf2']);
    expect(s.indirectCosts).toEqual([]);
    expect(s.custodies.map((c) => c.id)).toEqual(['cu2']);
  });

  it('stops before touching the database when one of the company\'s projects is not archived', async () => {
    useStore.setState({
      companies: [{ id: C, name: 'x', status: 'active' } as Company],
      projects: [{ id: P, companyId: C, status: 'active' } as Project],
    });
    await expect(useStore.getState().deleteCompany(C)).rejects.toThrow('يجب أرشفة المشروع قبل حذفه نهائياً');
    expect(calls).toHaveLength(0);
    expect(useStore.getState().companies).toHaveLength(1);
  });
});

describe('budget amendments', () => {
  const budget = [
    { id: 'b1', projectId: P, category: 'salary', description: 'رواتب', plannedAmount: 10000, costType: 'recurring', costClass: 'direct', startMonth: 1, endMonth: 3 } as BudgetItem,
    { id: 'b2', projectId: P, category: 'travel', description: 'سفر', plannedAmount: 4000, costType: 'fixed', costClass: 'direct' } as BudgetItem,
    { id: 'b-other', projectId: 'p2', category: 'other', description: 'x', plannedAmount: 999, costType: 'fixed', costClass: 'direct' } as BudgetItem,
  ];
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'a1', project_id: P, reason: 'سبب', snapshot_before: [], snapshot_after: null, total_before: '34000', total_after: null,
    status: 'draft', approved_by: null, approved_at: null, created_at: 'c', updated_at: 'u', ...over,
  });

  it('opens on a snapshot of the project\'s budget alone, totalled over the months, with the trimmed reason', async () => {
    useStore.setState({ budgetItems: budget });
    answers.push({ data: row({ snapshot_before: [{ id: 'b1' }, { id: 'b2' }] }), error: null });
    const id = await useStore.getState().openBudgetAmendment(P, '  إعادة توزيع  ');
    expect(id).toBe('a1');
    const inserted = argOf(0, 'insert') as Record<string, unknown>;
    expect(inserted).toMatchObject({ user_id: 'user-1', project_id: P, reason: 'إعادة توزيع', total_before: 34000, status: 'draft' });
    expect((inserted.snapshot_before as { id: string; plannedAmount: number }[]).map((i) => [i.id, i.plannedAmount])).toEqual([['b1', 10000], ['b2', 4000]]);
    expect(useStore.getState().budgetAmendments[0]).toMatchObject({ id: 'a1', status: 'draft', totalBefore: 34000, totalAfter: undefined });
    expect(useStore.getState().budgetAmendments[0].snapshotBefore).toHaveLength(2);
  });

  it('cancels a draft and leaves the others alone', async () => {
    useStore.setState({ budgetAmendments: [{ id: 'a1', projectId: P, status: 'draft' } as BudgetAmendment, { id: 'a2', projectId: P, status: 'approved' } as BudgetAmendment] });
    answers.push({ error: null });
    await useStore.getState().cancelBudgetAmendment('a1');
    expect(ops(0)).toEqual([['update', { status: 'cancelled' }], ['eq', 'id', 'a1']]);
    expect(useStore.getState().budgetAmendments.map((a) => a.status)).toEqual(['cancelled', 'approved']);
  });

  it('approves on a second snapshot of the budget as it stands now, with who approved it', async () => {
    useStore.setState({ budgetItems: budget.map((b) => (b.id === 'b2' ? { ...b, plannedAmount: 6000 } : b)), budgetAmendments: [{ id: 'a1', projectId: P, status: 'draft', totalBefore: 34000, snapshotBefore: [] } as unknown as BudgetAmendment] });
    await expect(useStore.getState().approveBudgetAmendment('nope')).rejects.toThrow('التعديل غير موجود');
    answers.push({ data: row({ status: 'approved', total_after: '36000', approved_by: 'admin', approved_at: 'now', snapshot_after: [{ id: 'b1' }, { id: 'b2' }] }), error: null });
    await useStore.getState().approveBudgetAmendment('a1', 'admin');
    const updated = argOf(0, 'update') as Record<string, unknown>;
    expect(updated).toMatchObject({ total_after: 36000, status: 'approved', approved_by: 'admin' });
    expect((updated.snapshot_after as { plannedAmount: number }[]).map((i) => i.plannedAmount)).toEqual([10000, 6000]);
    expect(useStore.getState().budgetAmendments[0]).toMatchObject({ status: 'approved', totalAfter: 36000, approvedBy: 'admin', approvedAt: 'now' });
  });

  it('loads a project\'s amendments newest first and replaces only that project\'s', async () => {
    useStore.setState({ budgetAmendments: [{ id: 'stale', projectId: P } as BudgetAmendment, { id: 'keep', projectId: 'p2' } as BudgetAmendment] });
    answers.push({ data: [row({ id: 'a9', total_after: null })], error: null });
    const list = await useStore.getState().loadBudgetAmendments(P);
    expect(ops(0)).toEqual([['select', '*'], ['eq', 'project_id', P], ['order', 'created_at', { ascending: false }]]);
    expect(list.map((a) => a.id)).toEqual(['a9']);
    expect(useStore.getState().budgetAmendments.map((a) => a.id)).toEqual(['keep', 'a9']);
  });
});
