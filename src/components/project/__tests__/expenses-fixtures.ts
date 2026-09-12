/**
 * Fixtures for the expenses section's component tests.
 *
 * One acknowledged 50,000 fund. Against it: 7,000 and 5,000 approved, a
 * 3,000 that was rejected, and a 500 still pending. The amounts are distinct
 * enough that any total tells which rows it counted.
 */
import type { Expense, ProjectFund, Resource } from '@/types/project';

export const PROJECT_ID = 'project-under-test';
export const FUND_ID = 'fund-1';
export const RESOURCE_ID = 'res-1';

export const resource: Resource = {
  id: RESOURCE_ID,
  projectId: PROJECT_ID,
  name: 'سالم',
  role: 'مهندس',
  monthlyCost: 10000,
  createdAt: '2026-01-01T00:00:00Z',
};

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
    category: 'consulting',
    description: 'بند',
    amount: 0,
    date: '2026-02-10',
    month: 2,
    approvalStatus: 'approved',
    isVatExempt: false,
    fundId: FUND_ID,
    responsible: 'أحمد',
    ...over,
  };
}

export const expenses: Expense[] = [
  expense({ id: 'exp-1', amount: 7000, description: 'استشارة تصميم', resourceId: RESOURCE_ID }),
  expense({ id: 'exp-2', amount: 5000, description: 'استشارة إنشائية' }),
  expense({ id: 'exp-rejected', amount: 3000, description: 'استشارة مرفوضة', approvalStatus: 'rejected', resourceId: RESOURCE_ID }),
  expense({ id: 'exp-pending', amount: 500, description: 'استشارة معلّقة', approvalStatus: 'pending', responsible: 'ليلى' }),
];

/** A legacy row: an advance still outstanding, which the table must hide. */
export const outstandingAdvanceExpense = expense({
  id: 'exp-advance', amount: 2000, description: 'سلفة قائمة قديمة', isOutstandingAdvance: true,
});
