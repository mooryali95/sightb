/**
 * getExpensesByCategory feeds the overview pie. It must count the same
 * rows getProjectSummary counts as spend: not a rejected expense, not an
 * advance still outstanding.
 */
import { describe, it, expect } from 'vitest';
import { getExpensesByCategory } from '@/lib/finance';
import type { Expense } from '@/types/project';

function expense(over: Partial<Expense>): Expense {
  return {
    id: 'e', projectId: 'p', category: 'other', description: '', amount: 0, date: '2026-01-01', month: 1,
    approvalStatus: 'approved', isVatExempt: false, ...over,
  };
}

describe('getExpensesByCategory', () => {
  it('sums approved and pending spend per category, leaving out rejected rows and outstanding advances', () => {
    expect(getExpensesByCategory([
      expense({ id: 'a', category: 'travel', amount: 100 }),
      expense({ id: 'b', category: 'travel', amount: 50, approvalStatus: 'pending' }),
      expense({ id: 'c', category: 'travel', amount: 1000, approvalStatus: 'rejected' }),
      expense({ id: 'd', category: 'salary', amount: 300, isOutstandingAdvance: true }),
      expense({ id: 'e', category: 'salary', amount: 20 }),
    ])).toEqual({ travel: 150, salary: 20 });
  });
});
