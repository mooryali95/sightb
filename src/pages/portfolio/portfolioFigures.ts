/**
 * The per-project figures the portfolio page shows three ways (table, charts,
 * export), computed once from the same summary library the stat cards use.
 */
import { getProjectSummary, getCashFlowForecast } from '@/lib/finance';
import type { BudgetItem, ChangeOrder, Expense, HealthStatus, Project, ProjectSummary, Revenue } from '@/types/project';

export interface RankedProject {
  project: Project;
  summary: ProjectSummary;
  health: HealthStatus;
}

export interface CashFlowPoint { month: number; مخطط: number; فعلي: number }

const HEALTH_ORDER: Record<HealthStatus, number> = { critical: 0, warning: 1, healthy: 2 };

/**
 * One summary per project, worst health first. A project is critical when
 * it is on hold or cancelled or has spent past its plan, the same rule the
 * portfolio summary uses to count projects at risk.
 */
export function rankProjects(
  projects: Project[], budgetItems: BudgetItem[], expenses: Expense[], revenues: Revenue[], changeOrders: ChangeOrder[],
): RankedProject[] {
  return projects.map(project => {
    const pBudget = budgetItems.filter(b => b.projectId === project.id);
    const pExpenses = expenses.filter(e => e.projectId === project.id);
    const pRevenues = revenues.filter(r => r.projectId === project.id);
    const pCO = changeOrders.filter(co => co.projectId === project.id);
    const s = getProjectSummary(project, pBudget, pExpenses, pRevenues, pCO);
    const health: HealthStatus = s.spendRate > 100 || project.status === 'on-hold' || project.status === 'cancelled' ? 'critical' : s.spendRate > 90 ? 'warning' : 'healthy';
    return { project, summary: s, health };
  }).sort((a, b) => HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health]);
}

/**
 * Cumulative planned and actual cash flow, summed across the projects month
 * by month. A project that has ended keeps its final cumulative position in
 * every later month: its money does not vanish from the portfolio when its
 * last month passes.
 */
export function aggregateCashFlow(
  projects: Project[], budgetItems: BudgetItem[], expenses: Expense[], revenues: Revenue[],
): CashFlowPoint[] {
  if (projects.length === 0) return [];
  const maxMonths = Math.max(...projects.map(p => p.durationMonths), 1);
  const forecasts = projects.map(project => getCashFlowForecast(
    budgetItems.filter(b => b.projectId === project.id),
    expenses.filter(e => e.projectId === project.id),
    revenues.filter(r => r.projectId === project.id),
    project.durationMonths,
  ));
  const aggregated: CashFlowPoint[] = [];
  for (let m = 1; m <= maxMonths; m++) {
    let planned = 0, actual = 0;
    for (const cf of forecasts) {
      const entry = cf.find(c => c.month === m) ?? (cf.length > 0 && m > cf[cf.length - 1].month ? cf[cf.length - 1] : undefined);
      if (entry) { planned += entry.cumulativePlanned; actual += entry.cumulativeActual; }
    }
    aggregated.push({ month: m, مخطط: planned, فعلي: actual });
  }
  return aggregated;
}
