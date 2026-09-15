/**
 * Unit tests for the dashboard's derivations, called directly. The page
 * tests already read the cards; these pin the pure pieces at their edges:
 * which period a filter names and what the previous one is, how a date
 * lands in or out of it, which projects the filters leave, the "n of m"
 * denominator, and that every headline figure counts the same rows.
 */
import { describe, it, expect } from 'vitest';
import type { BudgetItem, ChangeOrder, Company, Expense, Portfolio, Project, Revenue, Risk } from '@/types/project';
import { dashboardFigures, defaultVisibleCount, filterProjects, isInRange, periodRanges, type DashboardFilters } from '../dashboardFigures';

const one = <T,>(row: Partial<T>): T => row as T;
const NOW = new Date('2026-09-15T12:00:00Z');
const filters = (over: Partial<DashboardFilters> = {}): DashboardFilters => ({
  filterCompany: 'all', filterStatus: 'all', searchQuery: '', timePeriod: 'all', showInactive: false, ...over,
});

const companies = [one<Company>({ id: 'c1', name: 'الأفق', status: 'active' }), one<Company>({ id: 'c2', name: 'المؤرشفة', status: 'archived' })];
const projects = [
  one<Project>({ id: 'p1', companyId: 'c1', portfolioId: 'pf1', name: 'مشروع الرياض', status: 'active', contractValue: 100000 }),
  one<Project>({ id: 'p2', companyId: 'c1', name: 'مشروع جدة', status: 'completed', contractValue: 50000 }),
  one<Project>({ id: 'p3', companyId: 'c2', name: 'مشروع قديم', status: 'active', contractValue: 70000 }),
];

describe('periodRanges', () => {
  it('names the current month, quarter or year and the one before it, and nothing for all time', () => {
    const month = periodRanges('month', NOW);
    expect(month.currentRange).toEqual({ start: new Date('2026-09-01T00:00:00.000Z'), end: new Date('2026-09-30T23:59:59.999Z') });
    expect(month.previousRange).toEqual({ start: new Date('2026-08-01T00:00:00.000Z'), end: new Date('2026-08-31T23:59:59.999Z') });
    const quarter = periodRanges('quarter', NOW);
    expect(quarter.currentRange?.start).toEqual(new Date('2026-07-01T00:00:00.000Z'));
    expect(quarter.previousRange?.end).toEqual(new Date('2026-06-30T23:59:59.999Z'));
    const year = periodRanges('year', NOW);
    expect(year.currentRange?.start).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    expect(year.previousRange?.start).toEqual(new Date('2025-01-01T00:00:00.000Z'));
    expect(periodRanges('all', NOW)).toEqual({ currentRange: null, previousRange: null });
  });
});

describe('isInRange', () => {
  it('includes the boundaries, accepts everything for all time, and puts a bad date outside the period without throwing', () => {
    const range = periodRanges('month', NOW).currentRange;
    expect(isInRange('2026-09-01', range)).toBe(true);
    expect(isInRange('2026-09-30', range)).toBe(true);
    expect(isInRange('2026-08-31', range)).toBe(false);
    expect(isInRange('2026-10-01', range)).toBe(false);
    expect(isInRange('2026-10-01', null)).toBe(true);
    expect(isInRange('not a date', range)).toBe(false);
  });
});

