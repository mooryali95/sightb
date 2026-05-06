import { describe, it, expect } from 'vitest';
import {
  getFundSpent,
  getFundRemaining,
  getActiveFund,
  getProjectFundsSummary,
  getRemainingStatus,
  calculateSettlementDifference,
  daysBetween,
  getSettlementForFund,
} from '../funds';
import { generateFundAlerts, canCreateNewFund } from '../fund-alerts';
import type { ProjectFund, FundSettlement, Expense } from '@/types/project';

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
    const funds = [makeFund({ status: 'settled' as any })];
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
