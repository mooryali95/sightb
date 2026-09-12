/**
 * The five tab badges tell the user where attention is needed. What each
 * counts must match what the tab it points at would show: a rejected
 * expense is not spend on the finance tab, so it cannot push a budget
 * item over 90% here.
 *
 * One test was red when written: the over-budget count summed every
 * expense linked to the item, rejected ones and outstanding advances
 * included. The fix commit that follows turns it green without editing a
 * test.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useStore, type AppState } from '@/store/useStore';
import type { CostBaseline, BudgetItem, ChangeOrder, Expense, Milestone, Risk } from '@/types/project';
import { useTabBadges } from '../useTabBadges';

const PROJECT_ID = 'p-1';

function expense(over: Partial<Expense>): Expense {
  return {
    id: 'e', projectId: PROJECT_ID, category: 'other', description: '', amount: 0, date: '2026-03-01', month: 1,
    approvalStatus: 'approved', isVatExempt: false, ...over,
  };
}

const budgetItem: BudgetItem = {
  id: 'b-1', projectId: PROJECT_ID, category: 'other', description: 'بند', plannedAmount: 1000,
  costType: 'fixed', costClass: 'direct',
} as BudgetItem;

const milestone = (over: Partial<Milestone>): Milestone => ({
  id: 'm', projectId: PROJECT_ID, name: 'مرحلة', sortOrder: 1, percentComplete: 0, weight: 0.5, status: 'planned',
  createdAt: '2026-01-01T00:00:00Z', ...over,
});

const risk = (over: Partial<Risk>): Risk => ({
  id: 'r', projectId: PROJECT_ID, title: 'خطر', probability: 'medium', impact: 'medium', financialImpact: 0,
  category: 'financial', status: 'open', createdAt: '2026-01-01T00:00:00Z', ...over,
} as Risk);

const changeOrder = (over: Partial<ChangeOrder>): ChangeOrder => ({
  id: 'co', projectId: PROJECT_ID, title: 'أمر', type: 'other', status: 'proposed', amount: 0, createdAt: '2026-01-01T00:00:00Z', ...over,
} as ChangeOrder);

function seed(over: Partial<AppState>) {
  useStore.setState({
    expenses: [], budgetItems: [], baselines: [], milestones: [], risks: [], changeOrders: [],
    ...over,
  } satisfies Partial<AppState>);
}

beforeEach(() => seed({}));

describe('useTabBadges', () => {
  it('is quiet with no project', () => {
    const { result } = renderHook(() => useTabBadges(undefined));
    expect(result.current.finance.count).toBe(0);
    expect(result.current.planning.count).toBe(0);
  });

  it('counts pending expenses and items at 90% of plan on the finance tab', () => {
    seed({
      budgetItems: [budgetItem],
      expenses: [
        expense({ id: 'a', amount: 500, budgetItemId: 'b-1' }),
        expense({ id: 'b', amount: 450, budgetItemId: 'b-1', approvalStatus: 'pending' }),
      ],
    });
    const { result } = renderHook(() => useTabBadges(PROJECT_ID));
    // 950 of 1,000 is past 90%, and one expense waits for approval.
    expect(result.current.finance).toMatchObject({ count: 2, level: 'critical' });
  });

  it('does not let a rejected expense or an outstanding advance push an item over budget', () => {
    seed({
      budgetItems: [budgetItem],
      expenses: [
        expense({ id: 'a', amount: 500, budgetItemId: 'b-1' }),
        expense({ id: 'rejected', amount: 600, budgetItemId: 'b-1', approvalStatus: 'rejected' }),
        expense({ id: 'advance', amount: 400, budgetItemId: 'b-1', isOutstandingAdvance: true }),
      ],
    });
    const { result } = renderHook(() => useTabBadges(PROJECT_ID));
    // The finance tab counts 500 against this item; the other two are not spend.
    expect(result.current.finance).toMatchObject({ count: 0, level: 'info' });
  });

  it('asks for a baseline until one is active, and counts delayed milestones', () => {
    seed({ milestones: [milestone({ id: 'late', status: 'delayed' }), milestone({ id: 'ok', status: 'in_progress' })] });
    const noBaseline = renderHook(() => useTabBadges(PROJECT_ID));
    expect(noBaseline.result.current.planning).toMatchObject({ count: 2, level: 'warning', hint: 'لم يُعتمد خط الأساس بعد' });

    seed({
      milestones: [milestone({ id: 'late', status: 'delayed' })],
      baselines: [{ id: 'bl', projectId: PROJECT_ID, isActive: true } as CostBaseline],
    });
    const withBaseline = renderHook(() => useTabBadges(PROJECT_ID));
    expect(withBaseline.result.current.planning).toMatchObject({ count: 1, hint: '1 مرحلة متأخرة' });
  });

  it('counts open high-impact risks and proposed change orders on tracking, and proposed orders on management', () => {
    seed({
      risks: [
        risk({ id: 'high-open', impact: 'high' }),
        risk({ id: 'high-closed', impact: 'very_high', status: 'closed' }),
        risk({ id: 'low-open', impact: 'low' }),
      ],
      changeOrders: [changeOrder({ id: 'p1' }), changeOrder({ id: 'approved', status: 'approved' })],
    });
    const { result } = renderHook(() => useTabBadges(PROJECT_ID));
    expect(result.current.tracking).toMatchObject({ count: 2, level: 'critical' });
    expect(result.current.management).toMatchObject({ count: 1, level: 'warning' });
  });

  it('ignores everything on other projects', () => {
    seed({
      expenses: [expense({ id: 'x', projectId: 'other', approvalStatus: 'pending' })],
      risks: [risk({ id: 'y', projectId: 'other', impact: 'high' })],
      changeOrders: [changeOrder({ id: 'z', projectId: 'other' })],
    });
    const { result } = renderHook(() => useTabBadges(PROJECT_ID));
    expect(result.current.finance.count).toBe(0);
    expect(result.current.tracking.count).toBe(0);
    expect(result.current.management.count).toBe(0);
  });
});
