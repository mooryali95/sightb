/**
 * The fifth layer, and the first that tests the store at all.
 *
 * Everything above this point tests what a screen shows. This tests what a
 * mutation does, which matters because the screen is not the only caller: a
 * guard that lives in a `disabled` prop protects the button, not the money.
 *
 * The emphasis is on the refusals rather than the happy paths. Every check
 * here is one that fails *silently* if it regresses — a settlement larger than
 * the debt, a cash refund that also books an expense, a reversal of a reversal
 * — and none of them would turn a screen red.
 *
 * Two things are deliberately asserted alongside each refusal:
 *
 *   1. that nothing was written. A guard that throws after its first write
 *      leaves the ledger half-changed and is worse than no guard at all.
 *   2. that local state is untouched, for the same reason.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from '@/store/useStore';
import * as svc from '@/services/resourcePayableService';
import * as paymentRequestService from '@/services/paymentRequestService';
import * as advanceSettlementService from '@/services/advanceSettlementService';
import {
  PROJECT_ID,
  paidOrdinaryRequest,
  partlyRefundedAdvance,
  request,
  settledAdvance,
  settlementEvent,
} from './payables-store-fixtures';

vi.mock('@/services/resourcePayableService');
vi.mock('@/services/paymentRequestService');
vi.mock('@/services/advanceSettlementService');

vi.mock('@/store/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/store/helpers')>()),
  getUserId: vi.fn().mockResolvedValue('user-1'),
}));

/** Every service call the slice can make, so "nothing was written" is checkable. */
function writeCalls(): number {
  return (
    vi.mocked(svc.createSettlementEventRaw).mock.calls.length
    + vi.mocked(svc.createSettlementExpenseRaw).mock.calls.length
    + vi.mocked(svc.updatePaymentRequestRaw).mock.calls.length
    + vi.mocked(svc.createReimbursementRaw).mock.calls.length
    + vi.mocked(svc.deleteExpenseRaw).mock.calls.length
    + vi.mocked(svc.deletePaymentRequestRaw).mock.calls.length
    + vi.mocked(advanceSettlementService.splitSettle).mock.calls.length
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useStore.setState({
    reimbursements: [], paymentRequests: [], resourceSettlements: [],
    settlementEvents: [], expenses: [],
  });

  // A settlement leaves the recalculation to a DB trigger, so the slice re-reads
  // the row afterwards. Returning null keeps these tests on the guards rather
  // than on the mapper, which has its own coverage.
  vi.mocked(paymentRequestService.getPaymentRequestRaw).mockResolvedValue(null as never);
  vi.mocked(paymentRequestService.listSettlementEventsRaw).mockResolvedValue([] as never);
  vi.mocked(paymentRequestService.getExpenseRaw).mockResolvedValue(null as never);
  vi.mocked(svc.createSettlementEventRaw).mockResolvedValue({ id: 'evt-new' } as never);
  vi.mocked(svc.createSettlementExpenseRaw).mockResolvedValue({ id: 'exp-new' } as never);
  vi.mocked(svc.findReverseEventRaw).mockResolvedValue(null as never);
});

const store = () => useStore.getState();

