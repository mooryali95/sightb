/**
 * The spend trend must read the same monthly spend as the bars beside it
 * and the variance table under it: a rejected expense is not spend, and
 * an advance still outstanding is a receivable, in all three alike.
 */
import { describe, it, expect } from 'vitest';
import { getSpendTrend } from '@/lib/finance/trend';
import { getMonthlyBreakdown } from '@/lib/finance';
import type { Expense } from '@/types/project';

function expense(over: Partial<Expense>): Expense {
  return {
    id: 'e', projectId: 'p', category: 'other', description: '', amount: 0, date: '2026-01-01', month: 1,
    approvalStatus: 'approved', isVatExempt: false, ...over,
  };
}
const expenses: Expense[] = [
  expense({ id: 'a', amount: 12000, month: 3 }),
  expense({ id: 'b', amount: 5000, month: 4 }),
  expense({ id: 'rejected', amount: 9000, month: 4, approvalStatus: 'rejected' }),
  expense({ id: 'advance', amount: 8000, month: 5, isOutstandingAdvance: true }),
  expense({ id: 'pending', amount: 2000, month: 5, approvalStatus: 'pending' }),
];

describe('getSpendTrend', () => {
  it('reads the counted spend of each month, the running burn rate and the plan\'s monthly average', () => {
    const rows = getSpendTrend(expenses, 400000, 12);
    expect(rows).toHaveLength(12);
    expect(rows[3]).toEqual({ month: 'شهر 4', 'الفعلي': 5000, 'معدل الحرق': 4250, 'المتوسط المخطط': 33333 });
    expect(rows[4]).toMatchObject({ 'الفعلي': 2000, 'معدل الحرق': 3800 });
    expect(rows.map((r) => r['الفعلي'])).toEqual(getMonthlyBreakdown(expenses, 12));
  });

  it('is empty with no expenses or no duration', () => {
    expect(getSpendTrend([], 400000, 12)).toEqual([]);
    expect(getSpendTrend(expenses, 400000, 0)).toEqual([]);
  });
});
