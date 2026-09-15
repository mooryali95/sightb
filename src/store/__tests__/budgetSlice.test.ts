/**
 * Unit tests for the budget slice: budget items, expenses and revenues,
 * each written to the database and mirrored in the store, with the funds
 * reloaded whenever an expense moves money. The database is a recorder
 * that keeps every call chain and its options and answers from a queue.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { BudgetItem, Expense, Revenue } from '@/types/project';

interface Call { table: string; options?: unknown; ops: [string, unknown[]][] }
const calls: Call[] = [];
const answers: unknown[] = [];
function builder(table: string, options?: unknown) {
  const call: Call = { table, options, ops: [] };
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
vi.mock('@/services/db', () => ({ db: { from: (table: string, options?: unknown) => builder(table, options) }, unwrap: vi.fn() }));
vi.mock('../helpers', async (orig) => ({ ...(await orig<typeof import('../helpers')>()), getUserId: vi.fn(async () => 'user-1') }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { useStore } from '@/store/useStore';

const P = 'p1';
const argOf = (i: number, op: string) => calls[i].ops.find(([o]) => o === op)?.[1][0];
const ops = (i: number) => calls[i].ops.map(([op, args]) => [op, ...args]);
const loadFundsForProject = vi.fn(async () => {});
const loadResourcePayablesForProject = vi.fn(async () => {});
const expenseRow = (over: Record<string, unknown> = {}) => ({
  id: 'e-db', project_id: P, budget_item_id: null, category: 'salary', description: 'x', amount: '100', date: '2026-03-01', month: 3,
  responsible: null, notes: null, resource_id: null, custody_id: null, approval_status: 'approved', approved_by: null, vendor: null,
  invoice_ref: null, is_vat_exempt: false, fund_id: 'f1', reimburses_payable_id: null, commitment_id: null, source_payment_request_id: null, ...over,
});

beforeEach(() => {
  calls.length = 0;
  answers.length = 0;
  vi.clearAllMocks();
  vi.stubGlobal('crypto', { randomUUID: () => 'uuid-1' });
  useStore.setState({ budgetItems: [], expenses: [], revenues: [], loadFundsForProject, loadResourcePayablesForProject });
});

describe('budget items', () => {
  it('inserts with the defaults, updates only what is given, and deletes', async () => {
    answers.push({ data: { id: 'b1', project_id: P, category: 'salary', description: 'رواتب', planned_amount: '30000', month: null, start_month: 2, end_month: null, cost_type: null, cost_class: null, resource_id: null }, error: null });
    const id = await useStore.getState().addBudgetItem({ projectId: P, category: 'salary', description: 'رواتب', plannedAmount: 30000, startMonth: 2 } as Omit<BudgetItem, 'id'>);
    expect(id).toBe('b1');
    expect(argOf(0, 'insert')).toEqual({ user_id: 'user-1', project_id: P, category: 'salary', description: 'رواتب', planned_amount: 30000, month: null, resource_id: null, start_month: 2, end_month: null, cost_type: 'fixed', cost_class: 'direct' });
    expect(useStore.getState().budgetItems[0]).toMatchObject({ plannedAmount: 30000, startMonth: 2, endMonth: undefined, costType: 'fixed', costClass: 'direct' });

    answers.push({ error: null });
    await useStore.getState().updateBudgetItem('b1', { plannedAmount: 35000, endMonth: 6 });
    expect(argOf(1, 'update')).toEqual({ planned_amount: 35000, end_month: 6 });
    expect(useStore.getState().budgetItems[0]).toMatchObject({ plannedAmount: 35000, endMonth: 6, startMonth: 2 });

    answers.push({ error: null });
    await useStore.getState().deleteBudgetItem('b1');
    expect(ops(2)).toEqual([['delete'], ['eq', 'id', 'b1']]);
    expect(useStore.getState().budgetItems).toEqual([]);
  });
});

describe('expenses', () => {
  it('mints the id, writes the row through the offline-aware path, keeps the server row, and reloads the funds it draws on', async () => {
    answers.push({ data: [expenseRow({ id: 'uuid-1', amount: '100' })], error: null });
    const id = await useStore.getState().addExpense({ projectId: P, category: 'salary', description: 'x', amount: 100, date: '2026-03-01', month: 3, fundId: 'f1', isVatExempt: false } as Omit<Expense, 'id'>);
    expect(id).toBe('uuid-1');
    expect(calls[0].table).toBe('expenses');
    expect(calls[0].options).toEqual({ offline: true });
    expect(argOf(0, 'insert')).toMatchObject({ id: 'uuid-1', user_id: 'user-1', project_id: P, amount: 100, fund_id: 'f1', custody_id: null, approval_status: 'approved', is_vat_exempt: false });
    expect(useStore.getState().expenses[0]).toMatchObject({ id: 'uuid-1', amount: 100, fundId: 'f1' });
    expect(loadFundsForProject).toHaveBeenCalledWith(P);
    expect(loadResourcePayablesForProject).not.toHaveBeenCalled();
  });

  it('keeps the optimistic row when the write was queued offline, without reloading anything', async () => {
    answers.push({ queuedOffline: true, data: null, error: null });
    await useStore.getState().addExpense({ projectId: P, category: 'salary', description: 'ميداني', amount: 50, date: '2026-03-01', month: 3, fundId: 'f1', reimbursesPayableId: 'pay-1' } as Omit<Expense, 'id'>);
    expect(useStore.getState().expenses[0]).toMatchObject({ id: 'uuid-1', description: 'ميداني', amount: 50, fundId: 'f1', reimbursesPayableId: 'pay-1' });
    expect(loadFundsForProject).not.toHaveBeenCalled();
    expect(loadResourcePayablesForProject).not.toHaveBeenCalled();
  });

  it('reloads the payables when the expense repays one', async () => {
    answers.push({ data: [expenseRow({ id: 'uuid-1', fund_id: null, reimburses_payable_id: 'pay-1' })], error: null });
    await useStore.getState().addExpense({ projectId: P, category: 'salary', description: 'x', amount: 100, date: '2026-03-01', month: 3, reimbursesPayableId: 'pay-1' } as Omit<Expense, 'id'>);
    expect(loadFundsForProject).not.toHaveBeenCalled();
    expect(loadResourcePayablesForProject).toHaveBeenCalledWith(P);
  });

  it('clears a link with null on the wire and undefined in the row, and reloads the funds only when money moved', async () => {
    useStore.setState({ expenses: [{ id: 'e1', projectId: P, amount: 100, fundId: 'f1', custodyId: 'c1', description: 'x' } as Expense] });
    answers.push({ error: null });
    await useStore.getState().updateExpense('e1', { description: 'y', custodyId: null });
    expect(argOf(0, 'update')).toEqual({ description: 'y', custody_id: null });
    expect(useStore.getState().expenses[0].custodyId).toBeUndefined();
    expect(useStore.getState().expenses[0].description).toBe('y');
    expect(loadFundsForProject).not.toHaveBeenCalled();

    answers.push({ error: null });
    await useStore.getState().updateExpense('e1', { amount: 120 });
    expect(loadFundsForProject).toHaveBeenCalledWith(P);
  });

  it('deletes and reloads the funds only for a fund-backed expense', async () => {
    useStore.setState({ expenses: [{ id: 'e1', projectId: P, amount: 100, fundId: 'f1' } as Expense, { id: 'e2', projectId: P, amount: 5, custodyId: 'c1' } as Expense] });
    answers.push({ error: null });
    await useStore.getState().deleteExpense('e2');
    expect(loadFundsForProject).not.toHaveBeenCalled();
    answers.push({ error: null });
    await useStore.getState().deleteExpense('e1');
    expect(ops(1)).toEqual([['delete'], ['eq', 'id', 'e1']]);
    expect(loadFundsForProject).toHaveBeenCalledWith(P);
    expect(useStore.getState().expenses).toEqual([]);
  });

  it('throws the database\'s refusal and keeps the store untouched', async () => {
    answers.push({ data: null, error: { message: 'يجب ربط المصروف بدفعة نشطة' } });
    await expect(useStore.getState().addExpense({ projectId: P, category: 'salary', description: 'x', amount: 1, date: 'd', month: 1 } as Omit<Expense, 'id'>)).rejects.toEqual({ message: 'يجب ربط المصروف بدفعة نشطة' });
    expect(useStore.getState().expenses).toEqual([]);
  });
});

describe('revenues', () => {
  it('inserts with the defaults, clears a link or an invoice field with null, and deletes', async () => {
    answers.push({ data: { id: 'r1', project_id: P, description: 'دفعة', amount: '5000', date: '2026-03-01', month: 3, revenue_type: null, status: null, milestone_id: 'm1', invoice_number: 'INV-1', invoice_date: null, collection_date: null }, error: null });
    await useStore.getState().addRevenue({ projectId: P, description: 'دفعة', amount: 5000, date: '2026-03-01', month: 3, milestoneId: 'm1', invoiceNumber: 'INV-1' } as Omit<Revenue, 'id'>);
    expect(argOf(0, 'insert')).toEqual({ user_id: 'user-1', project_id: P, description: 'دفعة', amount: 5000, date: '2026-03-01', month: 3, revenue_type: 'milestone', status: 'collected', milestone_id: 'm1', invoice_number: 'INV-1', invoice_date: null, collection_date: null });
    expect(useStore.getState().revenues[0]).toMatchObject({ revenueType: 'milestone', status: 'collected', milestoneId: 'm1', invoiceNumber: 'INV-1' });

    answers.push({ error: null });
    await useStore.getState().updateRevenue('r1', { status: 'planned', milestoneId: null, invoiceNumber: null });
    expect(argOf(1, 'update')).toEqual({ status: 'planned', milestone_id: null, invoice_number: null });
    const r = useStore.getState().revenues[0];
    expect(r.status).toBe('planned');
    expect(r.milestoneId).toBeUndefined();
    expect(r.invoiceNumber).toBeUndefined();
    expect(r.amount).toBe(5000);

    answers.push({ error: null });
    await useStore.getState().deleteRevenue('r1');
    expect(useStore.getState().revenues).toEqual([]);
  });
});
