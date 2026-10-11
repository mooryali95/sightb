/**
 * Everything the dashboard derives from the store under its filters, kept
 * pure: which projects are visible, the rows each card and chart counts,
 * and the headline figures. One derivation, so the total expenses card and
 * the expenses-by-company chart cannot disagree on the same screen.
 */
import {
  startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear,
  subMonths, subQuarters, subYears, isWithinInterval, parseISO,
} from 'date-fns';
import { getCountedExpenses, getTotalPlanned } from '@/lib/finance';
import {
  PROJECT_STATUS_LABELS,
  type BudgetItem, type ChangeOrder, type Company, type Expense, type Milestone, type Portfolio, type Project,
  type ProjectStatus, type Revenue, type Risk,
} from '@/types/project';

/**
 * Project states hidden from the default view. Module scope, not component
 * scope: a literal declared inside the body is a fresh array every render, so
 * every `useMemo` closing over it silently lost its memoization.
 */
export const INACTIVE_STATUSES: ProjectStatus[] = ['completed', 'archived', 'cancelled'];

export interface DashboardFilters {
  filterCompany: string;
  filterStatus: string;
  searchQuery: string;
  timePeriod: string;
  showInactive: boolean;
}

export interface DashboardInput {
  companies: Company[];
  portfolios: Portfolio[];
  projects: Project[];
  budgetItems: BudgetItem[];
  expenses: Expense[];
  revenues: Revenue[];
  changeOrders: ChangeOrder[];
  milestones: Milestone[];
  risks: Risk[];
}

export interface DateRange { start: Date; end: Date }

/** The selected period and the one before it; null for "all time". */
export function periodRanges(timePeriod: string, now = new Date()): { currentRange: DateRange | null; previousRange: DateRange | null } {
  switch (timePeriod) {
    case 'month':
      return {
        currentRange: { start: startOfMonth(now), end: endOfMonth(now) },
        previousRange: { start: startOfMonth(subMonths(now, 1)), end: endOfMonth(subMonths(now, 1)) },
      };
    case 'quarter':
      return {
        currentRange: { start: startOfQuarter(now), end: endOfQuarter(now) },
        previousRange: { start: startOfQuarter(subQuarters(now, 1)), end: endOfQuarter(subQuarters(now, 1)) },
      };
    case 'year':
      return {
        currentRange: { start: startOfYear(now), end: endOfYear(now) },
        previousRange: { start: startOfYear(subYears(now, 1)), end: endOfYear(subYears(now, 1)) },
      };
    default:
      return { currentRange: null, previousRange: null };
  }
}

export function isInRange(dateStr: string, range: DateRange | null): boolean {
  if (!range) return true;
  try {
    return isWithinInterval(parseISO(dateStr), range);
  } catch { return true; }
}

/** The projects the filters leave visible. */
export function filterProjects(projects: Project[], companies: Company[], f: DashboardFilters): Project[] {
  return projects.filter((p) => {
    if (f.filterCompany === 'all') {
      const comp = companies.find(c => c.id === p.companyId);
      if (comp?.status === 'archived') return false;
    }
    if (f.filterCompany !== 'all' && p.companyId !== f.filterCompany) return false;
    if (f.filterStatus !== 'all' && p.status !== f.filterStatus) return false;
    if (f.filterStatus === 'all' && !f.showInactive && INACTIVE_STATUSES.includes(p.status)) return false;
    if (f.searchQuery && !p.name.toLowerCase().includes(f.searchQuery.toLowerCase())) return false;
    return true;
  });
}

/** How many projects the default view would show: the denominator of "n of m". */
export function defaultVisibleCount(projects: Project[], companies: Company[], f: DashboardFilters): number {
  if (f.filterStatus !== 'all' || f.showInactive) return projects.length;
  return projects.filter((project) => {
    if (f.filterCompany === 'all') {
      const company = companies.find((c) => c.id === project.companyId);
      if (company?.status === 'archived') return false;
    }
    if (f.filterCompany !== 'all' && project.companyId !== f.filterCompany) return false;
    return !INACTIVE_STATUSES.includes(project.status);
  }).length;
}

