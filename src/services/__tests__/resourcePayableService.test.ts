/**
 * Unit tests for the resource payable service: the one module that talks
 * to the four payable tables. It returns raw rows and throws Arabic
 * messages, so what is pinned here is the exact chain each function
 * sends, what it hands back on an empty answer, and which message a
 * failure carries. The client is a recorder that keeps every chain and
 * answers from a queue.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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
  for (const op of ['select', 'eq', 'in', 'order', 'insert', 'update', 'delete', 'single', 'maybeSingle']) {
    b[op] = (...args: unknown[]) => { call.ops.push([op, args]); return b; };
  }
  return b;
}
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => builder(table) } }));

import * as svc from '../resourcePayableService';

const ops = (i = 0) => calls[i].ops.map(([op, args]) => [op, ...args]);
const argOf = (op: string, i = 0) => calls[i].ops.find(([o]) => o === op)?.[1][0];
const P = 'p1';

beforeEach(() => { calls.length = 0; answers.length = 0; });
afterEach(() => { vi.useRealTimers(); });

const reimbursement = (over: Partial<svc.CreateReimbursementInput> = {}): svc.CreateReimbursementInput => ({
  projectId: P, sourceKind: 'resource', resourceId: 'r1', category: 'transport', description: 'وقود',
  amount: 300, expenseDate: '2026-09-10', userId: 'user-1', ...over,
});

describe('creating a reimbursement', () => {
  it('writes a pending claim for a resource with the text trimmed and the defaults filled', async () => {
    answers.push({ data: { id: 'rr-1' }, error: null });
    const row = await svc.createReimbursementRaw(reimbursement({ description: '  وقود  ', notes: '  ', vendorName: 'ignored' }));
    expect(row).toEqual({ id: 'rr-1' });
    expect(calls[0].table).toBe('resource_reimbursements');
    expect(argOf('insert')).toEqual({
      project_id: P, resource_id: 'r1', source_kind: 'resource', vendor_name: null, category: 'transport', description: 'وقود',
      amount: 300, expense_date: '2026-09-10', receipt_attachments: [], budget_item_id: null, notes: null, user_id: 'user-1',
      status: 'pending_review', approved_by: null, approved_at: null,
    });
    expect(ops().slice(1)).toEqual([['select'], ['single']]);
  });

  it('writes a vendor claim with the vendor name trimmed and no resource, approved by the caller when asked', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T10:00:00Z'));
    answers.push({ data: { id: 'rr-2' }, error: null });
    await svc.createReimbursementRaw(reimbursement({
      sourceKind: 'vendor', vendorName: '  شركة النقل ', resourceId: 'r1', autoApprove: true,
      notes: ' عاجل ', receiptAttachments: [{ path: 'a.pdf' }], budgetItemId: 'b1',
    }));
    expect(argOf('insert')).toMatchObject({
      resource_id: null, source_kind: 'vendor', vendor_name: 'شركة النقل', notes: 'عاجل', receipt_attachments: [{ path: 'a.pdf' }],
      budget_item_id: 'b1', status: 'approved', approved_by: 'user-1', approved_at: '2026-09-15T10:00:00.000Z',
    });
  });

  it('writes an empty vendor name rather than null when none was given', async () => {
    answers.push({ data: { id: 'rr-3' }, error: null });
    await svc.createReimbursementRaw(reimbursement({ sourceKind: 'vendor', resourceId: null }));
    expect(argOf('insert')).toMatchObject({ vendor_name: '', resource_id: null });
  });

  it('throws the database message, or the Arabic fallback when there is none', async () => {
    answers.push({ data: null, error: { message: 'duplicate key' } });
    await expect(svc.createReimbursementRaw(reimbursement())).rejects.toThrow('duplicate key');
    answers.push({ data: null, error: { code: '42501' } });
    await expect(svc.createReimbursementRaw(reimbursement())).rejects.toThrow('فشل تسجيل الاسترداد');
  });
});

describe('closing reimbursements', () => {
  it('marks the given ids reimbursed in one update', async () => {
    answers.push({ error: null });
    await svc.closeReimbursementsRaw(['a', 'b']);
    expect(calls[0].table).toBe('resource_reimbursements');
    expect(ops()).toEqual([['update', { status: 'reimbursed' }], ['in', 'id', ['a', 'b']]]);
  });

  it('does not touch the database for an empty list', async () => {
    await svc.closeReimbursementsRaw([]);
    expect(calls).toHaveLength(0);
  });

  it('throws its own message on failure', async () => {
    answers.push({ error: {} });
    await expect(svc.closeReimbursementsRaw(['a'])).rejects.toThrow('فشل إغلاق الاستردادات');
  });
});

describe('the list readers', () => {
  const readers: [string, (p: string) => Promise<unknown[]>, string, string][] = [
    ['reimbursements', svc.listReimbursementsRaw, 'resource_reimbursements', 'فشل تحميل الاستردادات'],
    ['payment requests', svc.listPaymentRequestsRaw, 'payment_requests', 'فشل تحميل طلبات الصرف'],
    ['settlements', svc.listResourceSettlementsRaw, 'resource_settlements', 'فشل تحميل المخالصات'],
  ];

  it.each(readers)('reads the project\'s %s newest first and answers an empty list for no rows', async (_name, list, table) => {
    answers.push({ data: [{ id: 'x' }], error: null });
    expect(await list(P)).toEqual([{ id: 'x' }]);
    expect(calls[0].table).toBe(table);
    expect(ops()).toEqual([['select', '*'], ['eq', 'project_id', P], ['order', 'created_at', { ascending: false }]]);
    answers.push({ data: null, error: null });
    expect(await list(P)).toEqual([]);
  });

  it.each(readers)('fails loading %s with its own message', async (_name, list, _table, message) => {
    answers.push({ data: null, error: {} });
    await expect(list(P)).rejects.toThrow(message);
  });
});

describe('the row writers', () => {
  it.each([
    ['payment request', svc.createPaymentRequestRaw, 'payment_requests', 'فشل إنشاء طلب الصرف'],
    ['settlement expense', svc.createSettlementExpenseRaw, 'expenses', 'فشل إنشاء مصروف التسوية'],
    ['resource settlement', svc.createResourceSettlementRaw, 'resource_settlements', 'فشل إنشاء المخالصة'],
  ] as const)('inserts a %s as given and returns the server row', async (_name, create, table, message) => {
    answers.push({ data: { id: 'new' }, error: null });
    expect(await create({ project_id: P, amount: 5 })).toEqual({ id: 'new' });
    expect(calls[0].table).toBe(table);
    expect(ops()).toEqual([['insert', { project_id: P, amount: 5 }], ['select'], ['single']]);
    answers.push({ data: null, error: {} });
    await expect(create({})).rejects.toThrow(message);
  });

  it.each([
    ['reimbursement', svc.updateReimbursementRaw, 'resource_reimbursements', 'فشل تحديث الاسترداد'],
    ['payment request', svc.updatePaymentRequestRaw, 'payment_requests', 'فشل تحديث طلب الصرف'],
    ['resource settlement', svc.updateResourceSettlementRaw, 'resource_settlements', 'فشل تحديث المخالصة'],
  ] as const)('updates a %s by id and returns the server row', async (_name, update, table, message) => {
    answers.push({ data: { id: 'u1', status: 'paid' }, error: null });
    expect(await update('u1', { status: 'paid' })).toEqual({ id: 'u1', status: 'paid' });
    expect(calls[0].table).toBe(table);
    expect(ops()).toEqual([['update', { status: 'paid' }], ['eq', 'id', 'u1'], ['select'], ['single']]);
    answers.push({ data: null, error: {} });
    await expect(update('u1', {})).rejects.toThrow(message);
  });

  it.each([
    ['reimbursement', svc.deleteReimbursementRaw, 'resource_reimbursements', 'فشل حذف الاسترداد'],
    ['payment request', svc.deletePaymentRequestRaw, 'payment_requests', 'فشل حذف طلب الصرف'],
    ['linked expense', svc.deleteExpenseRaw, 'expenses', 'فشل حذف المصروف المرتبط'],
    ['resource settlement', svc.deleteResourceSettlementRaw, 'resource_settlements', 'فشل حذف المخالصة'],
  ] as const)('deletes a %s by id', async (_name, remove, table, message) => {
    answers.push({ error: null });
    await remove('d1');
    expect(calls[0].table).toBe(table);
    expect(ops()).toEqual([['delete'], ['eq', 'id', 'd1']]);
    answers.push({ error: { message: 'still referenced' } });
    await expect(remove('d1')).rejects.toThrow('still referenced');
    answers.push({ error: {} });
    await expect(remove('d1')).rejects.toThrow(message);
  });
});

describe('settlement events', () => {
  it('records an event without reading it back', async () => {
    answers.push({ error: null });
    await svc.createSettlementEventRaw({ event_type: 'settle', amount: 100 });
    expect(calls[0].table).toBe('settlement_events');
    expect(ops()).toEqual([['insert', { event_type: 'settle', amount: 100 }]]);
    answers.push({ error: {} });
    await expect(svc.createSettlementEventRaw({})).rejects.toThrow('فشل تسجيل حدث التسوية');
  });

  it('reads one event by id and answers null when it is gone', async () => {
    answers.push({ data: { id: 'ev-1' }, error: null });
    expect(await svc.getSettlementEventRaw('ev-1')).toEqual({ id: 'ev-1' });
    expect(ops()).toEqual([['select', '*'], ['eq', 'id', 'ev-1'], ['maybeSingle']]);
    answers.push({ data: null, error: null });
    expect(await svc.getSettlementEventRaw('ev-2')).toBeNull();
    answers.push({ data: null, error: {} });
    await expect(svc.getSettlementEventRaw('ev-3')).rejects.toThrow('فشل تحميل حدث التسوية');
  });

  it('looks for the reverse of an event by its type and target', async () => {
    answers.push({ data: { id: 'rev-1' }, error: null });
    expect(await svc.findReverseEventRaw('ev-1')).toEqual({ id: 'rev-1' });
    expect(calls[0].table).toBe('settlement_events');
    expect(ops()).toEqual([['select', 'id'], ['eq', 'reversed_event_id', 'ev-1'], ['eq', 'event_type', 'reverse'], ['maybeSingle']]);
    answers.push({ data: null, error: null });
    expect(await svc.findReverseEventRaw('ev-1')).toBeNull();
    answers.push({ data: null, error: {} });
    await expect(svc.findReverseEventRaw('ev-1')).rejects.toThrow('فشل التحقق من حالة التراجع');
  });
});
