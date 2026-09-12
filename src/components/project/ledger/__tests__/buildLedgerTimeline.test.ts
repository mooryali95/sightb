/**
 * The timeline builder, now a pure function: what goes in, in which
 * direction, and in what order. The section's component test pins the
 * count; this pins the semantics behind it.
 */
import { describe, it, expect } from 'vitest';
import { buildLedgerTimeline } from '../buildLedgerTimeline';
import type { Expense, PaymentRequest, ProjectFund } from '@/types/project';

const PROJECT_ID = 'p';
const fund: ProjectFund = {
  id: 'f1', projectId: PROJECT_ID, fundNumber: 1, amount: 50000, transferDate: '2026-02-01',
  status: 'acknowledged', createdBy: 'u', createdAt: '2026-02-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z',
};
const expense: Expense = {
  id: 'e1', projectId: PROJECT_ID, category: 'consulting', description: 'استرداد: مستحقات', amount: 2000,
  date: '2026-02-15', month: 2, approvalStatus: 'approved', isVatExempt: false, fundId: 'f1',
};
function request(over: Partial<PaymentRequest>): PaymentRequest {
  return {
    id: 'r', projectId: PROJECT_ID, resourceId: 'res', requestType: 'reimbursement', amount: 2000, currency: 'SAR',
    description: 'مستحقات', linkedReimbursementIds: [], priority: 'normal', status: 'paid', requestedBy: 'u',
    paymentAttachments: [], createdAt: '2026-02-14T00:00:00Z', updatedAt: '2026-02-15T00:00:00Z', ...over,
  };
}

function build(payReqs: PaymentRequest[]) {
  const expenseToPayReq = new Map(payReqs.filter((p) => p.autoCreatedExpenseId).map((p) => [p.autoCreatedExpenseId as string, p]));
  return buildLedgerTimeline({
    projectId: PROJECT_ID, funds: [fund], custodies: [], expenses: [expense], payReqs,
    settlements: [], resourceSettlements: [], resources: [{ id: 'res', projectId: PROJECT_ID, name: 'سالم', monthlyCost: 0, createdAt: '' }],
    expenseToPayReq,
  });
}

describe('buildLedgerTimeline', () => {
  it('represents a paid request by the expense it produced, once', () => {
    const events = build([request({ id: 'paid', autoCreatedExpenseId: 'e1', paidDate: '2026-02-15' })]);
    expect(events.map((e) => e.id)).toEqual(['e-e1', 'f-f1']);
    // The expense carries the request's type on its subtitle instead.
    expect(events[0].subtitle).toContain('طلب صرف');
  });

  it('lists a paid request with no expense of its own as an outflow', () => {
    const events = build([request({ id: 'adv', requestType: 'advance', paidDate: '2026-02-20' })]);
    const adv = events.find((e) => e.id === 'pr-adv');
    expect(adv?.direction).toBe('out');
    expect(adv?.amount).toBe(2000);
  });

  it('shows a refund on an advance as an inflow of what came back', () => {
    const events = build([request({
      id: 'adv', requestType: 'advance', paidDate: '2026-02-20', refundedAmount: 800,
      isAdvanceOutstanding: true, advanceSettledAt: '2026-03-01T00:00:00Z',
    })]);
    const refund = events.find((e) => e.id === 'rf-adv');
    expect(refund?.direction).toBe('in');
    expect(refund?.amount).toBe(800);
    expect(refund?.subtitle).toContain('1,200.00');
  });

  it('orders newest first', () => {
    const events = build([request({ id: 'adv', requestType: 'advance', paidDate: '2026-02-20' })]);
    expect(events.map((e) => e.date)).toEqual(['2026-02-20', '2026-02-15', '2026-02-01']);
  });
});
