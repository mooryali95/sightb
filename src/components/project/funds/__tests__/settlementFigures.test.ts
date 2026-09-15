import { describe, expect, it } from 'vitest';
import type { CashTransfer, Custody, PaymentRequest } from '@/types/project';
import { isSettlementEditable, needsReason, settlementFigures } from '../settlementFigures';
import { FUND_ID, PROJECT_ID, expense, expenses, fund, settlement } from '../../__tests__/funds-fixtures';

const fixture = <T,>(rows: Partial<T>[]): T[] => rows as T[];
const rows = {
  expenses: [...expenses, expense({ id: 'exp-c', amount: 1000, fundId: undefined, custodyId: 'c1' })],
  custodies: fixture<Custody>([{ id: 'c1', projectId: PROJECT_ID, resourceName: 'عمر', amount: 5000, status: 'active', sourceFundId: FUND_ID }]),
  paymentRequests: fixture<PaymentRequest>([{ id: 'pr1', projectId: PROJECT_ID, description: 'سلفة', amount: 2000, refundedAmount: 500, requestType: 'advance', status: 'paid', paidFromFundId: FUND_ID, isAdvanceOutstanding: true }]),
  cashTransfers: fixture<CashTransfer>([{ id: 't1', projectId: PROJECT_ID, fromFundId: FUND_ID, toCustodyId: 'c1', amount: 3000, transferDate: '' }]),
};

describe('settlementFigures', () => {
  it('breaks the documented spend down, takes the cash typed off the difference, and lists what is open', () => {
    const f = settlementFigures(fund(), rows, 1000);
    expect(f.breakdown).toEqual({ direct: 12000, custodyDraw: 5000, advances: 1500, transfersOut: 3000 });
    expect(f.spent).toBe(12000 + 5000 + 1500 + 3000);
    expect(f.difference).toBe(50000 - f.spent - 1000);
    expect(f.computedRemaining).toBe(50000 - f.spent);
    expect(f.openItems.openCustodies.map((c) => [c.resourceName, c.remaining])).toEqual([['عمر', 7000]]);
    expect(f.openItems.outstandingAdvances.map((a) => a.remaining)).toEqual([1500]);
    expect(f.violations).toEqual([]);
  });

  it('never reports a remaining below zero, and flags a row linked to a fund and a custody at once', () => {
    const over = { ...rows, expenses: [...rows.expenses, expense({ id: 'big', amount: 90000 }), expense({ id: 'dbl', amount: 10, custodyId: 'c1', description: 'مزدوج' })] };
    const f = settlementFigures(fund(), over, 0);
    expect(f.computedRemaining).toBe(0);
    expect(f.violations.map((v) => [v.kind, v.description])).toEqual([['expense_double_link', 'مزدوج']]);
  });
});

describe('isSettlementEditable and needsReason', () => {
  it('lets a missing, draft or rejected settlement be edited and nothing else', () => {
    expect(isSettlementEditable(undefined)).toBe(true);
    expect(isSettlementEditable(settlement({ status: 'draft' }))).toBe(true);
    expect(isSettlementEditable(settlement({ status: 'rejected' }))).toBe(true);
    expect(isSettlementEditable(settlement({ status: 'submitted' }))).toBe(false);
    expect(isSettlementEditable(settlement({ status: 'approved' }))).toBe(false);
  });

  it('asks for a reason past one unit either way', () => {
    expect(needsReason(1)).toBe(false);
    expect(needsReason(-1)).toBe(false);
    expect(needsReason(1.01)).toBe(true);
    expect(needsReason(-500)).toBe(true);
  });
});
