/**
 * The portfolio's cumulative cash flow sums each project's running
 * position. A project that ends before the others keeps its final
 * position in the later months; dropping it would make the portfolio's
 * cumulative line fall with no money moving.
 */
import { describe, it, expect } from 'vitest';
import { aggregateCashFlow } from '../portfolioFigures';
import type { BudgetItem, Expense, Project, Revenue } from '@/types/project';

const project = (id: string, durationMonths: number) => ({
  id, companyId: 'c', name: id, contractValue: 100000, currency: 'SAR', startDate: '2026-01-01', durationMonths,
  resourceCount: 1, status: 'active', createdAt: '2026-01-01', percentComplete: 0, contractType: 'lump_sum',
  retentionPercent: 0, managementReserve: 0, taxPercent: 15, vatInclusive: false,
}) as unknown as Project;
const item = (id: string, projectId: string, plannedAmount: number): BudgetItem =>
  ({ id, projectId, category: 'other', description: id, plannedAmount, costType: 'fixed', costClass: 'direct' }) as BudgetItem;
const expense = (id: string, projectId: string, amount: number, month: number): Expense =>
  ({ id, projectId, category: 'other', description: id, amount, date: '2026-01-01', month, approvalStatus: 'approved', isVatExempt: false }) as Expense;
const revenue = (id: string, projectId: string, amount: number, month: number): Revenue =>
  ({ id, projectId, description: id, amount, date: '2026-01-01', month, revenueType: 'milestone', status: 'collected' }) as Revenue;

describe('aggregateCashFlow', () => {
  // A: twelve months, 12,000 planned (1,000 a month), 2,000 spent in month 1.
  // B: three months, 3,000 planned (1,000 a month), 6,000 collected in month 2.
  const rows = aggregateCashFlow(
    [project('A', 12), project('B', 3)],
    [item('a', 'A', 12000), item('b', 'B', 3000)],
    [expense('ea', 'A', 2000, 1)],
    [revenue('rb', 'B', 6000, 2)],
  );

  it('runs to the longest project and sums both positions while both run', () => {
    expect(rows).toHaveLength(12);
    expect(rows[2]).toEqual({ month: 3, مخطط: -3000 + 3000, فعلي: -2000 + 6000 });
  });

  it("keeps an ended project's final position in every later month", () => {
    // Month 4: A has planned 4,000 out; B ended at +3,000 planned and +6,000 actual.
    expect(rows[3]).toEqual({ month: 4, مخطط: -4000 + 3000, فعلي: -2000 + 6000 });
    expect(rows[11]).toEqual({ month: 12, مخطط: -12000 + 3000, فعلي: -2000 + 6000 });
    // Nothing moves after month 3 on the actual side, so the line stays flat instead of dropping.
    expect(new Set(rows.slice(2).map((r) => r['فعلي']))).toEqual(new Set([4000]));
  });

  it('is empty with no project', () => {
    expect(aggregateCashFlow([], [], [], [])).toEqual([]);
  });
});