export function dashboardFigures(input: DashboardInput, f: DashboardFilters, now = new Date()) {
  const { companies, portfolios, projects, budgetItems, expenses, revenues, changeOrders, milestones, risks } = input;
  const { currentRange, previousRange } = periodRanges(f.timePeriod, now);

  const filteredProjects = filterProjects(projects, companies, f);
  const visibleProjectIds = new Set(filteredProjects.map((project) => project.id));

  const filteredBudgetItems = budgetItems.filter((b) => visibleProjectIds.has(b.projectId));
  const filteredAllExpenses = getCountedExpenses(expenses).filter((e) => visibleProjectIds.has(e.projectId));
  const filteredExpenses = filteredAllExpenses.filter((e) => isInRange(e.date, currentRange));
  const filteredAllRevenues = revenues.filter((r) => visibleProjectIds.has(r.projectId));
  const filteredRevenues = filteredAllRevenues.filter((r) => isInRange(r.date, currentRange));
  const filteredChangeOrders = changeOrders.filter((co) => visibleProjectIds.has(co.projectId));
  const filteredMilestones = milestones.filter((m) => visibleProjectIds.has(m.projectId));
  const filteredRisks = risks.filter((r) => !r.projectId || visibleProjectIds.has(r.projectId));
  const filteredPortfolios = portfolios.filter((portfolio) => filteredProjects.some((project) => project.portfolioId === portfolio.id));

  // Stats
  const totalContractValue = filteredProjects.reduce((s, p) => s + p.contractValue, 0);
  const totalExpenses = filteredExpenses.reduce((s, e) => s + e.amount, 0);
  const totalPlanned = getTotalPlanned(filteredBudgetItems);
  const approvedChangeImpact = filteredChangeOrders.filter(co => co.status === 'approved').reduce((s, co) => s + co.amountImpact, 0);
  const effectiveTotalContract = totalContractValue + approvedChangeImpact;
  const plannedProfit = effectiveTotalContract - totalPlanned;
  const plannedProfitMargin = effectiveTotalContract > 0 ? (plannedProfit / effectiveTotalContract) * 100 : 0;
  const collectedRevenue = filteredRevenues.filter(r => r.status === 'collected').reduce((s, r) => s + r.amount, 0);
  const prevExpenses = previousRange ? filteredAllExpenses.filter((e) => isInRange(e.date, previousRange)).reduce((s, e) => s + e.amount, 0) : 0;
  const prevRevenue = previousRange ? filteredAllRevenues.filter((r) => r.status === 'collected' && isInRange(r.date, previousRange)).reduce((s, r) => s + r.amount, 0) : 0;
  const expenseChange = prevExpenses > 0 ? ((totalExpenses - prevExpenses) / prevExpenses) * 100 : null;
  const revenueChange = prevRevenue > 0 ? ((collectedRevenue - prevRevenue) / prevRevenue) * 100 : null;
  const attentionProjectsCount = filteredProjects.filter((project) => {
    const spend = filteredAllExpenses.filter((expense) => expense.projectId === project.id).reduce((sum, expense) => sum + expense.amount, 0);
    const plan = getTotalPlanned(filteredBudgetItems.filter((item) => item.projectId === project.id));
    return (plan > 0 && spend / plan > 0.9) || project.status === 'on-hold' || project.status === 'cancelled';
  }).length;

  // The same rows as the total expenses card: visible projects, counted, in the period.
  const companyData = companies.map((c) => {
    const compProjects = filteredProjects.filter((p) => p.companyId === c.id);
    const total = filteredExpenses.filter((e) => compProjects.some((p) => p.id === e.projectId)).reduce((s, e) => s + e.amount, 0);
    return { name: c.name, value: total };
  }).filter((d) => d.value > 0);

  const statusData = Object.entries(PROJECT_STATUS_LABELS).map(([key, label]) => ({
    name: label, value: filteredProjects.filter((p) => p.status === key).length,
  })).filter((d) => d.value > 0);

  return {
    filteredProjects, filteredBudgetItems, filteredAllExpenses, filteredExpenses, filteredAllRevenues, filteredRevenues,
    filteredChangeOrders, filteredMilestones, filteredRisks, filteredPortfolios,
    defaultVisibleProjectsCount: defaultVisibleCount(projects, companies, f),
    totalContractValue, totalExpenses, approvedChangeImpact, effectiveTotalContract, plannedProfit, plannedProfitMargin,
    collectedRevenue, expenseChange, revenueChange, attentionProjectsCount, companyData, statusData,
  };
}

export type DashboardFigures = ReturnType<typeof dashboardFigures>;
