/**
 * Unit tests for the resource payable slice, the ledger of what the
 * project owes its people and vendors: reimbursements, payment requests
 * through their lifecycle to payment, advances settled by document, by
 * deduction, by write-off or by cash refund and reversed, and the signed
 * settlement that closes what it covers. The service layer is stood in
 * whole, so every test reads what the slice sent and what it kept.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Expense, PaymentRequest, Project, ResourceReimbursement, ResourceSettlement } from '@/types/project';

vi.mock('@/services/resourcePayableService', () => ({
  listReimbursementsRaw: vi.fn(async () => []), listPaymentRequestsRaw: vi.fn(async () => []), listResourceSettlementsRaw: vi.fn(async () => []),
  createReimbursementRaw: vi.fn(), updateReimbursementRaw: vi.fn(), closeReimbursementsRaw: vi.fn(async () => {}), deleteReimbursementRaw: vi.fn(async () => {}),
  createPaymentRequestRaw: vi.fn(), updatePaymentRequestRaw: vi.fn(), deletePaymentRequestRaw: vi.fn(async () => {}),
  createSettlementExpenseRaw: vi.fn(), deleteExpenseRaw: vi.fn(async () => {}), createSettlementEventRaw: vi.fn(async () => {}),
  getSettlementEventRaw: vi.fn(), findReverseEventRaw: vi.fn(async () => null),
  createResourceSettlementRaw: vi.fn(), updateResourceSettlementRaw: vi.fn(), deleteResourceSettlementRaw: vi.fn(async () => {}),
}));
vi.mock('@/services/paymentRequestService', () => ({
  getPaymentRequestRaw: vi.fn(async () => null), listSettlementEventsRaw: vi.fn(async () => []), getExpenseRaw: vi.fn(async () => null),
}));
vi.mock('@/services/advanceSettlementService', () => ({ splitSettle: vi.fn() }));
vi.mock('../helpers', async (orig) => ({ ...(await orig<typeof import('../helpers')>()), getUserId: vi.fn(async () => 'user-1') }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import * as svc from '@/services/resourcePayableService';
import * as prs from '@/services/paymentRequestService';
import * as adv from '@/services/advanceSettlementService';
import { useStore } from '@/store/useStore';

const P = 'p1';
const reimbRow = (over: Record<string, unknown> = {}) => ({
  id: 'rb1', project_id: P, resource_id: 'r1', source_kind: 'resource', vendor_name: null, category: 'travel', description: 'تذاكر', amount: '300',
  expense_date: '2026-03-01', receipt_attachments: [], budget_item_id: null, status: 'submitted', notes: null, rejection_reason: null,
  approved_by: null, approved_at: null, payment_request_id: null, settled_expense_id: null, settled_at: null, created_at: 'c', updated_at: 'u', ...over,
});
const reqRow = (over: Record<string, unknown> = {}) => ({
  id: 'pr1', project_id: P, resource_id: 'r1', request_type: 'advance', amount: '2000', currency: null, description: 'سلفة', justification: null,
  linked_reimbursement_ids: [], linked_fund_id: null, paid_from_fund_id: 'f1', paid_from_custody_id: null, budget_item_id: null, priority: 'normal',
  status: 'draft', requested_by: 'user-1', requested_at: null, reviewed_by: null, reviewed_at: null, review_notes: null, approved_by: null, approved_at: null,
  approval_notes: null, scheduled_date: null, paid_date: null, payment_method: null, payment_reference: null, payment_attachments: [], rejection_reason: null,
  auto_created_expense_id: null, is_advance_outstanding: false, advance_settled_at: null, advance_settled_by: null, settlement_type: null, settled_amount: null,
  settlement_notes: null, refund_to_fund_id: null, refund_to_custody_id: null, refunded_amount: null, created_at: 'c', updated_at: 'u', ...over,
});
const settleRow = (over: Record<string, unknown> = {}) => ({
  id: 's1', resource_id: 'r1', project_id: P, period_from: null, period_to: null, total_owed: '900', total_paid: '400', balance: '500',
  linked_reimbursement_ids: ['rb1', 'rb2'], linked_payment_ids: [], settlement_text_ar: null, status: 'draft', signed_by_resource: false,
  signature_attachment: null, signed_at: null, notes: null, created_by: 'user-1', created_at: 'c', updated_at: 'u', ...over,
});
const advance = (over: Partial<PaymentRequest> = {}): PaymentRequest => ({
  id: 'pr1', projectId: P, resourceId: 'r1', requestType: 'advance', amount: 2000, currency: 'ر.س', description: 'سلفة', linkedReimbursementIds: [],
  paidFromFundId: 'f1', priority: 'normal', status: 'paid', requestedBy: 'user-1', paymentAttachments: [], isAdvanceOutstanding: true, refundedAmount: 500,
  createdAt: 'c', updatedAt: 'u', ...over,
} as PaymentRequest);
const lastPayload = (fn: unknown) => (fn as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1] as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(prs.getPaymentRequestRaw).mockResolvedValue(null);
  vi.mocked(prs.getExpenseRaw).mockResolvedValue(null);
  vi.mocked(prs.listSettlementEventsRaw).mockResolvedValue([]);
  useStore.setState({
    reimbursements: [], paymentRequests: [], resourceSettlements: [], settlementEvents: [], expenses: [],
    projects: [{ id: P, startDate: '2026-01-01', durationMonths: 12 } as Project],
  });
});

describe('the load', () => {
  it('replaces the project\'s rows in the three lists and keeps the others', async () => {
    useStore.setState({ reimbursements: [{ id: 'keep', projectId: 'p2' } as unknown as ResourceReimbursement, { id: 'stale', projectId: P } as unknown as ResourceReimbursement] });
    vi.mocked(svc.listReimbursementsRaw).mockResolvedValue([reimbRow()] as never);
    vi.mocked(svc.listPaymentRequestsRaw).mockResolvedValue([reqRow()] as never);
    vi.mocked(svc.listResourceSettlementsRaw).mockResolvedValue([settleRow()] as never);
    await useStore.getState().loadResourcePayablesForProject(P);
    const s = useStore.getState();
    expect(s.reimbursements.map((r) => r.id)).toEqual(['keep', 'rb1']);
    expect(s.paymentRequests[0]).toMatchObject({ id: 'pr1', amount: 2000, currency: 'ر.س', refundedAmount: 0, isAdvanceOutstanding: false });
    expect(s.resourceSettlements[0]).toMatchObject({ id: 's1', balance: 500, signedByResource: false });
  });
});

describe('reimbursements', () => {
  it('insists on a resource for a resource claim and a name for a vendor claim, then creates with the user', async () => {
    const base = { projectId: P, category: 'travel', description: 'تذاكر', amount: 300, expenseDate: '2026-03-01' };
    await expect(useStore.getState().createReimbursement(base)).rejects.toThrow('resourceId required');
    await expect(useStore.getState().createReimbursement({ ...base, sourceKind: 'vendor', vendorName: ' ' })).rejects.toThrow('vendorName required');
    expect(svc.createReimbursementRaw).not.toHaveBeenCalled();
    vi.mocked(svc.createReimbursementRaw).mockResolvedValue(reimbRow() as never);
    const id = await useStore.getState().createReimbursement({ ...base, resourceId: 'r1', autoApprove: true });
    expect(id).toBe('rb1');
    expect(svc.createReimbursementRaw).toHaveBeenCalledWith(expect.objectContaining({ projectId: P, resourceId: 'r1', sourceKind: 'resource', vendorName: null, amount: 300, userId: 'user-1', autoApprove: true, budgetItemId: null }));
    expect(useStore.getState().reimbursements[0]).toMatchObject({ id: 'rb1', amount: 300, sourceKind: 'resource' });
  });

  it('approves by the user, rejects only with a trimmed reason, and edits only the fields given', async () => {
    useStore.setState({ reimbursements: [{ id: 'rb1', projectId: P, status: 'submitted' } as unknown as ResourceReimbursement] });
    vi.mocked(svc.updateReimbursementRaw).mockResolvedValue(reimbRow({ status: 'approved', approved_by: 'user-1' }) as never);
    await useStore.getState().approveReimbursement('rb1');
    expect(lastPayload(svc.updateReimbursementRaw)).toMatchObject({ status: 'approved', approved_by: 'user-1', rejection_reason: null });
    expect(useStore.getState().reimbursements[0].status).toBe('approved');

    await expect(useStore.getState().rejectReimbursement('rb1', '  ')).rejects.toThrow('سبب الرفض مطلوب');
    vi.mocked(svc.updateReimbursementRaw).mockResolvedValue(reimbRow({ status: 'rejected', rejection_reason: 'بلا إيصال' }) as never);
    await useStore.getState().rejectReimbursement('rb1', ' بلا إيصال ');
    expect(lastPayload(svc.updateReimbursementRaw)).toMatchObject({ status: 'rejected', rejection_reason: 'بلا إيصال' });

    vi.mocked(svc.updateReimbursementRaw).mockResolvedValue(reimbRow({ amount: '350', notes: null }) as never);
    await useStore.getState().updateReimbursement('rb1', { amount: 350, notes: '' });
    expect(lastPayload(svc.updateReimbursementRaw)).toEqual({ amount: 350, notes: null });
    expect(useStore.getState().reimbursements[0].amount).toBe(350);
  });
});

describe('payment requests', () => {
  it('creates a draft with the trimmed text and the defaults, and skips an edit that changes nothing', async () => {
    vi.mocked(svc.createPaymentRequestRaw).mockResolvedValue(reqRow() as never);
    await useStore.getState().createPaymentRequest({ projectId: P, resourceId: 'r1', requestType: 'advance', amount: 2000, description: ' سلفة ', justification: ' ' });
    expect(svc.createPaymentRequestRaw).toHaveBeenCalledWith({
      project_id: P, resource_id: 'r1', request_type: 'advance', amount: 2000, description: 'سلفة', justification: null, linked_reimbursement_ids: [],
      priority: 'normal', budget_item_id: null, status: 'draft', requested_by: 'user-1', user_id: 'user-1',
    });
    await useStore.getState().updatePaymentRequest('pr1', { status: 'paid' } as Partial<PaymentRequest>);
    expect(svc.updatePaymentRequestRaw).not.toHaveBeenCalled();
  });

  it('walks the lifecycle with the user and the trimmed notes, and refuses a rejection without a reason', async () => {
    useStore.setState({ paymentRequests: [advance({ status: 'draft', isAdvanceOutstanding: false })] });
    vi.mocked(svc.updatePaymentRequestRaw).mockImplementation(async (_id, payload) => reqRow(payload as Record<string, unknown>) as never);
    await useStore.getState().submitPaymentRequest('pr1');
    expect(lastPayload(svc.updatePaymentRequestRaw)).toMatchObject({ status: 'submitted' });
    await useStore.getState().reviewPaymentRequest('pr1', ' يُراجع ');
    expect(lastPayload(svc.updatePaymentRequestRaw)).toMatchObject({ status: 'under_review', reviewed_by: 'user-1', review_notes: 'يُراجع' });
    await useStore.getState().approvePaymentRequest('pr1');
    expect(lastPayload(svc.updatePaymentRequestRaw)).toMatchObject({ status: 'approved', approved_by: 'user-1', approval_notes: null });
    await useStore.getState().schedulePaymentRequest('pr1', '2026-04-01');
    expect(lastPayload(svc.updatePaymentRequestRaw)).toEqual({ status: 'scheduled', scheduled_date: '2026-04-01' });
    expect(useStore.getState().paymentRequests[0]).toMatchObject({ status: 'scheduled', scheduledDate: '2026-04-01' });
    await expect(useStore.getState().rejectPaymentRequest('pr1', ' ')).rejects.toThrow('سبب الرفض مطلوب');
    await useStore.getState().cancelPaymentRequest('pr1');
    expect(useStore.getState().paymentRequests[0].status).toBe('cancelled');
  });

  it('refuses to cancel a paid request, whose cash and expense already moved', async () => {
    useStore.setState({ paymentRequests: [advance({ status: 'paid' })] });
    await expect(useStore.getState().cancelPaymentRequest('pr1')).rejects.toThrow('لا يُلغى طلب مدفوع');
    expect(svc.updatePaymentRequestRaw).not.toHaveBeenCalled();
  });

  it('pays from one source, reloads the payables, and brings the expense the database created', async () => {
    useStore.setState({ paymentRequests: [advance({ status: 'scheduled', isAdvanceOutstanding: false })] });
    vi.mocked(svc.updatePaymentRequestRaw).mockResolvedValue(reqRow({ status: 'paid', paid_date: '2026-04-02', auto_created_expense_id: 'e-auto', is_advance_outstanding: true }) as never);
    vi.mocked(prs.getExpenseRaw).mockResolvedValue({ id: 'e-auto', project_id: P, amount: '2000', category: 'salary', description: 'x', date: 'd', month: 4 } as never);
    await useStore.getState().payPaymentRequest('pr1', { paidDate: '2026-04-02', paymentMethod: 'cash', paymentReference: ' REF-1 ', paidFromCustodyId: 'c1' });
    expect(lastPayload(svc.updatePaymentRequestRaw)).toEqual({ status: 'paid', paid_date: '2026-04-02', payment_method: 'cash', payment_reference: 'REF-1', payment_attachments: [], paid_from_fund_id: null, paid_from_custody_id: 'c1' });
    expect(svc.listPaymentRequestsRaw).toHaveBeenCalledWith(P);
    expect(useStore.getState().expenses.map((e) => e.id)).toEqual(['e-auto']);

    vi.mocked(prs.getExpenseRaw).mockRejectedValueOnce(new Error('gone'));
    await expect(useStore.getState().payPaymentRequest('pr1', { paidDate: '2026-04-02', paymentMethod: 'cash' })).rejects.toThrow('تم تسجيل الدفع لكن فشل تحميل المصروف التلقائي');
  });

  it('drops the auto-created expense with a deleted request', async () => {
    useStore.setState({ paymentRequests: [advance({ autoCreatedExpenseId: 'e-auto' })], expenses: [{ id: 'e-auto', projectId: P } as Expense, { id: 'e-keep', projectId: P } as Expense] });
    await useStore.getState().deletePaymentRequest('pr1');
    expect(svc.deletePaymentRequestRaw).toHaveBeenCalledWith('pr1');
    expect(useStore.getState().paymentRequests).toEqual([]);
    expect(useStore.getState().expenses.map((e) => e.id)).toEqual(['e-keep']);
  });
});

describe('settling an advance', () => {
  it('refuses a non-advance, a settled one, and an amount outside what is outstanding', async () => {
    useStore.setState({ paymentRequests: [advance({ id: 'pay', requestType: 'salary' }), advance({ id: 'done', isAdvanceOutstanding: false }), advance()] });
    const settle = useStore.getState().settleAdvance;
    await expect(settle('nope', { type: 'cash_refund' })).rejects.toThrow('طلب الصرف غير موجود');
    await expect(settle('pay', { type: 'cash_refund' })).rejects.toThrow('متاحة للسلف فقط');
    await expect(settle('done', { type: 'cash_refund' })).rejects.toThrow('مسوّاة بالفعل');
    await expect(settle('pr1', { type: 'cash_refund', settledAmount: 1501 })).rejects.toThrow('مبلغ التسوية غير صحيح');
    await expect(settle('pr1', { type: 'cash_refund', settledAmount: 0 })).rejects.toThrow('مبلغ التسوية غير صحيح');
    expect(svc.createSettlementEventRaw).not.toHaveBeenCalled();
  });

  it('books a documented settlement as an approved expense in the project\'s month from the advance\'s source, then the event', async () => {
    vi.useFakeTimers({ now: new Date('2026-03-15T10:00:00Z'), toFake: ['Date'] });
    useStore.setState({ paymentRequests: [advance({ paidFromFundId: 'f1', budgetItemId: 'b1' })] });
    vi.mocked(svc.createSettlementExpenseRaw).mockResolvedValue({ id: 'e-doc' } as never);
    // First read: still outstanding (the guard); then the row the trigger settled.
    vi.mocked(prs.getPaymentRequestRaw).mockResolvedValueOnce(reqRow({ status: 'paid', is_advance_outstanding: true, refunded_amount: '500', budget_item_id: 'b1' }) as never);
    vi.mocked(prs.getPaymentRequestRaw).mockResolvedValue(reqRow({ is_advance_outstanding: false, refunded_amount: '2000' }) as never);
    vi.mocked(prs.getExpenseRaw).mockResolvedValue({ id: 'e-doc', project_id: P, amount: '1500', category: 'travel', description: 'x', date: 'd', month: 3 } as never);
    vi.mocked(prs.listSettlementEventsRaw).mockResolvedValue([{ id: 'ev1', payment_request_id: 'pr1', project_id: P, event_type: 'documented', amount: '1500', created_by: 'user-1', created_at: 'c' }] as never);
    await useStore.getState().settleAdvance('pr1', { type: 'documented', expenseCategory: 'travel', notes: 'فواتير' });
    expect(svc.createSettlementExpenseRaw).toHaveBeenCalledWith(expect.objectContaining({
      project_id: P, resource_id: 'r1', category: 'travel', description: 'تسوية سلفة بمستندات: سلفة', amount: 1500, month: 3, approval_status: 'approved',
      is_vat_exempt: false, fund_id: 'f1', custody_id: null, budget_item_id: 'b1', source_payment_request_id: 'pr1',
    }));
    expect(svc.createSettlementEventRaw).toHaveBeenCalledWith(expect.objectContaining({ event_type: 'documented', amount: 1500, expense_id: 'e-doc', refund_to_fund_id: null, notes: 'فواتير' }));
    const s = useStore.getState();
    expect(s.paymentRequests[0]).toMatchObject({ isAdvanceOutstanding: false, refundedAmount: 2000 });
    expect(s.expenses.map((e) => e.id)).toEqual(['e-doc']);
    expect(s.settlementEvents.map((e) => e.eventType)).toEqual(['documented']);
    vi.useRealTimers();
  });

  it('reads the advance from the database first: one settled in another tab is not settled again', async () => {
    useStore.setState({ paymentRequests: [advance()] });
    vi.mocked(prs.getPaymentRequestRaw).mockResolvedValueOnce(reqRow({ is_advance_outstanding: false }) as never);
    await expect(useStore.getState().settleAdvance('pr1', { type: 'documented' })).rejects.toThrow('السلفة مسوّاة بالفعل');
    expect(svc.createSettlementExpenseRaw).not.toHaveBeenCalled();
  });

  it('undoes the settlement expense when its event is refused, so the cost is not counted twice', async () => {
    useStore.setState({ paymentRequests: [advance()] });
    vi.mocked(svc.createSettlementExpenseRaw).mockResolvedValue({ id: 'e-orphan' } as never);
    vi.mocked(svc.createSettlementEventRaw).mockRejectedValueOnce(new Error('refused'));
    await expect(useStore.getState().settleAdvance('pr1', { type: 'documented' })).rejects.toThrow('refused');
    expect(svc.deleteExpenseRaw).toHaveBeenCalledWith('e-orphan');
  });

  it('refunds cash to the source it came from with no expense, and writes a deduction off as VAT-exempt salary', async () => {
    // A legacy row carrying both links: the custody wins and the fund is never charged again.
    useStore.setState({ paymentRequests: [advance({ paidFromFundId: 'f1', paidFromCustodyId: 'c1' })] });
    await useStore.getState().settleAdvance('pr1', { type: 'cash_refund', settledAmount: 400 });
    expect(svc.createSettlementExpenseRaw).not.toHaveBeenCalled();
    expect(svc.createSettlementEventRaw).toHaveBeenCalledWith(expect.objectContaining({ event_type: 'cash_refund', amount: 400, refund_to_fund_id: 'f1', refund_to_custody_id: 'c1', expense_id: null }));

    vi.mocked(svc.createSettlementExpenseRaw).mockResolvedValue({ id: 'e-ded' } as never);
    await useStore.getState().settleAdvance('pr1', { type: 'payroll_deduction' });
    expect(svc.createSettlementExpenseRaw).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'salary', is_vat_exempt: true, custody_id: 'c1', fund_id: null, amount: 1500 }));
  });

  it('splits an invoice above the outstanding into the settlement and an overflow expense from the chosen source', async () => {
    useStore.setState({ paymentRequests: [advance()] });
    await expect(useStore.getState().settleAdvanceWithSplit('pr1', { invoiceAmount: 1500, overflowSource: { fundId: 'f1' }, expenseCategory: 'travel' })).rejects.toThrow('لا تتجاوز المتبقي');
    vi.mocked(adv.splitSettle).mockResolvedValue({ expenseId: 'e-over' } as never);
    vi.mocked(prs.getExpenseRaw).mockResolvedValue({ id: 'e-over', project_id: P, amount: '700', category: 'travel', description: 'x', date: 'd', month: 3 } as never);
    await useStore.getState().settleAdvanceWithSplit('pr1', { invoiceAmount: 2200, overflowSource: { custodyId: 'c9' }, expenseCategory: 'travel' });
    expect(adv.splitSettle).toHaveBeenCalledWith(expect.objectContaining({ paymentRequestId: 'pr1', settleAmount: 1500, overflowAmount: 700, overflowSource: { fundId: null, custodyId: 'c9' }, description: 'فائض فاتورة سلفة: سلفة' }));
    expect(useStore.getState().expenses.map((e) => e.id)).toEqual(['e-over']);
  });

  it('reverses an event only once, with a reason, deleting the expense it booked', async () => {
    useStore.setState({ expenses: [{ id: 'e-doc', projectId: P } as Expense] });
    const reverse = useStore.getState().reverseSettlementEvent;
    await expect(reverse('ev1', ' ')).rejects.toThrow('سبب التراجع مطلوب');
    vi.mocked(svc.getSettlementEventRaw).mockResolvedValueOnce(null);
    await expect(reverse('ev1', 'خطأ')).rejects.toThrow('الحدث غير موجود');
    vi.mocked(svc.getSettlementEventRaw).mockResolvedValueOnce({ id: 'ev0', event_type: 'reverse' } as never);
    await expect(reverse('ev0', 'خطأ')).rejects.toThrow('لا يمكن التراجع عن حدث تراجع');
    vi.mocked(svc.getSettlementEventRaw).mockResolvedValue({ id: 'ev1', event_type: 'documented', amount: '1500', payment_request_id: 'pr1', project_id: P, expense_id: 'e-doc' } as never);
    vi.mocked(svc.findReverseEventRaw).mockResolvedValueOnce({ id: 'ev2' } as never);
    await expect(reverse('ev1', 'خطأ')).rejects.toThrow('ملغى بالفعل');
    expect(svc.createSettlementEventRaw).not.toHaveBeenCalled();

    await reverse('ev1', ' خطأ في المبلغ ');
    expect(svc.deleteExpenseRaw).toHaveBeenCalledWith('e-doc');
    expect(useStore.getState().expenses).toEqual([]);
    expect(svc.createSettlementEventRaw).toHaveBeenCalledWith({ payment_request_id: 'pr1', project_id: P, event_type: 'reverse', amount: 1500, reversed_event_id: 'ev1', notes: 'خطأ في المبلغ', created_by: 'user-1' });
    expect(prs.listSettlementEventsRaw).toHaveBeenCalledWith('pr1');
    // The reverse event goes in before the expense goes out.
    expect(vi.mocked(svc.createSettlementEventRaw).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(svc.deleteExpenseRaw).mock.invocationCallOrder[0]);
  });

  it('leaves the expense in place when the reverse event is refused', async () => {
    vi.mocked(svc.getSettlementEventRaw).mockResolvedValue({ id: 'ev1', event_type: 'documented', amount: '1500', payment_request_id: 'pr1', project_id: P, expense_id: 'e-doc' } as never);
    vi.mocked(svc.createSettlementEventRaw).mockRejectedValueOnce(new Error('refused'));
    await expect(useStore.getState().reverseSettlementEvent('ev1', 'خطأ')).rejects.toThrow('refused');
    expect(svc.deleteExpenseRaw).not.toHaveBeenCalled();
  });
});

describe('resource settlements', () => {
  it('creates with the balance owed less paid, recomputes it on an edit of either side, and signs closing the approved claims it covers', async () => {
    vi.mocked(svc.createResourceSettlementRaw).mockResolvedValue(settleRow() as never);
    await useStore.getState().createResourceSettlement({ resourceId: 'r1', projectId: P, totalOwed: 900, totalPaid: 400, linkedReimbursementIds: ['rb1', 'rb2'], linkedPaymentIds: [], notes: ' ' });
    expect(svc.createResourceSettlementRaw).toHaveBeenCalledWith(expect.objectContaining({ balance: 500, status: 'draft', notes: null, created_by: 'user-1' }));

    vi.mocked(svc.updateResourceSettlementRaw).mockResolvedValue(settleRow({ total_paid: '600', balance: '300' }) as never);
    await useStore.getState().updateResourceSettlement('s1', { totalPaid: 600 });
    expect(lastPayload(svc.updateResourceSettlementRaw)).toEqual({ total_paid: 600, balance: 300 });

    useStore.setState({ reimbursements: [{ id: 'rb1', projectId: P, status: 'approved' } as unknown as ResourceReimbursement, { id: 'rb2', projectId: P, status: 'submitted' } as unknown as ResourceReimbursement, { id: 'rb3', projectId: P, status: 'approved' } as unknown as ResourceReimbursement] });
    vi.mocked(svc.updateResourceSettlementRaw).mockResolvedValue(settleRow({ status: 'signed', signed_by_resource: true, signed_at: 'now' }) as never);
    await useStore.getState().signResourceSettlement('s1', 'sig.png');
    expect(lastPayload(svc.updateResourceSettlementRaw)).toMatchObject({ status: 'signed', signed_by_resource: true, signature_attachment: 'sig.png' });
    expect(svc.closeReimbursementsRaw).toHaveBeenCalledWith(['rb1']);
    expect(useStore.getState().reimbursements.map((r) => r.status)).toEqual(['reimbursed', 'submitted', 'approved']);
    expect(useStore.getState().resourceSettlements[0]).toMatchObject({ status: 'signed', signedByResource: true });
  });
});
