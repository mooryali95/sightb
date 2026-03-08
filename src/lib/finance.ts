import {
  BudgetItem, Expense, Revenue, ProjectSummary, Project,
  BaselineItem, EVMMetrics, ChangeOrder, MonthlyCashFlow,
} from '@/types/project';

export function formatCurrency(amount: number, currency = 'ر.س'): string {
  return `${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })} ${currency}`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

/**
 * Calculate the effective contract value after approved change orders
 */
export function getEffectiveContractValue(contractValue: number, changeOrders: ChangeOrder[]): number {
  const approvedImpact = changeOrders
    .filter(co => co.status === 'approved')
    .reduce((sum, co) => sum + co.amountImpact, 0);
  return contractValue + approvedImpact;
}

/**
 * Get the current month of the project based on startDate
 */
export function getCurrentMonth(startDate: string, durationMonths: number): number {
  if (!startDate) return Math.ceil(durationMonths / 2);
  const start = new Date(startDate);
  const now = new Date();
  const diff = (now.getFullYear() - start.getFullYear()) * 12
    + (now.getMonth() - start.getMonth()) + 1;
  return Math.max(1, Math.min(diff, durationMonths));
}

export function getProjectSummary(
  project: Project,
  budgetItems: BudgetItem[],
  expenses: Expense[],
  revenues: Revenue[],
  changeOrders: ChangeOrder[] = []
): ProjectSummary {
  const totalPlanned = budgetItems.reduce((sum, b) => sum + b.plannedAmount, 0);
  const totalActual = expenses.reduce((sum, e) => sum + e.amount, 0);

  const effectiveContractValue = getEffectiveContractValue(project.contractValue, changeOrders);
  const contractRemaining = effectiveContractValue - totalActual;
  const budgetRemaining = totalPlanned - totalActual;
  const budgetVariance = totalPlanned - totalActual;

  const plannedProfit = effectiveContractValue - totalPlanned;
  const plannedProfitMargin = effectiveContractValue > 0 ? (plannedProfit / effectiveContractValue) * 100 : 0;

  const collectedRevenue = revenues.filter(r => r.status === 'collected').reduce((sum, r) => sum + r.amount, 0);
  const invoicedRevenue = revenues.filter(r => r.status === 'invoiced').reduce((sum, r) => sum + r.amount, 0);
  const totalPlannedRevenue = revenues.filter(r => r.status === 'planned').reduce((sum, r) => sum + r.amount, 0);
  const realizedProfit = collectedRevenue - totalActual;
  const realizedProfitMargin = collectedRevenue > 0 ? (realizedProfit / collectedRevenue) * 100 : 0;
  const accountsReceivable = invoicedRevenue; // invoiced but not yet collected

  const spendRate = totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0;
  const contractSpendRate = effectiveContractValue > 0 ? (totalActual / effectiveContractValue) * 100 : 0;

  // Burn rate = average monthly actual spend
  const currentMonth = getCurrentMonth(project.startDate, project.durationMonths);
  const burnRate = currentMonth > 0 ? totalActual / currentMonth : 0;

  return {
    contractValue: project.contractValue,
    effectiveContractValue,
    contractRemaining,
    totalPlanned,
    totalActual,
    budgetRemaining,
    budgetVariance,
    plannedProfit,
    plannedProfitMargin,
    collectedRevenue,
    invoicedRevenue,
    totalPlannedRevenue,
    realizedProfit,
    realizedProfitMargin,
    accountsReceivable,
    spendRate,
    contractSpendRate,
    burnRate,
    percentComplete: project.percentComplete,
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
 * Supports startMonth/endMonth + costType
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
 * Get monthly planned cash flow from budget items using startMonth/endMonth + costType
 */
export function getPlannedMonthlyCashFlow(budgetItems: BudgetItem[], durationMonths: number): number[] {
  const result: number[] = Array(durationMonths).fill(0);

  budgetItems.forEach(item => {
    const start = item.startMonth;
    const end = item.endMonth;

    if (!start && !end) {
      // No month specified — distribute evenly
      const perMonth = item.plannedAmount / durationMonths;
      for (let m = 0; m < durationMonths; m++) {
        result[m] += perMonth;
      }
      return;
    }

    const s = Math.max(1, start || 1);
    const e = Math.min(durationMonths, end || start || durationMonths);

    switch (item.costType) {
      case 'one_time':
        // All amount in start month
        if (s >= 1 && s <= durationMonths) {
          result[s - 1] += item.plannedAmount;
        }
        break;
      case 'recurring':
        // Full amount each month from start to end
        for (let m = s; m <= e; m++) {
          result[m - 1] += item.plannedAmount;
        }
        break;
      case 'fixed':
      default:
        // Distribute evenly from start to end
        const span = e - s + 1;
        const perMonth = span > 0 ? item.plannedAmount / span : item.plannedAmount;
        for (let m = s; m <= e; m++) {
          result[m - 1] += perMonth;
        }
        break;
    }
  });

  return result;
}

/**
 * Get cash flow forecast combining budget, expenses, and revenues
 */
export function getCashFlowForecast(
  budgetItems: BudgetItem[],
  expenses: Expense[],
  revenues: Revenue[],
  durationMonths: number
): MonthlyCashFlow[] {
  const plannedExp = getPlannedMonthlyCashFlow(budgetItems, durationMonths);
  const actualExp = getMonthlyBreakdown(expenses, durationMonths);

  const plannedRev: number[] = Array(durationMonths).fill(0);
  const actualRev: number[] = Array(durationMonths).fill(0);

  revenues.forEach(r => {
    if (r.month >= 1 && r.month <= durationMonths) {
      if (r.status === 'planned') {
        plannedRev[r.month - 1] += r.amount;
      } else if (r.status === 'collected') {
        actualRev[r.month - 1] += r.amount;
      }
    }
  });

  let cumPlanned = 0;
  let cumActual = 0;

  return Array.from({ length: durationMonths }, (_, i) => {
    const netPlanned = plannedRev[i] - plannedExp[i];
    const netActual = actualRev[i] - actualExp[i];
    cumPlanned += netPlanned;
    cumActual += netActual;

    return {
      month: i + 1,
      plannedExpenses: plannedExp[i],
      actualExpenses: actualExp[i],
      plannedRevenue: plannedRev[i],
      actualRevenue: actualRev[i],
      netPlanned,
      netActual,
      cumulativePlanned: cumPlanned,
      cumulativeActual: cumActual,
    };
  });
}

/**
 * Calculate EVM metrics given baseline, expenses, and current month
 * Uses independent percentComplete (from milestones) instead of AC/BAC ratio
 */
export function calculateEVM(
  baselineItems: BaselineItem[],
  expenses: Expense[],
  durationMonths: number,
  currentMonth: number,
  percentComplete: number = 0
): EVMMetrics {
  const monthlyPV = getBaselineMonthlyPV(baselineItems, durationMonths);
  const monthlyAC = getMonthlyBreakdown(expenses, durationMonths);

  const bac = monthlyPV.reduce((s, v) => s + v, 0);

  // PV = cumulative planned value up to current month
  const pv = monthlyPV.slice(0, currentMonth).reduce((s, v) => s + v, 0);

  // AC = cumulative actual cost up to current month
  const ac = monthlyAC.slice(0, currentMonth).reduce((s, v) => s + v, 0);

  // EV = % of work completed × BAC (independent from spending)
  const ev = (percentComplete / 100) * bac;

  const cv = ev - ac;
  const sv = ev - pv;
  const cpi = ac > 0 ? ev / ac : 0;
  const spi = pv > 0 ? ev / pv : 0;
  const eac = cpi > 0 ? bac / cpi : bac;
  const etc = eac - ac;
  const vac = bac - eac;

  return { pv, ev, ac, bac, cv, sv, cpi, spi, eac, etc, vac };
}