describe('settleAdvance refuses before it writes', () => {
  it('rejects a request that is not in the store at all', async () => {
    await expect(store().settleAdvance('ghost', { type: 'documented' }))
      .rejects.toThrow('طلب الصرف غير موجود');
    expect(writeCalls()).toBe(0);
  });

  it('rejects a request that is not an advance', async () => {
    useStore.setState({ paymentRequests: [paidOrdinaryRequest] });

    await expect(store().settleAdvance(paidOrdinaryRequest.id, { type: 'documented' }))
      .rejects.toThrow('هذه العملية متاحة للسلف فقط');
    expect(writeCalls()).toBe(0);
  });

  it('rejects an advance that is already settled', async () => {
    useStore.setState({ paymentRequests: [settledAdvance] });

    await expect(store().settleAdvance(settledAdvance.id, { type: 'documented' }))
      .rejects.toThrow('السلفة مسوّاة بالفعل');
    expect(writeCalls()).toBe(0);
  });

  /**
   * The debt is 2,000 — 5,000 advanced less 3,000 already refunded — not 5,000.
   * A guard reading `amount` accepts 2,001 through 5,000 and settles more than
   * is owed, which reads as a legitimate settlement in every report afterwards.
   */
  it('rejects a settlement larger than what is still owed, not larger than the advance', async () => {
    useStore.setState({ paymentRequests: [partlyRefundedAdvance] });

    await expect(store().settleAdvance(partlyRefundedAdvance.id, {
      type: 'documented', settledAmount: 2001,
    })).rejects.toThrow('مبلغ التسوية غير صحيح');
    expect(writeCalls()).toBe(0);
  });

  it('accepts exactly what is still owed', async () => {
    useStore.setState({ paymentRequests: [partlyRefundedAdvance] });

    await store().settleAdvance(partlyRefundedAdvance.id, {
      type: 'documented', settledAmount: 2000,
    });

    expect(vi.mocked(svc.createSettlementEventRaw)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(svc.createSettlementEventRaw).mock.calls[0][0])
      .toMatchObject({ amount: 2000, payment_request_id: partlyRefundedAdvance.id });
  });

  it('rejects a zero or negative settlement', async () => {
    useStore.setState({ paymentRequests: [partlyRefundedAdvance] });

    await expect(store().settleAdvance(partlyRefundedAdvance.id, {
      type: 'documented', settledAmount: 0,
    })).rejects.toThrow('مبلغ التسوية غير صحيح');
    await expect(store().settleAdvance(partlyRefundedAdvance.id, {
      type: 'documented', settledAmount: -500,
    })).rejects.toThrow('مبلغ التسوية غير صحيح');
    expect(writeCalls()).toBe(0);
  });

  it('defaults to the whole remaining debt when no amount is given', async () => {
    useStore.setState({ paymentRequests: [partlyRefundedAdvance] });

    await store().settleAdvance(partlyRefundedAdvance.id, { type: 'documented' });

    expect(vi.mocked(svc.createSettlementEventRaw).mock.calls[0][0])
      .toMatchObject({ amount: 2000 });
  });
});

/**
 * Which settlements book an expense, and which do not.
 *
 * This is the money distinction in the whole feature. A documented settlement
 * means the cash left and stayed gone, so it becomes an expense. A cash refund
 * means the cash came back — booking an expense for it would charge the project
 * for money it still holds.
 */
describe('a settlement books an expense only when the cash is gone', () => {
  beforeEach(() => useStore.setState({ paymentRequests: [partlyRefundedAdvance] }));

  it('books one for a documented settlement', async () => {
    await store().settleAdvance(partlyRefundedAdvance.id, {
      type: 'documented', settledAmount: 500, expenseCategory: 'travel',
    });

    expect(vi.mocked(svc.createSettlementExpenseRaw)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(svc.createSettlementExpenseRaw).mock.calls[0][0])
      .toMatchObject({ amount: 500, category: 'travel', source_payment_request_id: partlyRefundedAdvance.id });
  });

  it('books none for a cash refund', async () => {
    await store().settleAdvance(partlyRefundedAdvance.id, {
      type: 'cash_refund', settledAmount: 500,
    });

    expect(vi.mocked(svc.createSettlementExpenseRaw)).not.toHaveBeenCalled();
    expect(vi.mocked(svc.createSettlementEventRaw).mock.calls[0][0])
      .toMatchObject({ event_type: 'cash_refund', expense_id: null });
  });

  it('books a payroll deduction against salary, whatever category was passed', async () => {
    await store().settleAdvance(partlyRefundedAdvance.id, {
      type: 'payroll_deduction', settledAmount: 500, expenseCategory: 'travel',
    });

    expect(vi.mocked(svc.createSettlementExpenseRaw).mock.calls[0][0])
      .toMatchObject({ category: 'salary' });
  });

  it('books a write-off as other, and never as VAT-exempt-false', async () => {
    await store().settleAdvance(partlyRefundedAdvance.id, {
      type: 'written_off', settledAmount: 500, expenseCategory: 'travel',
    });

    expect(vi.mocked(svc.createSettlementExpenseRaw).mock.calls[0][0])
      .toMatchObject({ category: 'other', is_vat_exempt: true });
  });

  /**
   * An advance paid out of a custody must not also name a fund on the expense,
   * or the same money is attributed to two sources and both reconcile short.
   */
  it('attributes the expense to the custody alone when one paid the advance', async () => {
    useStore.setState({
      paymentRequests: [request({
        ...partlyRefundedAdvance,
        paidFromFundId: 'fund-1',
        paidFromCustodyId: 'cust-1',
      })],
    });

    await store().settleAdvance(partlyRefundedAdvance.id, {
      type: 'documented', settledAmount: 500,
    });

    expect(vi.mocked(svc.createSettlementExpenseRaw).mock.calls[0][0])
      .toMatchObject({ fund_id: null, custody_id: 'cust-1' });
  });
});

