/**
 * Unit tests for the tracking slice: milestones, change orders, risks,
 * resources, custodies and commitments, each written to the database and
 * mirrored in the store. The database is a recorder that keeps every call
 * chain and answers from a queue. What costs money here is the change
 * order: an approval adds its budget items to the budget and re-baselines,
 * and that must happen exactly once.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { toast } from 'sonner';
import type { ChangeOrder, Commitment, Custody, Milestone, Project, Resource, Risk } from '@/types/project';

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
vi.mock('../helpers', async (orig) => ({
  ...(await orig<typeof import('../helpers')>()),
  getUserId: vi.fn(async () => 'user-1'),
  logDeletion: vi.fn(async () => {}),
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }) }));

import { useStore } from '@/store/useStore';
import { logDeletion } from '../helpers';

const P = 'p1';
const argOf = (i: number, op: string) => calls[i].ops.find(([o]) => o === op)?.[1][0];
const ops = (i: number) => calls[i].ops.map(([op, args]) => [op, ...args]);
const row = (over: Record<string, unknown>) => ({ id: 'new', project_id: P, created_at: 'c', ...over });

const addBudgetItem = vi.fn(async () => 'bi');
const createBaseline = vi.fn(async () => 'bl');

beforeEach(() => {
  calls.length = 0;
  answers.length = 0;
  vi.clearAllMocks();
  useStore.setState({
    milestones: [], changeOrders: [], risks: [], resources: [], custodies: [], commitments: [], expenses: [], baselines: [],
    projects: [{ id: P, resourceCount: 0 } as Project],
    addBudgetItem, createBaseline,
  });
});

describe('milestones', () => {
  it('inserts with the defaults filled, and keeps the list in sort order', async () => {
    useStore.setState({ milestones: [{ id: 'm2', projectId: P, name: 'b', sortOrder: 2 } as Milestone] });
    answers.push({ data: row({ name: 'a', sort_order: 1, weight: '0.5', status: null, percent_complete: null }), error: null });
    const id = await useStore.getState().addMilestone({ projectId: P, name: 'a', sortOrder: 1, weight: 0.5 } as Omit<Milestone, 'id' | 'createdAt'>);
    expect(id).toBe('new');
    expect(argOf(0, 'insert')).toEqual({
      project_id: P, user_id: 'user-1', name: 'a', description: null, sort_order: 1, planned_start: null, planned_end: null,
      actual_start: null, actual_end: null, percent_complete: 0, weight: 0.5, status: 'planned', linked_revenue_id: null,
    });
    expect(useStore.getState().milestones.map((m) => m.id)).toEqual(['new', 'm2']);
    expect(useStore.getState().milestones[0]).toMatchObject({ weight: 0.5, status: 'planned', percentComplete: 0 });
  });

  it('writes only the fields given and folds a cleared column back to undefined in the row', async () => {
    useStore.setState({ milestones: [{ id: 'm1', projectId: P, name: 'a', sortOrder: 1, plannedEnd: '2026-03-01', description: 'x' } as Milestone] });
    answers.push({ error: null });
    await useStore.getState().updateMilestone('m1', { plannedEnd: null, percentComplete: 40 });
    expect(argOf(0, 'update')).toEqual({ planned_end: null, percent_complete: 40 });
    expect(ops(0)).toContainEqual(['eq', 'id', 'm1']);
    const m = useStore.getState().milestones[0];
    expect(m.plannedEnd).toBeUndefined();
    expect(m).toMatchObject({ percentComplete: 40, description: 'x' });
  });

  it('logs the deletion with the row, deletes it, and drops it from the store', async () => {
    const ms = { id: 'm1', projectId: P, name: 'a', sortOrder: 1 } as Milestone;
    useStore.setState({ milestones: [ms] });
    answers.push({ error: null });
    await useStore.getState().deleteMilestone('m1');
    expect(logDeletion).toHaveBeenCalledWith('milestones', 'm1', ms, P);
    expect(ops(0)).toEqual([['delete'], ['eq', 'id', 'm1']]);
    expect(useStore.getState().milestones).toEqual([]);
  });
});

describe('change orders', () => {
  const items = [{ category: 'salary', description: 'مهندس', plannedAmount: 5000, costType: 'recurring', startMonth: 2, endMonth: 4 }];
  const coRow = (over: Record<string, unknown> = {}) => row({
    description: 'توسعة', change_type: 'scope_addition', amount_impact: '5000', duration_impact: 1, status: 'proposed',
    requested_by: null, approved_by: null, approved_date: null, budget_items_json: JSON.stringify(items), auto_rebaseline: true, ...over,
  });

  it('adds a proposed order without touching the budget', async () => {
    answers.push({ data: coRow(), error: null });
    await useStore.getState().addChangeOrder({ projectId: P, description: 'توسعة', budgetItems: items } as unknown as Omit<ChangeOrder, 'id' | 'createdAt'>);
    expect(argOf(0, 'insert')).toMatchObject({ status: 'proposed', budget_items_json: JSON.stringify(items), auto_rebaseline: true });
    expect(addBudgetItem).not.toHaveBeenCalled();
    expect(createBaseline).not.toHaveBeenCalled();
    expect(useStore.getState().changeOrders[0].budgetItems).toEqual(items);
  });

  it('adds an approved order\'s items to the budget, marked as its own, and re-baselines on the next version', async () => {
    useStore.setState({ baselines: [{ id: 'b', projectId: P, version: 2 } as never, { id: 'b-other', projectId: 'p2', version: 9 } as never] });
    answers.push({ data: coRow({ status: 'approved', description: 'توسعة المكتب الشرقي' }), error: null });
    await useStore.getState().addChangeOrder({ projectId: P, description: 'توسعة المكتب الشرقي', status: 'approved', budgetItems: items } as unknown as Omit<ChangeOrder, 'id' | 'createdAt'>);
    expect(addBudgetItem).toHaveBeenCalledTimes(1);
    expect(addBudgetItem).toHaveBeenCalledWith({
      projectId: P, category: 'salary', description: '[أمر تغيير] مهندس', plannedAmount: 5000, costType: 'recurring', costClass: 'direct', startMonth: 2, endMonth: 4,
    });
    expect(createBaseline).toHaveBeenCalledWith(P, 'v3 — توسعة المكتب الشرقي');
    expect(toast.success).toHaveBeenCalled();
  });

  it('skips the baseline when the order says so, and reports a baseline that failed without losing the items', async () => {
    answers.push({ data: coRow({ status: 'approved', auto_rebaseline: false }), error: null });
    await useStore.getState().addChangeOrder({ projectId: P, description: 'x', status: 'approved', budgetItems: items, autoRebaseline: false } as unknown as Omit<ChangeOrder, 'id' | 'createdAt'>);
    expect(addBudgetItem).toHaveBeenCalledTimes(1);
    expect(createBaseline).not.toHaveBeenCalled();

    createBaseline.mockRejectedValueOnce(new Error('locked'));
    answers.push({ data: coRow({ id: 'co2', status: 'approved' }), error: null });
    await useStore.getState().addChangeOrder({ projectId: P, description: 'y', status: 'approved', budgetItems: items } as unknown as Omit<ChangeOrder, 'id' | 'createdAt'>);
    expect(addBudgetItem).toHaveBeenCalledTimes(2);
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('فشل إنشاء خط الأساس'));
  });

  it('applies the items when a proposed order is approved', async () => {
    useStore.setState({ changeOrders: [{ id: 'co1', projectId: P, description: 'x', status: 'proposed', budgetItems: items, autoRebaseline: false } as unknown as ChangeOrder] });
    answers.push({ error: null });
    await useStore.getState().updateChangeOrder('co1', { status: 'approved', approvedBy: 'admin' });
    expect(argOf(0, 'update')).toEqual({ status: 'approved', approved_by: 'admin' });
    expect(addBudgetItem).toHaveBeenCalledTimes(1);
    expect(useStore.getState().changeOrders[0].status).toBe('approved');
  });

  it('does not add the items again when an already approved order is edited with its status kept', async () => {
    useStore.setState({ changeOrders: [{ id: 'co1', projectId: P, description: 'x', status: 'approved', budgetItems: items, autoRebaseline: true } as unknown as ChangeOrder] });
    answers.push({ error: null });
    await useStore.getState().updateChangeOrder('co1', { description: 'x (مصحّح)', status: 'approved' });
    expect(argOf(0, 'update')).toEqual({ description: 'x (مصحّح)', status: 'approved' });
    expect(addBudgetItem).not.toHaveBeenCalled();
    expect(createBaseline).not.toHaveBeenCalled();
  });
});

describe('risks', () => {
  it('inserts with the defaults and folds a cleared owner back to undefined on update', async () => {
    answers.push({ data: row({ title: 'تأخر', probability: null, impact: null, financial_impact: '1500', category: null, status: null, owner: 'أحمد' }), error: null });
    await useStore.getState().addRisk({ projectId: P, title: 'تأخر', financialImpact: 1500, owner: 'أحمد' } as unknown as Omit<Risk, 'id' | 'createdAt'>);
    expect(argOf(0, 'insert')).toMatchObject({ user_id: 'user-1', project_id: P, portfolio_id: null, probability: 'medium', impact: 'medium', category: 'financial', status: 'open', owner: 'أحمد', financial_impact: 1500 });
    expect(useStore.getState().risks[0]).toMatchObject({ probability: 'medium', financialImpact: 1500, owner: 'أحمد' });

    answers.push({ error: null });
    await useStore.getState().updateRisk('new', { owner: null, status: 'closed' });
    expect(argOf(1, 'update')).toEqual({ owner: null, status: 'closed' });
    expect(useStore.getState().risks[0].owner).toBeUndefined();
    expect(useStore.getState().risks[0].status).toBe('closed');
  });
});

describe('resources', () => {
  it('keeps the project\'s resource count in step when one is added and when one is removed', async () => {
    answers.push({ data: row({ name: 'سالم', role: null, monthly_cost: '10000' }), error: null }, { error: null });
    await useStore.getState().addResource({ projectId: P, name: 'سالم', monthlyCost: 10000 } as Omit<Resource, 'id' | 'createdAt'>);
    expect(calls[1].table).toBe('projects');
    expect(argOf(1, 'update')).toEqual({ resource_count: 1 });
    expect(useStore.getState().projects[0].resourceCount).toBe(1);
    expect(useStore.getState().resources[0]).toMatchObject({ name: 'سالم', role: undefined, monthlyCost: 10000 });

    answers.push({ error: null }, { error: null });
    await useStore.getState().deleteResource('new');
    expect(argOf(3, 'update')).toEqual({ resource_count: 0 });
    expect(useStore.getState().projects[0].resourceCount).toBe(0);
    expect(useStore.getState().resources).toEqual([]);
  });
});

describe('custodies', () => {
  it('inserts an active custody with today as the received date, and surfaces the database\'s overflow message as an error', async () => {
    answers.push({ data: row({ resource_name: 'عمر', amount: '5000', status: 'active', received_date: '2026-03-01', company_id: null, notes: null, source_fund_id: 'f1', closed_date: null }), error: null });
    useStore.setState({ expenses: [{ id: 'e', custodyId: 'new', amount: 1200 } as never] });
    await useStore.getState().addCustody({ projectId: P, resourceName: 'عمر', amount: 5000, sourceFundId: 'f1', status: 'active' } as Omit<Custody, 'id' | 'createdAt' | 'spent' | 'remaining'>);
    expect(argOf(0, 'insert')).toMatchObject({ user_id: 'user-1', project_id: P, resource_name: 'عمر', amount: 5000, status: 'active', source_fund_id: 'f1', received_date: new Date().toISOString().split('T')[0] });
    expect(useStore.getState().custodies[0]).toMatchObject({ spent: 1200, remaining: 3800, sourceFundId: 'f1' });

    answers.push({ data: null, error: { message: 'مبلغ العهدة يتجاوز المتبقي في الدفعة' } });
    await expect(useStore.getState().addCustody({ projectId: P, resourceName: 'x', amount: 1, status: 'active' } as never)).rejects.toThrow('مبلغ العهدة يتجاوز المتبقي في الدفعة');
  });

  it('clears the fund link and the notes with null on the wire and absent in the row', async () => {
    useStore.setState({ custodies: [{ id: 'c1', resourceName: 'عمر', amount: 5000, sourceFundId: 'f1', notes: 'n', status: 'active' } as Custody] });
    answers.push({ error: null });
    await useStore.getState().updateCustody('c1', { sourceFundId: null, notes: null, status: 'closed', closedDate: '' });
    expect(argOf(0, 'update')).toEqual({ source_fund_id: null, notes: null, status: 'closed', closed_date: null });
    const c = useStore.getState().custodies[0];
    expect(c.sourceFundId).toBeUndefined();
    expect(c.notes).toBeUndefined();
    expect(c.status).toBe('closed');
  });
});

describe('commitments', () => {
  it('inserts with the defaults and folds a cleared vendor back to undefined on update', async () => {
    answers.push({ data: row({ description: 'عقد', vendor_name: 'شركة', total_amount: '9000', spent_amount: null, status: null, budget_item_id: null, contract_ref: null, start_date: null, end_date: null, notes: null }), error: null });
    await useStore.getState().addCommitment({ projectId: P, description: 'عقد', vendorName: 'شركة', totalAmount: 9000 } as unknown as Omit<Commitment, 'id' | 'createdAt'>);
    expect(argOf(0, 'insert')).toMatchObject({ user_id: 'user-1', total_amount: 9000, spent_amount: 0, status: 'active', vendor_name: 'شركة' });
    expect(useStore.getState().commitments[0]).toMatchObject({ totalAmount: 9000, spentAmount: 0, status: 'active' });

    answers.push({ error: null });
    await useStore.getState().updateCommitment('new', { vendorName: null, spentAmount: 400 });
    expect(argOf(1, 'update')).toEqual({ vendor_name: null, spent_amount: 400 });
    expect(useStore.getState().commitments[0].vendorName).toBeUndefined();
    expect(useStore.getState().commitments[0].spentAmount).toBe(400);
  });
});
