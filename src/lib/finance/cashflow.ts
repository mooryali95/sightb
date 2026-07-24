import { BudgetItem, Expense, Revenue, MonthlyCashFlow } from '@/types/project';
import { getMonthlyBreakdown, getPlannedMonthlyCashFlow } from './budget';

/**
 * Get cash flow forecast combining budget, expenses, and revenues
 */
export function getCashFlowForecast(
  budgetItems: BudgetItem[],
  expenses: Expense[],
  revenues: Revenue[],
  durationMonths: number,
): MonthlyCashFlow[] {
  const plannedExp = getPlannedMonthlyCashFlow(budgetItems, durationMonths);
  const actualExp = getMonthlyBreakdown(expenses, durationMonths);

  const plannedRev: number[] = Array(durationMonths).fill(0);
  const actualRev: number[] = Array(durationMonths).fill(0);

  revenues.forEach(r => {
    if (r.month >= 1 && r.month <= durationMonths) {
      plannedRev[r.month - 1] += r.amount;
      if (r.status === 'collected') {
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