describe('filterProjects and the default denominator', () => {
  it('hides finished projects and archived companies by default, and counts the same for "n of m"', () => {
    expect(filterProjects(projects, companies, filters()).map((p) => p.id)).toEqual(['p1']);
    expect(defaultVisibleCount(projects, companies, filters())).toBe(1);
  });

  it('shows finished projects on request, or when a status is chosen outright', () => {
    expect(filterProjects(projects, companies, filters({ showInactive: true })).map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(filterProjects(projects, companies, filters({ filterStatus: 'completed' })).map((p) => p.id)).toEqual(['p2']);
    expect(defaultVisibleCount(projects, companies, filters({ showInactive: true }))).toBe(3);
    expect(defaultVisibleCount(projects, companies, filters({ filterStatus: 'completed' }))).toBe(3);
  });

  it('lets a chosen company through even when archived, and searches the name case-folded', () => {
    expect(filterProjects(projects, companies, filters({ filterCompany: 'c2' })).map((p) => p.id)).toEqual(['p3']);
    expect(defaultVisibleCount(projects, companies, filters({ filterCompany: 'c2' }))).toBe(1);
    expect(filterProjects(projects, companies, filters({ searchQuery: 'الرياض' })).map((p) => p.id)).toEqual(['p1']);
    const latin = [one<Project>({ id: 'x', companyId: 'c1', name: 'Metro Line', status: 'active' })];
    expect(filterProjects(latin, companies, filters({ searchQuery: 'metro' }))).toHaveLength(1);
  });
});

describe('dashboardFigures', () => {
  const input = {
    companies, portfolios: [one<Portfolio>({ id: 'pf1', companyId: 'c1' }), one<Portfolio>({ id: 'pf2', companyId: 'c1' })], projects,
    budgetItems: [one<BudgetItem>({ id: 'b1', projectId: 'p1', plannedAmount: 80000, costType: 'fixed' }), one<BudgetItem>({ id: 'b2', projectId: 'p2', plannedAmount: 999, costType: 'fixed' })],
    expenses: [
      one<Expense>({ id: 'e1', projectId: 'p1', amount: 1000, date: '2026-09-10', approvalStatus: 'approved' }),
      one<Expense>({ id: 'e2', projectId: 'p1', amount: 2000, date: '2026-08-10', approvalStatus: 'approved' }),
      one<Expense>({ id: 'e3', projectId: 'p1', amount: 4000, date: '2026-09-11', approvalStatus: 'rejected' }),
      one<Expense>({ id: 'e4', projectId: 'p1', amount: 8000, date: '2026-09-12', approvalStatus: 'approved', isOutstandingAdvance: true }),
      one<Expense>({ id: 'e5', projectId: 'p2', amount: 16000, date: '2026-09-12', approvalStatus: 'approved' }),
    ],
    revenues: [
      one<Revenue>({ id: 'r1', projectId: 'p1', amount: 5000, date: '2026-09-05', status: 'collected' }),
      one<Revenue>({ id: 'r2', projectId: 'p1', amount: 2500, date: '2026-08-05', status: 'collected' }),
      one<Revenue>({ id: 'r3', projectId: 'p1', amount: 9000, date: '2026-09-06', status: 'invoiced' }),
    ],
    changeOrders: [one<ChangeOrder>({ id: 'co', projectId: 'p1', amountImpact: 10000, status: 'approved' }), one<ChangeOrder>({ id: 'co2', projectId: 'p1', amountImpact: 5, status: 'proposed' })],
    milestones: [],
    risks: [one<Risk>({ id: 'k1', projectId: 'p1' }), one<Risk>({ id: 'k2', projectId: 'p2' }), one<Risk>({ id: 'k3', portfolioId: 'pf1' })],
  };

  it('counts only the visible projects\' approved, settled rows inside the period, and the same rows in the company chart', () => {
    const f = dashboardFigures(input, filters({ timePeriod: 'month' }), NOW);
    expect(f.filteredProjects.map((p) => p.id)).toEqual(['p1']);
    expect(f.totalExpenses).toBe(1000); // not August, not rejected, not the open advance, not the finished project
    expect(f.companyData).toEqual([{ name: 'الأفق', value: 1000 }]);
    expect(f.collectedRevenue).toBe(5000);
    expect(f.expenseChange).toBe(-50); // 1,000 against 2,000 in August
    expect(f.revenueChange).toBe(100); // 5,000 against 2,500
    expect(f.filteredRisks.map((r) => r.id)).toEqual(['k1', 'k3']); // portfolio risks stay
    expect(f.filteredPortfolios.map((p) => p.id)).toEqual(['pf1']);
    expect(f.defaultVisibleProjectsCount).toBe(1);
  });

  it('derives the contract figures from approved orders and the plan, and reports no change without a previous period', () => {
    const f = dashboardFigures(input, filters(), NOW);
    expect(f.totalContractValue).toBe(100000);
    expect(f.approvedChangeImpact).toBe(10000);
    expect(f.effectiveTotalContract).toBe(110000);
    expect(f.plannedProfit).toBe(30000);
    expect(f.plannedProfitMargin).toBeCloseTo(27.27, 2);
    expect(f.totalExpenses).toBe(3000); // all time: September and August
    expect(f.expenseChange).toBeNull();
    expect(f.revenueChange).toBeNull();
    expect(f.statusData).toEqual([{ name: 'تشغيل', value: 1 }]);
  });

  it('answers zeros and no chart rows when nothing is visible', () => {
    const f = dashboardFigures(input, filters({ searchQuery: 'لا شيء' }), NOW);
    expect(f.filteredProjects).toEqual([]);
    expect(f).toMatchObject({ totalContractValue: 0, totalExpenses: 0, plannedProfitMargin: 0, companyData: [], statusData: [] });
    expect(f.filteredRisks.map((r) => r.id)).toEqual(['k3']);
  });
});
