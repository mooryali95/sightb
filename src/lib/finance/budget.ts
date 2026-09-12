import { BudgetItem, Expense, BaselineItem, CostType } from '@/types/project';

/**
 * Calculate the TRUE total planned value for budget items,
 * accounting for recurring items that repeat monthly.
 * - fixed: plannedAmount is the total (distributed evenly over months)
 * - one_time: plannedAmount is the total (all in one month)
 * - recurring: plannedAmount is the MONTHLY amount (multiply by number of months)
 */
export function getTotalPlanned(
  budgetItems: { plannedAmount: number; costType?: string; startMonth?: number | null; endMonth?: number | null }[],
): number {
  return budgetItems.reduce((sum, b) => {
    if (b.costType === 'recurring') {
      const start = b.startMonth || 1;
      const end = b.endMonth || b.startMonth || 1;
      const months = Math.max(1, end - start + 1);
      return sum + (b.plannedAmount * months);
    }
    return sum + b.plannedAmount;
  }, 0);
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
    // The same rows getProjectSummary leaves out of totalActual: a rejected
    // expense is not spend, and an advance still outstanding is a receivable.
    if (e.approvalStatus === 'rejected' || e.isOutstandingAdvance) return;
    if (e.month >= 1 && e.month <= months) {
      result[e.month - 1] += e.amount;
    }
  });
  return result;
}

/**
 * Distribute a single item across monthly buckets based on costType + start/end range.
 * Shared by both getBaselineMonthlyPV and getPlannedMonthlyCashFlow.
 */
function distributeItem(
  result: number[],
  plannedAmount: number,
  costType: CostType | undefined,
  startMonth: number | undefined,
  endMonth: number | undefined,
  month: number | undefined,
  totalMonths: number,
) {
  const hasRange = startMonth || endMonth;
  const hasMonth = month;

  if (!hasRange && !hasMonth) {
    const perMonth = plannedAmount / totalMonths;
    for (let m = 0; m < totalMonths; m++) {
      result[m] += perMonth;
    }
    return;
  }

  const s = Math.max(1, startMonth || month || 1);
  const e = Math.min(totalMonths, endMonth || startMonth || month || totalMonths);

  const type = costType || 'fixed';

  switch (type) {
    case 'one_time':
      if (s >= 1 && s <= totalMonths) {
        result[s - 1] += plannedAmount;
      }
      break;
    case 'recurring':
      for (let m = s; m <= e; m++) {
        result[m - 1] += plannedAmount;
      }
      break;
    case 'fixed':
    default: {
      const span = e - s + 1;
      const perMonth = span > 0 ? plannedAmount / span : plannedAmount;
      for (let m = s; m <= e; m++) {
        result[m - 1] += perMonth;
      }
      break;
    }
  }
}

/**
 * Get monthly planned values from baseline items (time-phased budget)
 * Supports startMonth/endMonth + costType with fallback for legacy data
 */
export function getBaselineMonthlyPV(items: BaselineItem[], months: number): number[] {
  const result: number[] = Array(months).fill(0);
  items.forEach(item => {
    distributeItem(result, item.plannedAmount, item.costType, item.startMonth, item.endMonth, item.month, months);
  });
  return result;
}

/**
 * Get monthly planned cash flow from budget items using startMonth/endMonth + costType
 */
export function getPlannedMonthlyCashFlow(budgetItems: BudgetItem[], durationMonths: number): number[] {
  const result: number[] = Array(durationMonths).fill(0);
  budgetItems.forEach(item => {
    distributeItem(result, item.plannedAmount, item.costType, item.startMonth, item.endMonth, item.month, durationMonths);
  });
  return result;
}
