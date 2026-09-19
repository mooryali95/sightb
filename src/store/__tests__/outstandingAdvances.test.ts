/**
 * An advance paid to a person creates an expense the database keeps until
 * the advance is settled; every summary must leave that expense out of
 * spend while the advance is outstanding. The row carries no flag, so the
 * store derives it from the paid advance that created it, whichever side
 * arrives first, and clears it once the advance is settled.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../useStore';
import { flagOutstandingAdvances } from '../outstandingAdvances';
import type { Expense, PaymentRequest } from '@/types/project';

const expense = (id: string): Expense => ({
  id, projectId: 'p-1', category: 'salary', description: 'سلفة', amount: 3000, date: '2026-02-01', month: 2,
  approvalStatus: 'approved', isVatExempt: true,
});
const advance = (over: Partial<PaymentRequest>): PaymentRequest => ({
  id: 'req-1', projectId: 'p-1', resourceId: 'r-1', requestType: 'advance', amount: 3000, currency: 'ر.س',
  description: 'سلفة', linkedReimbursementIds: [], priority: 'normal', status: 'paid', requestedBy: 'u',
  paymentAttachments: [], isAdvanceOutstanding: true, autoCreatedExpenseId: 'ex-adv', refundedAmount: 0,
  createdAt: '', updatedAt: '', ...over,
} as PaymentRequest);

describe('flagOutstandingAdvances', () => {
  it('flags the expense a paid, unsettled advance created and nothing else', () => {
    const out = flagOutstandingAdvances([expense('ex-adv'), expense('ex-plain')], [advance({})]);
    // A row that was never flagged stays as it was: absent means not outstanding.
    expect(out.map((e) => e.isOutstandingAdvance ?? false)).toEqual([true, false]);
  });
  it('clears the flag once the advance is settled, and never flags a reimbursement', () => {
    const settled = flagOutstandingAdvances([{ ...expense('ex-adv'), isOutstandingAdvance: true }], [advance({ isAdvanceOutstanding: false })]);
    expect(settled[0].isOutstandingAdvance).toBe(false);
    const reimb = flagOutstandingAdvances([expense('ex-adv')], [advance({ requestType: 'reimbursement' })]);
    expect(reimb[0].isOutstandingAdvance ?? false).toBe(false);
  });
  it('leaves an expense no request mentions as it is, flag and all', () => {
    const rows = [{ ...expense('ex-legacy'), isOutstandingAdvance: true }, expense('ex-plain')];
    const out = flagOutstandingAdvances(rows, []);
    expect(out[0]).toBe(rows[0]);
    expect(out[1]).toBe(rows[1]);
    expect(flagOutstandingAdvances(undefined, undefined)).toEqual([]);
  });
  it('keeps the identity of rows whose flag is already right', () => {
    const rows = [{ ...expense('ex-adv'), isOutstandingAdvance: true }, expense('ex-plain')];
    const out = flagOutstandingAdvances(rows, [advance({})]);
    expect(out[0]).toBe(rows[0]);
    expect(out[1]).toBe(rows[1]);
  });
});

describe('store derivation', () => {
  beforeEach(() => { useStore.setState({ expenses: [], paymentRequests: [] }); });
  it('flags on whichever side lands last, and unflags on settlement', () => {
    useStore.setState({ expenses: [expense('ex-adv'), expense('ex-plain')] });
    expect(useStore.getState().expenses.map((e) => e.isOutstandingAdvance ?? false)).toEqual([false, false]);
    useStore.setState({ paymentRequests: [advance({})] });
    expect(useStore.getState().expenses.map((e) => e.isOutstandingAdvance ?? false)).toEqual([true, false]);
    useStore.setState({ paymentRequests: [advance({ isAdvanceOutstanding: false })] });
    expect(useStore.getState().expenses.map((e) => e.isOutstandingAdvance ?? false)).toEqual([false, false]);
  });
  it('flags an expense that arrives after the request', () => {
    useStore.setState({ paymentRequests: [advance({})] });
    useStore.setState({ expenses: [expense('ex-adv')] });
    expect(useStore.getState().expenses[0].isOutstandingAdvance).toBe(true);
  });
});
