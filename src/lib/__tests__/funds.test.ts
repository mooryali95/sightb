import { describe, it, expect } from 'vitest';
import {
  getFundSpent,
  getFundRemaining,
  getFundRemainingBreakdown,
  getActiveFund,
  getProjectFundsSummary,
  getRemainingStatus,
  calculateSettlementDifference,
  daysBetween,
  getSettlementForFund,
  getFundOpenItems,
  auditFundFinancialLinks,
  getProjectOutstandingAdvances,
} from '../funds';
import { generateFundAlerts, canCreateNewFund } from '../fund-alerts';
import type { ProjectFund, FundSettlement, Expense, PaymentRequest, Custody, CashTransfer } from '@/types/project';

const PID = 'project-1';

const makeFund = (overrides: Partial<ProjectFund> = {}): ProjectFund => ({
  id: 'f1',
  projectId: PID,
  fundNumber: 1,
  amount: 10000,
  transferDate: '2026-01-01',
  status: 'transferred',
  createdBy: 'user-1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

const makeExpense = (overrides: Partial<Expense> = {}): Expense => ({
  id: 'e1',
  projectId: PID,
  category: 'other',
  description: 'test',
  amount: 1000,
  date: '2026-01-15',
  month: 1,
  approvalStatus: 'approved',
  isVatExempt: false,
  ...overrides,
});

const makeRequest = (overrides: Partial<PaymentRequest> = {}): PaymentRequest => ({
  id: 'pr1', projectId: PID, resourceId: 'r1', requestType: 'advance', amount: 0, currency: 'SAR',
  description: '', linkedReimbursementIds: [], priority: 'normal', status: 'paid', requestedBy: 'u1',
  paymentAttachments: [], refundedAmount: 0, createdAt: '', updatedAt: '', ...overrides,
});

const makeCustody = (overrides: Partial<Custody> = {}): Custody => ({
  id: 'c1', projectId: PID, resourceName: 'X', amount: 0, spent: 0, remaining: 0,
  status: 'active', receivedDate: '2026-01-02', createdAt: '2026-01-02', ...overrides,
});

const makeTransfer = (overrides: Partial<CashTransfer> = {}): CashTransfer => ({
  id: 't1', projectId: PID, fromFundId: 'f1', toCustodyId: 'c1', amount: 0, transferDate: '2026-01-03', createdAt: '2026-01-03', ...overrides,
});


const makeSettlement = (overrides: Partial<FundSettlement> = {}): FundSettlement => ({
  id: 's1',
  fundId: 'f1',
  projectId: PID,
  totalReceived: 10000,
  totalSpent: 0,
  remainingCash: 0,
  difference: 0,
  status: 'draft',
  attachments: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('getFundSpent', () => {
  it('sums approved expenses linked to fund', () => {
    const expenses = [
      makeExpense({ id: 'e1', amount: 1000, fundId: 'f1' }),
      makeExpense({ id: 'e2', amount: 2000, fundId: 'f1' }),
      makeExpense({ id: 'e3', amount: 500, fundId: 'f2' }),
    ];
    expect(getFundSpent('f1', expenses)).toBe(3000);
  });

  it('excludes rejected expenses', () => {
    const expenses = [
      makeExpense({ id: 'e1', amount: 1000, fundId: 'f1' }),
      makeExpense({ id: 'e2', amount: 2000, fundId: 'f1', approvalStatus: 'rejected' }),
    ];
    expect(getFundSpent('f1', expenses)).toBe(1000);
  });

  it('returns 0 when no matching expenses', () => {
    expect(getFundSpent('f1', [])).toBe(0);
  });
});

describe('getFundRemaining', () => {
  it('subtracts spent from amount', () => {
    const fund = makeFund({ amount: 10000 });
    const expenses = [makeExpense({ amount: 3000, fundId: 'f1' })];
    expect(getFundRemaining(fund, expenses)).toBe(7000);
  });

  it('can be negative on overspend', () => {
    const fund = makeFund({ amount: 5000 });
    const expenses = [makeExpense({ amount: 6000, fundId: 'f1' })];
    expect(getFundRemaining(fund, expenses)).toBe(-1000);
  });
});

describe('getActiveFund', () => {
  it('returns the latest acknowledged fund', () => {
    const funds = [
      makeFund({ id: 'f1', fundNumber: 1, status: 'settled' }),
      makeFund({ id: 'f2', fundNumber: 2, status: 'acknowledged' }),
      makeFund({ id: 'f3', fundNumber: 3, status: 'acknowledged' }),
    ];
    expect(getActiveFund(PID, funds)?.id).toBe('f3');
  });

  it('returns transferred fund when no acknowledged fund exists', () => {
    const funds = [makeFund({ status: 'transferred' })];
    expect(getActiveFund(PID, funds)?.id).toBe('f1');
  });

  it('returns null when no transferred or acknowledged fund exists', () => {
    const funds = [makeFund({ status: 'settled' })];
    expect(getActiveFund(PID, funds)).toBeNull();
  });

  it('isolates by project', () => {
    const funds = [
      makeFund({ id: 'f1', projectId: 'other', status: 'acknowledged' }),
    ];
    expect(getActiveFund(PID, funds)).toBeNull();
  });
});

describe('getProjectFundsSummary', () => {
  it('totals transferred amount across all funds', () => {
    const funds = [
      makeFund({ id: 'f1', amount: 10000 }),
      makeFund({ id: 'f2', fundNumber: 2, amount: 5000 }),
    ];
    const summary = getProjectFundsSummary(PID, funds, [], []);
    expect(summary.totalTransferred).toBe(15000);
    expect(summary.fundCount).toBe(2);
  });

  it('cash in manager hand = sum of remaining for unsettled funds', () => {
    const funds = [
      makeFund({ id: 'f1', amount: 10000, status: 'acknowledged' }),
    ];
    const expenses = [makeExpense({ amount: 3000, fundId: 'f1' })];
    const summary = getProjectFundsSummary(PID, funds, [], expenses);
    expect(summary.remainingInManagerHand).toBe(7000);
  });

  it('settled funds do not count in cash-in-hand', () => {
    const funds = [
      makeFund({ id: 'f1', amount: 10000, status: 'settled' }),
      makeFund({ id: 'f2', fundNumber: 2, amount: 5000, status: 'acknowledged' }),
    ];
    const summary = getProjectFundsSummary(PID, funds, [], []);
    expect(summary.remainingInManagerHand).toBe(5000);
  });
});

describe('getRemainingStatus', () => {
  it('returns critical when ratio < 10%', () => {
    expect(getRemainingStatus(500, 10000)).toBe('critical');
  });

  it('returns watch when ratio in [10%, 30%)', () => {
    expect(getRemainingStatus(2000, 10000)).toBe('watch');
  });

  it('returns healthy when ratio >= 30%', () => {
    expect(getRemainingStatus(5000, 10000)).toBe('healthy');
  });

  it('handles zero last fund safely', () => {
    expect(getRemainingStatus(1000, 0)).toBe('healthy');
  });
});

describe('calculateSettlementDifference', () => {
  it('computes received - spent - remaining', () => {
    expect(calculateSettlementDifference(10000, 7000, 3000)).toBe(0);
    expect(calculateSettlementDifference(10000, 7000, 2500)).toBe(500);
    expect(calculateSettlementDifference(10000, 8000, 3000)).toBe(-1000);
  });
});

describe('daysBetween', () => {
  it('returns positive integer days from past date', () => {
    const ref = new Date('2026-01-31');
    expect(daysBetween('2026-01-01', ref)).toBe(30);
  });
});

describe('getSettlementForFund', () => {
  it('finds the matching settlement', () => {
    const sts = [makeSettlement({ id: 's1', fundId: 'f1' })];
    expect(getSettlementForFund('f1', sts)?.id).toBe('s1');
  });
  it('returns null when not found', () => {
    expect(getSettlementForFund('nope', [])).toBeNull();
  });
});

// ─── Alerts ───
describe('canCreateNewFund', () => {
  it('blocks when an unsettled fund exists', () => {
    const funds = [makeFund({ status: 'acknowledged', fundNumber: 1 })];
    const result = canCreateNewFund(PID, funds);
    expect(result.allowed).toBe(false);
    expect(result.blockingFundNumber).toBe(1);
  });

  it('allows when all funds are settled', () => {
    const funds = [makeFund({ status: 'settled' })];
    expect(canCreateNewFund(PID, funds).allowed).toBe(true);
  });

  it('allows when no funds yet', () => {
    expect(canCreateNewFund(PID, []).allowed).toBe(true);
  });
});

describe('generateFundAlerts', () => {
  it('flags unsettled funds older than 30 days', () => {
    const oldDate = new Date(Date.now() - 35 * 86400 * 1000).toISOString();
    const funds = [makeFund({ status: 'acknowledged', acknowledgedAt: oldDate })];
    const alerts = generateFundAlerts(PID, funds, [], []);
    expect(alerts.some((a) => a.type === 'unsettled_long')).toBe(true);
  });

  it('flags low balance (<10% of last fund)', () => {
    const funds = [makeFund({ amount: 10000, status: 'acknowledged' })];
    const expenses = [makeExpense({ amount: 9500, fundId: 'f1' })];
    const alerts = generateFundAlerts(PID, funds, [], expenses);
    expect(alerts.some((a) => a.type === 'low_balance')).toBe(true);
  });

  it('flags expenses not linked to any fund when active fund exists', () => {
    const funds = [makeFund({ status: 'acknowledged' })];
    const expenses = [makeExpense({ amount: 100, fundId: undefined })];
    const alerts = generateFundAlerts(PID, funds, [], expenses);
    expect(alerts.some((a) => a.type === 'expense_unlinked')).toBe(true);
  });

  it('flags submitted settlement with unexplained difference', () => {
    const funds = [makeFund({ status: 'acknowledged' })];
    const settlements = [
      makeSettlement({ status: 'submitted', difference: 500, differenceReason: undefined }),
    ];
    const alerts = generateFundAlerts(PID, funds, settlements, []);
    expect(alerts.some((a) => a.type === 'unexplained_diff')).toBe(true);
  });

  it('does NOT flag difference when reason is provided', () => {
    const funds = [makeFund({ status: 'acknowledged' })];
    const settlements = [
      makeSettlement({ status: 'submitted', difference: 500, differenceReason: 'lost receipt' }),
    ];
    const alerts = generateFundAlerts(PID, funds, settlements, []);
    expect(alerts.some((a) => a.type === 'unexplained_diff')).toBe(false);
  });

  it('returns empty array for project with no funds', () => {
    expect(generateFundAlerts(PID, [], [], [])).toEqual([]);
  });

  it('sorts alerts by severity (critical → low)', () => {
    const oldDate = new Date(Date.now() - 35 * 86400 * 1000).toISOString();
    const funds = [makeFund({ status: 'acknowledged', acknowledgedAt: oldDate })];
    const expenses = [makeExpense({ amount: 100, fundId: undefined })];
    const alerts = generateFundAlerts(PID, funds, [], expenses);
    const order = { critical: 0, high: 1, medium: 2, low: 3 } as const;
    for (let i = 1; i < alerts.length; i++) {
      expect(order[alerts[i].severity]).toBeGreaterThanOrEqual(order[alerts[i - 1].severity]);
    }
  });
});

describe('settlement spent includes advances and cash transfers', () => {
  it('getFundSpent equals row "spent" when advances + transfers exist (no phantom diff)', () => {
    const fund = makeFund({ id: 'f1', amount: 67000, status: 'acknowledged' });
    // 65,000 expensed directly + 2,000 outstanding advance
    const expenses = [makeExpense({ id: 'e1', amount: 65000, fundId: 'f1' })];
    const prs = [makeRequest({ id: 'pr1', paidFromFundId: 'f1', isAdvanceOutstanding: true, amount: 2000 })];
    const spent = getFundSpent('f1', expenses, [], prs, []);
    expect(spent).toBe(67000);
    expect(getFundRemaining(fund, expenses, [], prs, [])).toBe(0);
    expect(calculateSettlementDifference(fund.amount, spent, 0)).toBe(0);
  });
});

describe('getFundOpenItems & auditFundFinancialLinks', () => {
  it('returns empty open items when no custodies/advances/transfers exist', () => {
    const open = getFundOpenItems('f1', [], [], [], []);
    expect(open.openCustodies).toHaveLength(0);
    expect(open.outstandingAdvances).toHaveLength(0);
    expect(open.cashTransfersOut).toHaveLength(0);
    expect(open.totalOpen).toBe(0);
  });

  it('detects expense double-linked to fund and custody', () => {
    const expenses: Expense[] = [
      makeExpense({ id: 'e-bad', fundId: 'f1', custodyId: 'c1' }),
      makeExpense({ id: 'e-ok', fundId: 'f1' }),
    ];
    const violations = auditFundFinancialLinks('f1', expenses, []);
    expect(violations).toHaveLength(1);
    expect(violations[0].id).toBe('e-bad');
    expect(violations[0].kind).toBe('expense_double_link');
  });

  it('detects payment_request double-linked source', () => {
    const prs = [
      makeRequest({ id: 'pr-bad', description: 'x', amount: 100, paidFromFundId: 'f1', paidFromCustodyId: 'c1' }),
      makeRequest({ id: 'pr-ok', description: 'y', amount: 200, paidFromFundId: 'f1', paidFromCustodyId: undefined }),
    ];
    const violations = auditFundFinancialLinks('f1', [], prs);
    expect(violations).toHaveLength(1);
    expect(violations[0].kind).toBe('payment_request_double_link');
  });
});

describe('Cash transfers — single source of truth', () => {
  it('cash transfer from fund drains manager cash and shows on custody side', () => {
    const fund = makeFund({ id: 'f1', amount: 5000, status: 'acknowledged' });
    const custody = makeCustody({ amount: 0 });
    const transfer = makeTransfer({ amount: 5000 });
    const summary = getProjectFundsSummary(PID, [fund], [], [], [custody], [], [transfer]);
    expect(summary.totalTransferred).toBe(5000);
    expect(summary.remainingInManagerHand).toBe(0);
    // fund remaining should also be 0 (drained by the transfer)
    expect(getFundRemaining(fund, [], [custody], [], [transfer])).toBe(0);
  });

  it('conservation: sum of buckets equals totalTransferred', () => {
    const fund = makeFund({ id: 'f1', amount: 10000, status: 'acknowledged' });
    const custody = makeCustody({ amount: 2000, sourceFundId: 'f1' });
    const transfer = makeTransfer({ amount: 3000 });
    const directExpense = makeExpense({ id: 'e1', fundId: 'f1', amount: 1000 });
    const summary = getProjectFundsSummary(PID, [fund], [], [directExpense], [custody], [], [transfer]);
    // buckets: direct spent + custody draw + cash-in-holders + manager hand
    const custodyHolders = custody.amount + transfer.amount; // 5000 (nothing spent on custody)
    const total = summary.totalDocumentedSpend + custodyHolders + summary.remainingInManagerHand;
    expect(total).toBe(fund.amount); // 1000 + 5000 + 4000 = 10000
    expect(summary.remainingInManagerHand).toBe(4000);
  });
});



describe('getFundRemainingBreakdown — SSOT unification', () => {
  it('breakdown.remaining === fund.amount − Σ(direct + custodyDraw + advances + cashOut)', () => {
    const fund = makeFund({ id: 'f1', amount: 5000 });
    const custody = makeCustody({ id: 'cu1', resourceName: 'R', amount: 0, sourceFundId: 'f1' });
    const transfer = makeTransfer({ toCustodyId: 'cu1', amount: 5000, transferDate: '2026-01-02' });
    const bd = getFundRemainingBreakdown(fund, [], [custody], [], [transfer]);
    expect(bd.direct).toBe(0);
    expect(bd.custodyDraw).toBe(0); // custody amount is 0
    expect(bd.cashTransfersOut).toBe(5000);
    expect(bd.spent).toBe(5000);
    expect(bd.remaining).toBe(0); // ★ الحالة الحرجة في الصور
  });

  it('matches getFundRemaining exactly', () => {
    const fund = makeFund({ amount: 10000 });
    const e = makeExpense({ fundId: fund.id, amount: 2000 });
    const bd = getFundRemainingBreakdown(fund, [e], [], [], []);
    expect(bd.remaining).toBe(getFundRemaining(fund, [e], [], [], []));
  });
});





describe('getProjectOutstandingAdvances', () => {
  it("counts each paid, unsettled advance of the project at what is still out on it", () => {
    const prs = [
      makeRequest({ id: 'a1', requestType: 'advance', status: 'paid', isAdvanceOutstanding: true, amount: 6000, refundedAmount: 1000 }),
      makeRequest({ id: 'a2', requestType: 'advance', status: 'paid', isAdvanceOutstanding: true, amount: 3000 }),
      // Settled, not yet paid, not an advance, and another project's: none is out.
      makeRequest({ id: 'a3', requestType: 'advance', status: 'paid', isAdvanceOutstanding: false, amount: 9000 }),
      makeRequest({ id: 'a4', requestType: 'advance', status: 'approved', isAdvanceOutstanding: true, amount: 700 }),
      makeRequest({ id: 's1', requestType: 'salary', status: 'paid', isAdvanceOutstanding: true, amount: 800 }),
      makeRequest({ id: 'a5', projectId: 'other', requestType: 'advance', status: 'paid', isAdvanceOutstanding: true, amount: 500 }),
      // More came back than went out: nothing is out, never a negative.
      makeRequest({ id: 'a6', requestType: 'advance', status: 'paid', isAdvanceOutstanding: true, amount: 100, refundedAmount: 150 }),
    ];
    expect(getProjectOutstandingAdvances(PID, prs)).toEqual({ total: 8000, count: 3 });
  });
});

describe('carried cash and repayments to the company', () => {
  it('counts a carried amount once in what was transferred, and keeps waiting cash in hand', () => {
    const funds = [
      makeFund({ id: 'f4', fundNumber: 4, amount: 5000, status: 'settled' }),
      makeFund({ id: 'f7', fundNumber: 7, amount: 60224, carriedIn: 224, status: 'acknowledged' }),
    ];
    const s = getProjectFundsSummary(PID, funds, [makeSettlement({ fundId: 'f4', status: 'approved', remainingCash: 224, carryStatus: 'carried' })], []);
    expect(s.totalTransferred).toBe(65000);
    expect(s.remainingInManagerHand).toBe(60224);
    expect(s.pendingCarry).toBe(0);

    const waiting = getProjectFundsSummary(PID, [makeFund({ id: 'f4', amount: 5000, status: 'settled' })],
      [makeSettlement({ fundId: 'f4', status: 'approved', remainingCash: 224, carryStatus: 'pending' })], []);
    expect(waiting.pendingCarry).toBe(224);
    expect(waiting.remainingInManagerHand).toBe(224);
  });

  it('takes a repayment out of the fund it left, without calling it spend', () => {
    const f = makeFund({ id: 'f7', amount: 1000, status: 'acknowledged', returnedOut: 700 });
    expect(getFundRemaining(f, [])).toBe(300);
    expect(getFundRemainingBreakdown(f, [])).toMatchObject({ direct: 0, returnedToCompany: 700, spent: 700, remaining: 300 });
    const s = getProjectFundsSummary(PID, [f], [], []);
    expect(s).toMatchObject({ totalDocumentedSpend: 0, totalReturnedToCompany: 700, remainingInManagerHand: 300 });
  });
});