describe('the split settlement divides the invoice at the debt', () => {
  beforeEach(() => useStore.setState({ paymentRequests: [partlyRefundedAdvance] }));

  it('refuses an invoice that the ordinary path already covers', async () => {
    await expect(store().settleAdvanceWithSplit(partlyRefundedAdvance.id, {
      invoiceAmount: 2000, expenseCategory: 'travel', overflowSource: { fundId: 'fund-1' },
    })).rejects.toThrow('قيمة الفاتورة لا تتجاوز المتبقي');
    expect(writeCalls()).toBe(0);
  });

  /**
   * 2,500 invoiced against a 2,000 debt: 2,000 clears the advance and 500 is
   * new spend needing its own source. Splitting anywhere else either leaves
   * the advance part-owed or charges the project twice for the same invoice.
   */
  it('settles the debt exactly and sends only the overflow to its own source', async () => {
    vi.mocked(advanceSettlementService.splitSettle).mockResolvedValue({ expenseId: null } as never);

    await store().settleAdvanceWithSplit(partlyRefundedAdvance.id, {
      invoiceAmount: 2500, expenseCategory: 'travel',
      overflowSource: { fundId: 'fund-2' },
    });

    expect(vi.mocked(advanceSettlementService.splitSettle).mock.calls[0][0]).toMatchObject({
      paymentRequestId: partlyRefundedAdvance.id,
      settleAmount: 2000,
      overflowAmount: 500,
      overflowSource: { fundId: 'fund-2', custodyId: null },
    });
  });

  it('applies the same three guards as the ordinary path', async () => {
    useStore.setState({ paymentRequests: [settledAdvance, paidOrdinaryRequest] });
    const split = { invoiceAmount: 9999, expenseCategory: 'travel', overflowSource: { fundId: 'f' } };

    await expect(store().settleAdvanceWithSplit('ghost', split))
      .rejects.toThrow('طلب الصرف غير موجود');
    await expect(store().settleAdvanceWithSplit(paidOrdinaryRequest.id, split))
      .rejects.toThrow('هذه العملية متاحة للسلف فقط');
    await expect(store().settleAdvanceWithSplit(settledAdvance.id, split))
      .rejects.toThrow('السلفة مسوّاة بالفعل');
    expect(writeCalls()).toBe(0);
  });
});

describe('reversing a settlement event', () => {
  it('requires a reason that is not just whitespace', async () => {
    await expect(store().reverseSettlementEvent('evt-1', '   '))
      .rejects.toThrow('سبب التراجع مطلوب');
    expect(vi.mocked(svc.getSettlementEventRaw)).not.toHaveBeenCalled();
    expect(writeCalls()).toBe(0);
  });

  it('rejects an event the database does not have', async () => {
    vi.mocked(svc.getSettlementEventRaw).mockResolvedValue(null as never);

    await expect(store().reverseSettlementEvent('evt-1', 'خطأ إدخال'))
      .rejects.toThrow('الحدث غير موجود');
    expect(writeCalls()).toBe(0);
  });

  it('refuses to reverse a reversal', async () => {
    vi.mocked(svc.getSettlementEventRaw)
      .mockResolvedValue(settlementEvent({ event_type: 'reverse' }) as never);

    await expect(store().reverseSettlementEvent('evt-1', 'خطأ إدخال'))
      .rejects.toThrow('لا يمكن التراجع عن حدث تراجع');
    expect(writeCalls()).toBe(0);
  });

  /**
   * Reversing twice would insert two compensating events for one original, and
   * the recalculation trigger would credit the refund twice.
   */
  it('refuses a second reversal of the same event', async () => {
    vi.mocked(svc.getSettlementEventRaw).mockResolvedValue(settlementEvent() as never);
    vi.mocked(svc.findReverseEventRaw).mockResolvedValue({ id: 'evt-rev' } as never);

    await expect(store().reverseSettlementEvent('evt-1', 'خطأ إدخال'))
      .rejects.toThrow('هذا الحدث ملغى بالفعل');
    expect(writeCalls()).toBe(0);
  });

  /**
   * The expense must go before the compensating event is written, not after:
   * the insert fires the recalculation trigger, and an expense still standing
   * at that moment is counted against an advance that no longer owes it.
   */
  it('deletes the linked expense before writing the reversal', async () => {
    const order: string[] = [];
    vi.mocked(svc.getSettlementEventRaw)
      .mockResolvedValue(settlementEvent({ expense_id: 'exp-9' }) as never);
    vi.mocked(svc.deleteExpenseRaw).mockImplementation(async () => { order.push('delete'); });
    vi.mocked(svc.createSettlementEventRaw).mockImplementation(async () => {
      order.push('insert'); return { id: 'evt-new' } as never;
    });
    useStore.setState({ expenses: [{ id: 'exp-9' }, { id: 'exp-keep' }] as never });

    await store().reverseSettlementEvent('evt-1', 'خطأ إدخال');

    expect(order).toEqual(['delete', 'insert']);
    expect(vi.mocked(svc.createSettlementEventRaw).mock.calls[0][0])
      .toMatchObject({ event_type: 'reverse', reversed_event_id: 'evt-1', amount: 1000 });
    // and only that expense left local state
    expect(useStore.getState().expenses.map((e) => e.id)).toEqual(['exp-keep']);
  });
});

