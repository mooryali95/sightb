/**
 * useProjectDetailData is the single source of every figure on the
 * project page. What is tested is agreement: the per-item actual, the
 * category pie and the monthly bars must count the same expenses the
 * summary counts, and the VAT rate handed down must be the project's own.
 *
 * Three tests were red when written. The per-item actual (which feeds the
 * Excel budget sheet) and the category breakdown (which feeds the
 * overview pie) summed every expense, rejected ones and outstanding
 * advances included, while the summary beside them counts neither; and
 * a project with 0% VAT was handed 15%, because `|| 15` treats zero as
 * missing. The fix commit that follows turns them green without editing
 * a test.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useStore, type AppState } from '@/store/useStore';
import type { BudgetItem, Expense, Project } from '@/types/project';
import { useProjectDetailData } from '../useProjectDetailData';

vi.mock('@/hooks/useRole', () => ({
  useRole: () => ({
    roles: [], isAdmin: true, isOwner: false, isScopedAdmin: true, isAdminFor: () => true,
    canEdit: () => true, hasAccess: () => true, loading: false,
  }),
}));
vi.mock('@/hooks/useAppData', () => ({ useCoreData: () => undefined, useProjectData: () => undefined }));

const PROJECT_ID = 'p-1';

function project(over: Partial<Project> = {}): Project {
  return {
    id: PROJECT_ID, companyId: 'co-1', name: 'مشروع', contractValue: 100000, currency: 'SAR',
    startDate: '2026-01-01', endDate: '2026-06-30', durationMonths: 6, resourceCount: 1,
    status: 'active', createdAt: '', percentComplete: 30, contractType: 'lump_sum',
    retentionPercent: 0, managementReserve: 0, taxPercent: 15, vatInclusive: false, ...over,
  };
}

function expense(over: Partial<Expense>): Expense {
  return {
    id: 'e', projectId: PROJECT_ID, category: 'consulting', description: '', amount: 0, date: '2026-02-01', month: 2,
    approvalStatus: 'approved', isVatExempt: false, budgetItemId: 'b-1', ...over,
  };
}

const budgetItem = {
  id: 'b-1', projectId: PROJECT_ID, category: 'consulting', description: 'استشارات', plannedAmount: 20000,
  costType: 'fixed', costClass: 'direct',
} as BudgetItem;

const expenses: Expense[] = [
  expense({ id: 'ok', amount: 5000 }),
  expense({ id: 'rejected', amount: 3000, approvalStatus: 'rejected' }),
  expense({ id: 'advance', amount: 2000, isOutstandingAdvance: true, month: 3 }),
  expense({ id: 'other-cat', amount: 700, category: 'travel', budgetItemId: undefined, month: 3 }),
  expense({ id: 'elsewhere', projectId: 'another-project', amount: 9999 }),
];

function seed(over: Partial<AppState> = {}) {
  useStore.setState({
    projects: [project()], companies: [], portfolios: [], budgetItems: [budgetItem], expenses, revenues: [],
    resources: [], custodies: [], milestones: [], changeOrders: [], risks: [], baselines: [], commitments: [],
    projectFunds: [], fundSettlements: [], paymentRequests: [], cashTransfers: [],
    detailsLoaded: true,
    loadProjectData: vi.fn().mockResolvedValue(undefined),
    subscribeToProject: vi.fn(() => () => undefined),
    ensureProjectCashData: vi.fn().mockResolvedValue(undefined),
    ...over,
  } satisfies Partial<AppState>);
}

beforeEach(() => seed());

describe('useProjectDetailData', () => {
  it('returns no figures for an unknown project', () => {
    const { result } = renderHook(() => useProjectDetailData('nope'));
    expect(result.current.project).toBeUndefined();
  });

  it('counts the same expenses in the summary, the per-item actual, the pie and the bars', () => {
    const { result } = renderHook(() => useProjectDetailData(PROJECT_ID));
    const d = result.current;
    if (!d.project) throw new Error('project missing');
    // 5,000 + 700 counted; the rejected 3,000 and the outstanding 2,000 are
    // not spend, and the 9,999 on another project is not this project's.
    expect(d.summary.totalActual).toBe(5700);
    expect(d.getActualForItem(budgetItem)).toBe(5000);
    expect(d.pieData).toEqual([
      { name: 'استشارات', value: 5000 },
      { name: 'سفر وتنقل', value: 700 },
    ]);
    expect(d.barData.map((b) => b.مصروفات)).toEqual([0, 5000, 700, 0, 0, 0]);
  });

  it('hands down the project\'s own VAT rate, zero included', () => {
    seed({ projects: [project({ taxPercent: 0 })] });
    const zero = renderHook(() => useProjectDetailData(PROJECT_ID));
    expect(zero.result.current.project && zero.result.current.vatRate).toBe(0);

    seed({ projects: [project({ taxPercent: 5 })] });
    const five = renderHook(() => useProjectDetailData(PROJECT_ID));
    expect(five.result.current.project && five.result.current.vatRate).toBe(5);
  });

  it('counts what waits for a decision', () => {
    seed({ expenses: [...expenses, expense({ id: 'pending', amount: 100, approvalStatus: 'pending' })] });
    const { result } = renderHook(() => useProjectDetailData(PROJECT_ID));
    expect(result.current.project && result.current.pendingExpensesCount).toBe(1);
  });

  it('loads the project\'s cash data and subscribes to it once', () => {
    const ensure = vi.fn().mockResolvedValue(undefined);
    const unsubscribe = vi.fn();
    const subscribe = vi.fn(() => unsubscribe);
    seed({ ensureProjectCashData: ensure, subscribeToProject: subscribe });
    const { unmount } = renderHook(() => useProjectDetailData(PROJECT_ID));
    expect(ensure).toHaveBeenCalledWith(PROJECT_ID);
    expect(subscribe).toHaveBeenCalledWith(PROJECT_ID);
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('baseline lock', () => {
  it("loads the project's baselines on mount, so the lock is known before the baseline section opens", () => {
    const loadBaselines = vi.fn().mockResolvedValue([]);
    seed({ loadBaselines });
    renderHook(() => useProjectDetailData(PROJECT_ID));
    expect(loadBaselines).toHaveBeenCalledWith(PROJECT_ID);
  });
});
