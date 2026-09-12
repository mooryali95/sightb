/**
 * getMonthlyBreakdown feeds every monthly "actual" in the app: the cash-flow
 * forecast, the charts, the baseline and the EVM actual cost. It must count
 * the same rows getProjectSummary counts as spend, or a page's chart and
 * its total disagree.
 */
import { describe, it, expect } from 'vitest';
import { getMonthlyBreakdown, getProjectSummary } from '@/lib/finance';
import type { Expense, Project } from '@/types/project';

function expense(over: Partial<Expense>): Expense {
  return {
    id: 'e', projectId: 'p', category: 'other', description: '', amount: 0, date: '2026-01-01', month: 1,
    approvalStatus: 'approved', isVatExempt: false, ...over,
  };
}

const expenses: Expense[] = [
  expense({ id: 'a', amount: 100, month: 1 }),
  expense({ id: 'b', amount: 50, month: 2 }),
  expense({ id: 'rejected', amount: 1000, month: 2, approvalStatus: 'rejected' }),
  expense({ id: 'advance', amount: 300, month: 3, isOutstandingAdvance: true }),
  expense({ id: 'late', amount: 7, month: 9 }),
];

describe('getMonthlyBreakdown', () => {
  it('leaves out rejected expenses and outstanding advances, and months past the horizon', () => {
    expect(getMonthlyBreakdown(expenses, 3)).toEqual([100, 50, 0]);
  });

  it('sums to what the project summary calls actual spend', () => {
    const project = {
      id: 'p', companyId: 'c', name: 'p', contractValue: 1000, currency: 'SAR', startDate: '2026-01-01', endDate: '2026-03-31',
      durationMonths: 3, resourceCount: 1, status: 'active', createdAt: '', percentComplete: 0,
      contractType: 'lump_sum', retentionPercent: 0, managementReserve: 0, taxPercent: 0, vatInclusive: false,
    } satisfies Project;
    const inHorizon = expenses.filter(e => e.month <= 3);
    const monthly = getMonthlyBreakdown(inHorizon, 3).reduce((s, v) => s + v, 0);
    expect(monthly).toBe(getProjectSummary(project, [], inHorizon, []).totalActual);
  });
});
