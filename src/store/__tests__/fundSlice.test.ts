/**
 * Unit tests for the fund slice, the cash core: a fund is created only when
 * the last one is settled (or as a declared emergency), numbered from the
 * database, acknowledged into a draft settlement, submitted, approved or
 * rejected, and deleted with its links undone. The database is a recorder:
 * every call chain is kept and answered from a queue, so the tests read
 * both what the slice sent and what it kept.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Custody, Expense, FundSettlement, ProjectFund } from '@/types/project';

interface Call { table: string; ops: [string, unknown[]][] }
const calls: Call[] = [];
const answers: unknown[] = [];
function builder(table: string) {
  const call: Call = { table, ops: [] };
  calls.push(call);
  const b: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
      const next = answers.shift() ?? { data: null, error: null };
      return Promise.resolve(next).then(resolve, reject);
    },
  };
  for (const op of ['select', 'eq', 'order', 'limit', 'insert', 'update', 'delete', 'single']) {
    b[op] = (...args: unknown[]) => { call.ops.push([op, args]); return b; };
  }
  return b;
}
vi.mock('@/services/db', () => ({ db: { from: (table: string) => builder(table) }, unwrap: vi.fn() }));
vi.mock('../helpers', () => ({ getUserId: vi.fn(async () => 'user-1') }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { useStore } from '@/store/useStore';

const P = 'p1';
const fundRow = (over: Record<string, unknown> = {}) => ({
  id: 'f1', project_id: P, fund_number: 1, amount: '50000', transfer_date: '2026-02-01', status: 'transferred', notes: null,
  created_by: 'user-1', acknowledged_at: null, acknowledged_by: null, created_at: 'c', updated_at: 'u', ...over,
});
const settlementRow = (over: Record<string, unknown> = {}) => ({
  id: 's1', fund_id: 'f1', project_id: P, total_received: '50000', total_spent: '0', remaining_cash: '0', difference: '0',
  settled_by: 'user-1', approved_by: null, settlement_date: null, approval_date: null, status: 'draft', rejection_reason: null,
  difference_reason: null, attachments: [], created_at: 'c', updated_at: 'u', ...over,
});
const fund = (over: Partial<ProjectFund> = {}): ProjectFund => ({
  id: 'f1', projectId: P, fundNumber: 1, amount: 50000, transferDate: '2026-02-01', status: 'transferred', createdBy: 'user-1', createdAt: 'c', updatedAt: 'u', ...over,
});
const settlement = (over: Partial<FundSettlement> = {}): FundSettlement => ({
  id: 's1', fundId: 'f1', projectId: P, totalReceived: 50000, totalSpent: 0, remainingCash: 0, difference: 0, status: 'draft', attachments: [], createdAt: 'c', updatedAt: 'u', ...over,
});
const ops = (i: number) => calls[i].ops.map(([op, args]) => [op, ...args]);
const argOf = (i: number, op: string) => calls[i].ops.find(([o]) => o === op)?.[1][0];

beforeEach(() => {
  calls.length = 0;
  answers.length = 0;
  useStore.setState({ projectFunds: [], fundSettlements: [], expenses: [], custodies: [] });
});

describe('loadFundsForProject', () => {
  it('maps the rows and replaces only that project\'s funds and settlements', async () => {
    useStore.setState({ projectFunds: [fund({ id: 'other', projectId: 'p2' }), fund({ id: 'stale' })], fundSettlements: [settlement({ id: 'st-stale' })] });
    answers.push({ data: [fundRow({ id: 'f-new', amount: '1234.5', notes: 'x' })], error: null }, { data: [settlementRow({ id: 's-new', attachments: [{ name: 'a' }] })], error: null });
    await useStore.getState().loadFundsForProject(P);
    const s = useStore.getState();
    expect(s.projectFunds.map((f) => f.id)).toEqual(['other', 'f-new']);
    expect(s.projectFunds[1]).toMatchObject({ amount: 1234.5, notes: 'x', acknowledgedAt: undefined });
    expect(s.fundSettlements.map((st) => st.id)).toEqual(['s-new']);
    expect(s.fundSettlements[0].attachments).toEqual([{ name: 'a' }]);
    expect(calls.map((c) => c.table)).toEqual(['project_funds', 'fund_settlements']);
  });
});

describe('createFund', () => {
  it('refuses an emergency without a reason before touching the database', async () => {
    await expect(useStore.getState().createFund(P, 100, '2026-03-01', undefined, { emergency: true, emergencyReason: ' ' })).rejects.toThrow('سبب الدفعة الاستثنائية مطلوب');
    expect(calls).toHaveLength(0);
  });

  it('reloads first and refuses while a fund of the project is unsettled', async () => {
    answers.push({ data: [fundRow({ status: 'acknowledged' })], error: null }, { data: [], error: null });
    await expect(useStore.getState().createFund(P, 100, '2026-03-01')).rejects.toThrow('لا يمكن إنشاء دفعة جديدة قبل تسوية الدفعة رقم 1');
    expect(calls).toHaveLength(2);
  });

  it('numbers the fund from the database, inserts it as transferred, and keeps it', async () => {
    answers.push({ data: [fundRow({ status: 'settled' })], error: null }, { data: [], error: null });
    answers.push({ data: [{ fund_number: 4 }], error: null });
    answers.push({ data: fundRow({ id: 'f5', fund_number: 5, amount: '100', notes: 'ملاحظة' }), error: null });
    const id = await useStore.getState().createFund(P, 100, '2026-03-01', ' ملاحظة ');
    expect(id).toBe('f5');
    expect(argOf(3, 'insert')).toEqual({ project_id: P, fund_number: 5, amount: 100, transfer_date: '2026-03-01', notes: 'ملاحظة', created_by: 'user-1', status: 'transferred' });
    expect(useStore.getState().projectFunds.map((f) => [f.id, f.fundNumber])).toEqual([['f1', 1], ['f5', 5]]);
  });

  it('lets an emergency fund through an unsettled one, with its reason in the notes', async () => {
    answers.push({ data: [fundRow({ status: 'acknowledged' })], error: null }, { data: [], error: null });
    answers.push({ data: [{ fund_number: 1 }], error: null });
    answers.push({ data: fundRow({ id: 'f2', fund_number: 2 }), error: null });
    await useStore.getState().createFund(P, 100, '2026-03-01', 'إضافي', { emergency: true, emergencyReason: 'عطل' });
    expect(argOf(3, 'insert')).toMatchObject({ fund_number: 2, notes: '[دفعة استثنائية] عطل — إضافي' });
  });

  it('renumbers once after a duplicate key, and gives up with a plain message on a second one', async () => {
    answers.push({ data: [], error: null }, { data: [], error: null });
    answers.push({ data: [{ fund_number: 1 }], error: null });
    answers.push({ data: null, error: { code: '23505', message: 'duplicate key' } });
    answers.push({ data: [{ fund_number: 2 }], error: null });
    answers.push({ data: fundRow({ id: 'f3', fund_number: 3 }), error: null });
    await useStore.getState().createFund(P, 100, '2026-03-01');
    expect(argOf(3, 'insert')).toMatchObject({ fund_number: 2 });
    expect(argOf(5, 'insert')).toMatchObject({ fund_number: 3 });

    calls.length = 0;
    answers.push({ data: [], error: null }, { data: [], error: null });
    answers.push({ data: [{ fund_number: 3 }], error: null });
    answers.push({ data: null, error: { code: '23505', message: 'duplicate key' } });
    answers.push({ data: [{ fund_number: 3 }], error: null });
    answers.push({ data: null, error: { code: '23505', message: 'duplicate key' } });
    await expect(useStore.getState().createFund(P, 100, '2026-03-01')).rejects.toThrow('تعارض في الترقيم');
  });
});

describe('acknowledgeFund', () => {
  it('refuses an unknown fund and one not in transit', async () => {
    useStore.setState({ projectFunds: [fund({ status: 'acknowledged' })] });
    await expect(useStore.getState().acknowledgeFund('nope')).rejects.toThrow('الدفعة غير موجودة');
    await expect(useStore.getState().acknowledgeFund('f1')).rejects.toThrow('لا يمكن إقرار استلامها');
    expect(calls).toHaveLength(0);
  });

  it('marks the fund acknowledged by the user and opens a draft settlement for its amount', async () => {
    useStore.setState({ projectFunds: [fund()] });
    answers.push({ data: fundRow({ status: 'acknowledged', acknowledged_by: 'user-1', acknowledged_at: 'now' }), error: null });
    answers.push({ data: settlementRow(), error: null });
    await useStore.getState().acknowledgeFund('f1');
    expect(argOf(0, 'update')).toMatchObject({ status: 'acknowledged', acknowledged_by: 'user-1' });
    expect(ops(0)).toContainEqual(['eq', 'id', 'f1']);
    expect(argOf(1, 'insert')).toEqual({ fund_id: 'f1', project_id: P, total_received: 50000, total_spent: 0, remaining_cash: 0, status: 'draft', settled_by: 'user-1', attachments: [] });
    const s = useStore.getState();
    expect(s.projectFunds[0]).toMatchObject({ status: 'acknowledged', acknowledgedBy: 'user-1', acknowledgedAt: 'now' });
    expect(s.fundSettlements).toHaveLength(1);
    expect(s.fundSettlements[0]).toMatchObject({ id: 's1', status: 'draft', totalReceived: 50000 });
  });
});

describe('the settlement', () => {
  it('saves only the draft fields given, clearing an emptied reason', async () => {
    useStore.setState({ fundSettlements: [settlement()] });
    answers.push({ data: settlementRow({ remaining_cash: '400', difference_reason: null }), error: null });
    await useStore.getState().updateSettlementDraft('s1', { remainingCash: 400, differenceReason: '' });
    expect(argOf(0, 'update')).toEqual({ remaining_cash: 400, difference_reason: null });
    expect(useStore.getState().fundSettlements[0].remainingCash).toBe(400);
  });

  it('submits the fund\'s settlement with the cash, the attachments and the trimmed reason', async () => {
    useStore.setState({ fundSettlements: [settlement()] });
    await expect(useStore.getState().submitSettlement('f-none', 1, [], undefined)).rejects.toThrow('التسوية غير موجودة');
    answers.push({ data: settlementRow({ status: 'submitted', remaining_cash: '38000' }), error: null });
    await useStore.getState().submitSettlement('f1', 38000, [{ name: 'فاتورة' }], '  ');
    expect(argOf(0, 'update')).toMatchObject({ remaining_cash: 38000, attachments: [{ name: 'فاتورة' }], difference_reason: null, status: 'submitted' });
    expect(ops(0)).toContainEqual(['eq', 'id', 's1']);
    expect(useStore.getState().fundSettlements[0]).toMatchObject({ status: 'submitted', remainingCash: 38000 });
  });

  it('approves only a submitted settlement, settling its fund in the same breath', async () => {
    useStore.setState({ projectFunds: [fund({ status: 'acknowledged' })], fundSettlements: [settlement({ status: 'draft' })] });
    await expect(useStore.getState().approveSettlement('s1')).rejects.toThrow('ليست في حالة "مُرسلة"');
    useStore.setState({ fundSettlements: [settlement({ status: 'submitted' })] });
    answers.push({ data: settlementRow({ status: 'approved', approved_by: 'user-1', approval_date: 'now' }), error: null });
    answers.push({ data: fundRow({ status: 'settled' }), error: null });
    await useStore.getState().approveSettlement('s1');
    expect(argOf(0, 'update')).toMatchObject({ status: 'approved', approved_by: 'user-1' });
    expect(calls[1].table).toBe('project_funds');
    expect(argOf(1, 'update')).toEqual({ status: 'settled' });
    const s = useStore.getState();
    expect(s.fundSettlements[0]).toMatchObject({ status: 'approved', approvedBy: 'user-1', approvalDate: 'now' });
    expect(s.projectFunds[0].status).toBe('settled');
  });

  it('rejects with a trimmed reason, never without one, and hands the fund back to acknowledged', async () => {
    useStore.setState({ projectFunds: [fund({ status: 'acknowledged' })], fundSettlements: [settlement({ status: 'submitted' })] });
    await expect(useStore.getState().rejectSettlement('s1', '  ')).rejects.toThrow('يجب كتابة سبب الرفض');
    expect(calls).toHaveLength(0);
    answers.push({ data: settlementRow({ status: 'rejected', rejection_reason: 'ناقصة' }), error: null });
    answers.push({ data: fundRow({ status: 'acknowledged' }), error: null });
    await useStore.getState().rejectSettlement('s1', ' ناقصة ');
    expect(argOf(0, 'update')).toEqual({ status: 'rejected', rejection_reason: 'ناقصة' });
    expect(argOf(1, 'update')).toEqual({ status: 'acknowledged' });
    expect(useStore.getState().fundSettlements[0]).toMatchObject({ status: 'rejected', rejectionReason: 'ناقصة' });
  });
});

describe('deleteFund', () => {
  it('unlinks the expenses and custodies first, deletes the fund, and drops it and its settlement from the store', async () => {
    useStore.setState({
      projectFunds: [fund(), fund({ id: 'f2', fundNumber: 2 })],
      fundSettlements: [settlement(), settlement({ id: 's2', fundId: 'f2' })],
      expenses: [{ id: 'e1', fundId: 'f1' } as Expense, { id: 'e2', fundId: 'f2' } as Expense],
      custodies: [{ id: 'c1', sourceFundId: 'f1' } as Custody],
    });
    answers.push({ error: null }, { error: null }, { error: null });
    await useStore.getState().deleteFund('f1');
    expect(calls.map((c) => c.table)).toEqual(['expenses', 'custodies', 'project_funds']);
    expect(argOf(0, 'update')).toEqual({ fund_id: null });
    expect(ops(0)).toContainEqual(['eq', 'fund_id', 'f1']);
    expect(argOf(1, 'update')).toEqual({ source_fund_id: null });
    expect(ops(2)).toEqual([['delete'], ['eq', 'id', 'f1']]);
    const s = useStore.getState();
    expect(s.projectFunds.map((f) => f.id)).toEqual(['f2']);
    expect(s.fundSettlements.map((st) => st.id)).toEqual(['s2']);
    expect(s.expenses.map((e) => e.fundId)).toEqual([undefined, 'f2']);
    expect(s.custodies[0].sourceFundId).toBeUndefined();
  });

  it('stops at the first refused unlink and keeps the fund', async () => {
    useStore.setState({ projectFunds: [fund()] });
    answers.push({ error: { message: 'denied' } });
    await expect(useStore.getState().deleteFund('f1')).rejects.toEqual({ message: 'denied' });
    expect(calls).toHaveLength(1);
    expect(useStore.getState().projectFunds).toHaveLength(1);
  });
});
