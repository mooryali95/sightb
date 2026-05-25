/**
 * Tests for advance settlement effects on fund/custody balances.
 * Covers the 4 settlement types:
 *  - cash_refund (full + partial)
 *  - payroll_deduction (auto-creates linked expense)
 *  - written_off (auto-creates linked expense)
 *  - documented (auto-creates linked expense)
 */
import { describe, it, expect } from 'vitest';
import {
  getFundOutstandingAdvances,
  getCustodyOutstandingAdvances,
  getFundSpent,
  getFundRemaining,
} from '../funds';
import type {
  PaymentRequest,
  ProjectFund,
  Expense,
  Custody,
} from '@/types/project';

const PID = 'p1';
const FID = 'f1';
const CID = 'c1';
const RID = 'r1';

const fund: ProjectFund = {
  id: FID,
  projectId: PID,
  fundNumber: 1,
  amount: 10_000,
  transferDate: '2026-01-01',
  status: 'acknowledged',
  createdBy: 'u1',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

const makeAdvance = (over: Partial<PaymentRequest> = {}): PaymentRequest => ({
  id: 'pr-adv',
  projectId: PID,
  resourceId: RID,
  requestType: 'advance',
  amount: 3000,
  currency: 'ر.س',
  description: 'سلفة',
  linkedReimbursementIds: [],
  paymentAttachments: [],
  priority: 'normal',
  status: 'paid',
  requestedBy: 'u1',
  paidFromFundId: FID,
  isAdvanceOutstanding: true,
  refundedAmount: 0,
  createdAt: '2026-01-02',
  updatedAt: '2026-01-02',
  ...over,
});

const makeExpense = (over: Partial<Expense> = {}): Expense => ({
  id: 'e-' + Math.random(),
  projectId: PID,
  category: 'other',
  description: 'cost',
  amount: 0,
  date: '2026-01-10',
  month: 1,
  approvalStatus: 'approved',
  isVatExempt: false,
  fundId: FID,
  ...over,
});

describe('Outstanding advances — base case', () => {
  it('counts a paid unsettled advance as locked against the fund', () => {
    const pr = [makeAdvance({ amount: 3000 })];
    expect(getFundOutstandingAdvances(FID, pr)).toBe(3000);
    expect(getFundRemaining(fund, [], [], pr)).toBe(7000);
  });

  it('ignores advance when no longer outstanding (settled)', () => {
    const pr = [makeAdvance({ isAdvanceOutstanding: false })];
    expect(getFundOutstandingAdvances(FID, pr)).toBe(0);
    expect(getFundRemaining(fund, [], [], pr)).toBe(10_000);
  });

  it('ignores non-paid advances', () => {
    const pr = [makeAdvance({ status: 'approved' })];
    expect(getFundOutstandingAdvances(FID, pr)).toBe(0);
  });

  it('ignores reimbursement requests (non-advance)', () => {
    const pr = [makeAdvance({ requestType: 'reimbursement' })];
    expect(getFundOutstandingAdvances(FID, pr)).toBe(0);
  });
});

describe('cash_refund settlement', () => {
  it('full refund: outstanding flag false, no fund liability remaining', () => {
    const pr = [
      makeAdvance({
        amount: 3000,
        refundedAmount: 3000,
        isAdvanceOutstanding: false,
        settlementType: 'cash_refund',
        refundToFundId: FID,
      }),
    ];
    expect(getFundOutstandingAdvances(FID, pr)).toBe(0);
    expect(getFundRemaining(fund, [], [], pr)).toBe(10_000);
  });

  it('partial refund: still outstanding, but only net amount locked', () => {
    const pr = [
      makeAdvance({
        amount: 3000,
        refundedAmount: 1000,
        isAdvanceOutstanding: true,
        settlementType: 'cash_refund',
        refundToFundId: FID,
      }),
    ];
    expect(getFundOutstandingAdvances(FID, pr)).toBe(2000);
    expect(getFundRemaining(fund, [], [], pr)).toBe(8000);
  });

  it('clamps to zero if refundedAmount > amount (data anomaly)', () => {
    const pr = [makeAdvance({ amount: 1000, refundedAmount: 5000 })];
    expect(getFundOutstandingAdvances(FID, pr)).toBe(0);
  });
});

describe('payroll_deduction / written_off / documented settlements', () => {
  // After settlement: isAdvanceOutstanding=false AND a linked expense is created
  // with sourcePaymentRequestId. The expense IS counted as fund spend.
  const settlementTypes = ['payroll_deduction', 'written_off', 'documented'] as const;

  settlementTypes.forEach((type) => {
    it(`${type}: advance no longer outstanding, linked expense hits fund spend`, () => {
      const pr = [
        makeAdvance({
          amount: 3000,
          refundedAmount: 0,
          isAdvanceOutstanding: false,
          settlementType: type,
          settledAmount: 3000,
        }),
      ];
      const expenses = [
        makeExpense({
          id: 'linked-exp',
          amount: 3000,
          fundId: FID,
          sourcePaymentRequestId: 'pr-adv',
          category: type === 'payroll_deduction' ? 'salary' : 'other',
        }),
      ];
      expect(getFundOutstandingAdvances(FID, pr)).toBe(0);
      expect(getFundSpent(FID, expenses, [], pr)).toBe(3000);
      expect(getFundRemaining(fund, expenses, [], pr)).toBe(7000);
    });
  });

  it('does NOT double-count: settled advance + linked expense = single 3000 hit', () => {
    // Before settlement
    const before = [makeAdvance({ amount: 3000 })];
    expect(getFundSpent(FID, [], [], before)).toBe(3000);

    // After settlement (advance closed, expense created)
    const afterPRs = [
      makeAdvance({
        amount: 3000,
        isAdvanceOutstanding: false,
        settlementType: 'documented',
      }),
    ];
    const afterExpenses = [
      makeExpense({ amount: 3000, sourcePaymentRequestId: 'pr-adv' }),
    ];
    expect(getFundSpent(FID, afterExpenses, [], afterPRs)).toBe(3000);
  });
});

describe('Custody-based advances', () => {
  const custody: Custody = {
    id: CID,
    projectId: PID,
    resourceName: 'عمر',
    amount: 5000,
    status: 'active',
    sourceFundId: FID,
    createdAt: '2026-01-01',
  };

  it('outstanding advance from custody locks custody balance', () => {
    const pr = [
      makeAdvance({
        amount: 1200,
        paidFromFundId: undefined,
        paidFromCustodyId: CID,
      }),
    ];
    expect(getCustodyOutstandingAdvances(CID, pr)).toBe(1200);
    // Fund-level outstanding ignores it
    expect(getFundOutstandingAdvances(FID, pr)).toBe(0);
  });

  it('partial refund on custody advance reduces lock', () => {
    const pr = [
      makeAdvance({
        amount: 1200,
        refundedAmount: 500,
        paidFromFundId: undefined,
        paidFromCustodyId: CID,
      }),
    ];
    expect(getCustodyOutstandingAdvances(CID, pr)).toBe(700);
  });

  it('custody spend = direct expenses + outstanding advances (no double count after settle)', () => {
    // Pre-settle: outstanding 1200
    const prOutstanding = [
      makeAdvance({
        amount: 1200,
        paidFromFundId: undefined,
        paidFromCustodyId: CID,
      }),
    ];
    expect(getCustodyOutstandingAdvances(CID, prOutstanding)).toBe(1200);

    // Post-settle (written_off): linked expense at custody
    const prSettled = [
      makeAdvance({
        amount: 1200,
        isAdvanceOutstanding: false,
        paidFromFundId: undefined,
        paidFromCustodyId: CID,
        settlementType: 'written_off',
      }),
    ];
    const linkedExpense = makeExpense({
      amount: 1200,
      fundId: undefined,
      custodyId: CID,
      sourcePaymentRequestId: 'pr-adv',
      category: 'other',
    });
    expect(getCustodyOutstandingAdvances(CID, prSettled)).toBe(0);
    // Expense is on custody, not direct on fund → fund direct spend = 0
    expect(getFundSpent(FID, [linkedExpense], [custody], prSettled))
      .toBe(custody.amount); // only custody draw = 5000
  });
});

describe('Multiple advances on same fund', () => {
  it('aggregates outstanding net amounts correctly', () => {
    const pr = [
      makeAdvance({ id: 'a1', amount: 2000 }),
      makeAdvance({ id: 'a2', amount: 1500, refundedAmount: 500 }),
      makeAdvance({ id: 'a3', amount: 1000, isAdvanceOutstanding: false }), // settled
      makeAdvance({ id: 'a4', amount: 800, status: 'cancelled' }),
    ];
    // a1: 2000, a2: 1000, a3: 0, a4: 0
    expect(getFundOutstandingAdvances(FID, pr)).toBe(3000);
    expect(getFundRemaining(fund, [], [], pr)).toBe(7000);
  });
});
