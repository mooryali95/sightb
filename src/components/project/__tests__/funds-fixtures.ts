/**
 * Fixtures for the funds section's component tests.
 *
 * One 50,000 fund with 12,000 spent directly against it, so the cash that
 * must still be in hand is 38,000. The same shape the e2e settlement path
 * uses, so a figure that disagrees between the two suites is a finding.
 */
import type { Expense, FundSettlement, ProjectFund } from '@/types/project';

export const PROJECT_ID = 'project-under-test';
export const OTHER_PROJECT_ID = 'a-different-project';
export const FUND_ID = 'fund-1';

export function fund(over: Partial<ProjectFund> = {}): ProjectFund {
  return {
    id: FUND_ID,
    projectId: PROJECT_ID,
    fundNumber: 1,
    amount: 50000,
    transferDate: '2026-02-01',
    status: 'acknowledged',
    acknowledgedAt: '2026-02-02T00:00:00Z',
    createdBy: 'user-1',
    createdAt: '2026-02-01T00:00:00Z',
    updatedAt: '2026-02-02T00:00:00Z',
    ...over,
  };
}

export function expense(over: Partial<Expense> = {}): Expense {
  return {
    id: 'exp',
    projectId: PROJECT_ID,
    category: 'materials',
    description: 'مواد',
    amount: 0,
    date: '2026-02-10',
    month: 2,
    approvalStatus: 'approved',
    isVatExempt: false,
    fundId: FUND_ID,
    ...over,
  };
}

/** 7,000 + 5,000 against the fund; the foreign one must never count. */
export const expenses: Expense[] = [
  expense({ id: 'exp-1', amount: 7000, description: 'حديد' }),
  expense({ id: 'exp-2', amount: 5000, description: 'أسمنت' }),
  expense({ id: 'exp-foreign', amount: 9999, projectId: OTHER_PROJECT_ID, fundId: 'fund-elsewhere' }),
];

export function settlement(over: Partial<FundSettlement> = {}): FundSettlement {
  return {
    id: 'settlement-1',
    fundId: FUND_ID,
    projectId: PROJECT_ID,
    totalReceived: 50000,
    totalSpent: 12000,
    remainingCash: 0,
    difference: 0,
    status: 'draft',
    attachments: [],
    createdAt: '2026-02-02T00:00:00Z',
    ...over,
  };
}