describe('the text guards on creation and rejection', () => {
  it('requires a resource on a resource reimbursement', async () => {
    await expect(store().createReimbursement({
      projectId: PROJECT_ID, category: 'travel', description: 'د',
      amount: 10, expenseDate: '2026-01-01',
    } as never)).rejects.toThrow('resourceId required');
    expect(writeCalls()).toBe(0);
  });

  it('requires a name on a vendor reimbursement, and whitespace is not a name', async () => {
    await expect(store().createReimbursement({
      projectId: PROJECT_ID, sourceKind: 'vendor', vendorName: '   ',
      category: 'travel', description: 'د', amount: 10, expenseDate: '2026-01-01',
    } as never)).rejects.toThrow('vendorName required');
    expect(writeCalls()).toBe(0);
  });

  it('requires a reason to reject a payment request', async () => {
    await expect(store().rejectPaymentRequest('req-1', '  '))
      .rejects.toThrow('سبب الرفض مطلوب');
    expect(writeCalls()).toBe(0);
  });

  it('requires a reason to reject a reimbursement', async () => {
    await expect(store().rejectReimbursement('reimb-1', '  '))
      .rejects.toThrow('سبب الرفض مطلوب');
    expect(writeCalls()).toBe(0);
  });
});

/**
 * What the store does NOT guard — recorded as it is, not as it should be.
 *
 * The seven status transitions write their target status unconditionally; none
 * reads the current one. Before calling that a money bug I checked the two
 * paths where money could actually double, and both are closed in the database
 * rather than here:
 *
 *   - the auto-expense trigger fires only on a transition INTO `paid` and only
 *     while `auto_created_expense_id IS NULL`, so a paid → approved → paid
 *     round trip books no second expense;
 *   - the DELETE policy carries `status IN ('draft','cancelled','rejected')`,
 *     so a paid request cannot be deleted regardless of what this slice sends.
 *
 * What is left is a row that contradicts itself: status `approved` while
 * `paid_date` and `auto_created_expense_id` are both populated. That is a
 * reporting problem, not a double spend, and this test pins the behaviour so a
 * future guard is a deliberate change rather than an accident.
 */
describe('status transitions are unguarded — current behaviour, recorded', () => {
  it('lets a paid request be moved back to approved', async () => {
    useStore.setState({ paymentRequests: [paidOrdinaryRequest] });
    vi.mocked(svc.updatePaymentRequestRaw).mockResolvedValue({
      id: paidOrdinaryRequest.id, project_id: PROJECT_ID, status: 'approved',
      request_type: 'reimbursement', amount: 800, description: 'استرداد مدفوع',
      priority: 'normal', linked_reimbursement_ids: [],
      paid_date: '2026-02-01', auto_created_expense_id: 'exp-auto',
    } as never);

    await store().approvePaymentRequest(paidOrdinaryRequest.id);

    const sent = vi.mocked(svc.updatePaymentRequestRaw).mock.calls[0][1] as Record<string, unknown>;
    expect(sent.status).toBe('approved');
    // The slice sends no status precondition of any kind.
    expect(Object.keys(sent)).not.toContain('current_status');

    const after = useStore.getState().paymentRequests[0];
    expect(after.status).toBe('approved');
    // …while still carrying the evidence that it was paid.
    expect(after.paidDate).toBe('2026-02-01');
    expect(after.autoCreatedExpenseId).toBe('exp-auto');
  });
});
