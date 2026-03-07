import { BudgetItem, Expense, Revenue, ProjectSummary, Project, BaselineItem, EVMMetrics } from '@/types/project';

export function formatCurrency(amount: number, currency = 'ر.س'): string {
  return `${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })} ${currency}`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

export function getProjectSummary(
  project: Project,
  budgetItems: BudgetItem[],
  expenses: Expense[],
  revenues: Revenue[]
): ProjectSummary {
  const totalPlanned = budgetItems.reduce((sum, b) => sum + b.plannedAmount, 0);
  const totalActual = expenses.reduce((sum, e) => sum + e.amount, 0);
  const totalRevenue = revenues.reduce((sum, r) => sum + r.amount, 0);
  
  // المتبقي = قيمة العقد - المصروفات الفعلية
  const remaining = project.contractValue - totalActual;
  
  // صافي الربح = الإيرادات الفعلية - المصروفات الفعلية
  // إذا لم يكن هناك إيرادات مسجلة، الربح = سالب المصروفات
  const netProfit = totalRevenue - totalActual;
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  return {
    totalBudget: project.contractValue,
    totalPlanned,
    totalActual,
    totalRevenue,
    netProfit,
    profitMargin,
    remaining,
  };
}

export function getExpensesByCategory(expenses: Expense[]) {
  const map: Record<string, number> = {};
  expenses.forEach((e) => {
    map[e.category] = (map[e.category] || 0) + e.amount;
  });
  return map;
}

export function getMonthlyBreakdown(expenses: Expense[], months: number) {
  const result: number[] = Array(months).fill(0);
  expenses.forEach((e) => {
    if (e.month >= 1 && e.month <= months) {
      result[e.month - 1] += e.amount;
    }
  });
  return result;
}

/**
 * Get monthly planned values from baseline items (time-phased budget)
 */
export function getBaselineMonthlyPV(items: BaselineItem[], months: number): number[] {
  const result: number[] = Array(months).fill(0);
  const itemsWithMonth = items.filter(i => i.month && i.month >= 1 && i.month <= months);
  const itemsWithoutMonth = items.filter(i => !i.month);

  // Items with assigned months
  itemsWithMonth.forEach(i => {
    result[i.month! - 1] += i.plannedAmount;
  });

  // Items without month: distribute evenly across all months
  const totalUnassigned = itemsWithoutMonth.reduce((s, i) => s + i.plannedAmount, 0);
  if (totalUnassigned > 0 && months > 0) {
    const perMonth = totalUnassigned / months;
    for (let m = 0; m < months; m++) {
      result[m] += perMonth;
    }
  }

  return result;
}

/**
 * Calculate EVM metrics given baseline, expenses, and current month
 */
export function calculateEVM(
  baselineItems: BaselineItem[],
  expenses: Expense[],
  durationMonths: number,
  currentMonth: number
): EVMMetrics {
  const monthlyPV = getBaselineMonthlyPV(baselineItems, durationMonths);
  const monthlyAC = getMonthlyBreakdown(expenses, durationMonths);

  const bac = monthlyPV.reduce((s, v) => s + v, 0);

  // PV = cumulative planned value up to current month
  const pv = monthlyPV.slice(0, currentMonth).reduce((s, v) => s + v, 0);

  // AC = cumulative actual cost up to current month
  const ac = monthlyAC.slice(0, currentMonth).reduce((s, v) => s + v, 0);

  // EV = % of work completed × BAC
  // We estimate % complete by comparing cumulative actual spend ratio to planned
  // A better approach: EV = sum of baseline planned for completed work
  // For simplicity: EV = min(pv, bac) adjusted by completion
  const totalActual = expenses.reduce((s, e) => s + e.amount, 0);
  const totalPlanned = bac;
  const percentComplete = totalPlanned > 0 ? Math.min(totalActual / totalPlanned, 1) : 0;
  const ev = percentComplete * bac;

  const cv = ev - ac;
  const sv = ev - pv;
  const cpi = ac > 0 ? ev / ac : 0;
  const spi = pv > 0 ? ev / pv : 0;
  const eac = cpi > 0 ? bac / cpi : bac;
  const etc = eac - ac;
  const vac = bac - eac;

  return { pv, ev, ac, bac, cv, sv, cpi, spi, eac, etc, vac };
}
