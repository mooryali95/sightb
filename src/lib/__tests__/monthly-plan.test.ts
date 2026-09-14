/**
 * The monthly budget plan: how each budget item lands on its months, which
 * expenses count, which revenues are cash, and the status of each month.
 * Written before the component that renders it is split; the lib had no
 * tests of its own.
 */
import { describe, it, expect } from 'vitest';
import { getMonthlyBudgetPlan } from '@/lib/finance';
import type { BudgetItem, Expense, Revenue } from '@/types/project';

const item = (over: Partial<BudgetItem>): BudgetItem =>
  ({ id: 'b', projectId: 'p', category: 'salary', description: 'بند', plannedAmount: 0, costType: 'fixed', costClass: 'direct', ...over }) as BudgetItem;
const expense = (over: Partial<Expense>): Expense =>
  ({ id: 'e', projectId: 'p', category: 'salary', description: 'مصروف', amount: 0, date: '2020-01-05', month: 1, approvalStatus: 'approved', isVatExempt: false, ...over });
const revenue = (over: Partial<Revenue>): Revenue =>
  ({ id: 'r', projectId: 'p', description: 'دفعة', amount: 0, date: '2020-01-05', month: 1, revenueType: 'milestone', status: 'planned', ...over });

// A project that started long ago: the current month is the last one.
const START = '2020-01-01';

describe('how items land on months', () => {
  it('spreads an unranged item evenly, repeats a recurring one, drops a one-time one on its month, and splits a fixed range', () => {
    const rows = getMonthlyBudgetPlan([
      item({ id: 'even', description: 'موزّع', plannedAmount: 1200 }),
      item({ id: 'rec', description: 'راتب', plannedAmount: 100, costType: 'recurring', startMonth: 2, endMonth: 4 }),
      item({ id: 'once', description: 'جهاز', plannedAmount: 500, costType: 'one_time', month: 3 }),
      item({ id: 'range', description: 'إيجار', plannedAmount: 600, costType: 'fixed', startMonth: 5, endMonth: 6 }),
    ], [], [], 6, START);
    expect(rows.map((r) => r.planned)).toEqual([200, 300, 800, 300, 500, 500]);
    expect(rows[2].items.map((i) => `${i.description}:${i.amount}`)).toEqual(['موزّع:200', 'راتب:100', 'جهاز:500']);
    expect(rows[5].cumulativePlanned).toBe(2600);
  });

  it('clamps a range to the project and ignores a month outside it', () => {
    const rows = getMonthlyBudgetPlan([
      item({ id: 'late', plannedAmount: 100, costType: 'recurring', startMonth: 5, endMonth: 9 }),
      item({ id: 'gone', plannedAmount: 900, costType: 'one_time', month: 8 }),
    ], [], [], 6, START);
    expect(rows.map((r) => r.planned)).toEqual([0, 0, 0, 0, 100, 100]);
  });
});

describe('what counts as actual', () => {
  it('sums approved and pending spend by month, never a rejected expense or an outstanding advance, and only collected revenue', () => {
    const rows = getMonthlyBudgetPlan([item({ plannedAmount: 600 })], [
      expense({ id: 'a', amount: 100, month: 1 }),
      expense({ id: 'p', amount: 50, month: 1, approvalStatus: 'pending' }),
      expense({ id: 'x', amount: 999, month: 1, approvalStatus: 'rejected' }),
      expense({ id: 'adv', amount: 999, month: 2, isOutstandingAdvance: true }),
      expense({ id: 'out', amount: 999, month: 9 }),
    ], [
      revenue({ id: 'c', amount: 400, month: 1, status: 'collected' }),
      revenue({ id: 'i', amount: 300, month: 1, status: 'invoiced' }),
    ], 6, START);
    expect(rows[0].actual).toBe(150);
    expect(rows[1].actual).toBe(0);
    expect(rows[0].plannedRevenue).toBe(700);
    expect(rows[0].actualRevenue).toBe(400);
    expect(rows[0].netCashFlow).toBe(250);
    expect(rows[5].cumulativeActual).toBe(150);
  });
});

describe('the status of a month', () => {
  it('rates an elapsed month by its utilisation, calls a coming month future, and an empty one inactive', () => {
    // Started five months ago: month 6 is current, 7 onward are future.
    const start = new Date();
    start.setMonth(start.getMonth() - 5, 1);
    const rows = getMonthlyBudgetPlan(
      [item({ plannedAmount: 100, costType: 'recurring', startMonth: 1, endMonth: 8 })],
      [
        expense({ id: '1', amount: 50, month: 1 }),
        expense({ id: '2', amount: 90, month: 2 }),
        expense({ id: '3', amount: 120, month: 3 }),
        expense({ id: '4', amount: 10, month: 7 }),
      ],
      [], 10, start.toISOString().slice(0, 10),
    );
    expect(rows.map((r) => r.status)).toEqual([
      'on_track', 'near_limit', 'over', 'on_track', 'on_track', 'on_track', 'future', 'future', 'inactive', 'inactive',
    ]);
    expect(rows[5].isCurrent).toBe(true);
    expect(rows[4].isPast).toBe(true);
    expect(rows.map((r) => r.utilizationPct)[2]).toBe(120);
  });

  it('flags spend where nothing was planned as over, and takes the middle month as current when there is no start date', () => {
    const rows = getMonthlyBudgetPlan([], [expense({ amount: 10, month: 2 })], [], 4);
    expect(rows[1].status).toBe('over');
    expect(rows[1].utilizationPct).toBe(999);
    expect(rows.find((r) => r.isCurrent)?.month).toBe(2);
  });
});
