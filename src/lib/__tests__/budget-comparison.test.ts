import { describe, it, expect } from 'vitest';
import {
  distributeBudgetItem, getPlannedToDate, getActualForBudgetItem,
  groupByCategory, summarizeGroups,
} from '../budget-comparison';
import type { BudgetItem, Expense } from '@/types/project';

const bi = (over: Partial<BudgetItem>): BudgetItem => ({
  id: 'b1', projectId: 'p1', category: 'salary', description: 'x',
  plannedAmount: 1200, costType: 'fixed', costClass: 'direct',
  startMonth: 1, endMonth: 12, ...over,
});

const ex = (over: Partial<Expense>): Expense => ({
  id: 'e1', projectId: 'p1', category: 'salary', description: 'x', amount: 100,
  date: '2026-01-01', month: 1, approvalStatus: 'approved', isVatExempt: false,
  budgetItemId: 'b1', ...over,
});

describe('distributeBudgetItem', () => {
  it('spreads fixed evenly', () => {
    const d = distributeBudgetItem(bi({ plannedAmount: 1200, startMonth: 1, endMonth: 12 }), 12);
    expect(d[1]).toBeCloseTo(100);
    expect(d.reduce((s, v) => s + v, 0)).toBeCloseTo(1200);
  });
  it('recurring is monthly', () => {
    const d = distributeBudgetItem(bi({ costType: 'recurring', plannedAmount: 500, startMonth: 2, endMonth: 4 }), 12);
    expect(d[1]).toBe(0); expect(d[2]).toBe(500); expect(d[4]).toBe(500); expect(d[5]).toBe(0);
  });
  it('one_time lands in single month', () => {
    const d = distributeBudgetItem(bi({ costType: 'one_time', plannedAmount: 700, month: 3 }), 12);
    expect(d[3]).toBe(700);
  });
});

describe('getPlannedToDate', () => {
  it('cumulative up to currentMonth', () => {
    const pv = getPlannedToDate(bi({ plannedAmount: 1200 }), 12, 3);
    expect(pv).toBeCloseTo(300);
  });
});

describe('getActualForBudgetItem', () => {
  it('excludes rejected and outstanding advances', () => {
    const exps: Expense[] = [
      ex({ id: '1', amount: 100 }),
      ex({ id: '2', amount: 200, approvalStatus: 'rejected' }),
      ex({ id: '3', amount: 300, isOutstandingAdvance: true }),
      ex({ id: '4', amount: 50 }),
    ];
    expect(getActualForBudgetItem('b1', exps)).toBe(150);
  });
});

describe('groupByCategory', () => {
  it('aggregates per-category and computes variance/severity', () => {
    const items: BudgetItem[] = [
      bi({ id: 'b1', category: 'salary', plannedAmount: 1200 }),
      bi({ id: 'b2', category: 'travel', plannedAmount: 600 }),
    ];
    const exps: Expense[] = [
      ex({ id: 'e1', budgetItemId: 'b1', amount: 400 }),  // PV at m=3 = 300, AC=400 → over
      ex({ id: 'e2', budgetItemId: 'b2', amount: 100 }),  // PV at m=3 = 150, AC=100 → under
    ];
    const groups = groupByCategory(items, exps, 12, 3);
    const salary = groups.find(g => g.category === 'salary')!;
    expect(salary.actual).toBe(400);
    expect(salary.plannedToDate).toBeCloseTo(300);
    expect(salary.variance).toBeCloseTo(100);
    expect(salary.severity).toBe('critical');

    const total = summarizeGroups(groups);
    expect(total.planned).toBeCloseTo(1800);
    expect(total.actual).toBe(500);
  });
});
