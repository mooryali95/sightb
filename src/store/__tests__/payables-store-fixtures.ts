/**
 * Fixtures for the payables store tests.
 *
 * Kept apart from the component fixtures on purpose. Those are shaped for what
 * a screen renders; these are shaped for what a mutation guard reads —
 * `refundedAmount`, `isAdvanceOutstanding`, `paidFromFundId` — and a shared set
 * would end up serving neither well.
 */
import type { PaymentRequest, SettlementEvent } from '@/types/project';

export const PROJECT_ID = 'proj-1';
export const RESOURCE_ID = 'res-1';

export function request(over: Partial<PaymentRequest> = {}): PaymentRequest {
  return {
    id: 'req-1',
    projectId: PROJECT_ID,
    resourceId: RESOURCE_ID,
    requestType: 'reimbursement',
    amount: 1000,
    description: 'طلب',
    justification: '',
    priority: 'normal',
    status: 'draft',
    linkedReimbursementIds: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  } as PaymentRequest;
}

/**
 * An advance of 5,000 with 3,000 already refunded — so 2,000 is still owed.
 *
 * The gap between `amount` and what is still outstanding is the whole point:
 * a guard that compares against `amount` instead of `amount - refundedAmount`
 * accepts a 5,000 settlement on a 2,000 debt, and every fixture with a zero
 * refund would let that through.
 */
export const partlyRefundedAdvance = request({
  id: 'adv-partly',
  requestType: 'advance',
  status: 'paid',
  amount: 5000,
  refundedAmount: 3000,
  isAdvanceOutstanding: true,
  paidFromFundId: 'fund-1',
  description: 'سلفة سفر',
});

/** A settled advance: still an advance, still paid, but nothing is owed. */
export const settledAdvance = request({
  id: 'adv-settled',
  requestType: 'advance',
  status: 'paid',
  amount: 5000,
  refundedAmount: 5000,
  isAdvanceOutstanding: false,
  description: 'سلفة مسوّاة',
});

/** Paid, carrying an auto-created expense — an ordinary request, not an advance. */
export const paidOrdinaryRequest = request({
  id: 'req-paid',
  status: 'paid',
  amount: 800,
  paidDate: '2026-02-01',
  autoCreatedExpenseId: 'exp-auto',
  description: 'استرداد مدفوع',
});

export function settlementEvent(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'evt-1',
    payment_request_id: 'adv-partly',
    project_id: PROJECT_ID,
    event_type: 'documented',
    amount: 1000,
    expense_id: null,
    created_at: '2026-02-01T00:00:00.000Z',
    ...over,
  } as unknown as SettlementEvent & Record<string, unknown>;
}
