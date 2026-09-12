import { BudgetItem, Expense, Revenue, CostType, ExpenseCategory } from '@/types/project';
import { getCurrentMonth } from './contract';

export interface MonthlyBudgetItemDetail {
  budgetItemId: string;
  category: ExpenseCategory | string;
  description: string;
  amount: number;
  costType: CostType | string;
}

export type MonthStatus = 'future' | 'on_track' | 'near_limit' | 'over' | 'inactive';

export interface MonthlyBudgetPlanRow {
  month: number;
  planned: number;
  actual: number;
  variance: number;
  utilizationPct: number;
  plannedRevenue: number;
  actualRevenue: number;
  netCashFlow: number;
  cumulativePlanned: number;
  cumulativeActual: number;
  status: MonthStatus;
  isCurrent: boolean;
  isPast: boolean;
  items: MonthlyBudgetItemDetail[];
}

/**
 * Build a precise monthly distribution of budget items, expenses, and revenues.
 */
export function getMonthlyBudgetPlan(
  budgetItems: BudgetItem[],
  expenses: Expense[],
  revenues: Revenue[],
  durationMonths: number,
  startDate?: string,
): MonthlyBudgetPlanRow[] {
  const months = Math.max(1, durationMonths);
  const plannedPerMonth: number[] = Array(months).fill(0);
  const itemsPerMonth: MonthlyBudgetItemDetail[][] = Array.from({ length: months }, () => []);

  budgetItems.forEach((item) => {
    const costType = (item.costType || 'fixed') as CostType;
    const startMonth = item.startMonth || item.month;
    const endMonth = item.endMonth || item.startMonth || item.month;

    const pushDetail = (monthIdx: number, amount: number) => {
      if (amount <= 0) return;
      if (monthIdx < 0 || monthIdx >= months) return;
      plannedPerMonth[monthIdx] += amount;
      itemsPerMonth[monthIdx].push({
        budgetItemId: item.id,
        category: item.category,
        description: item.description,
        amount,
        costType,
      });
    };

    if (!startMonth && !endMonth) {
      const perMonth = item.plannedAmount / months;
      for (let m = 0; m < months; m++) pushDetail(m, perMonth);
      return;
    }

    const s = Math.max(1, startMonth || 1);
    const e = Math.min(months, endMonth || s);

    switch (costType) {
      case 'one_time':
        pushDetail(s - 1, item.plannedAmount);
        break;
      case 'recurring':
        for (let m = s; m <= e; m++) pushDetail(m - 1, item.plannedAmount);
        break;
      case 'fixed':
      default: {
        const span = Math.max(1, e - s + 1);
        const perMonth = item.plannedAmount / span;
        for (let m = s; m <= e; m++) pushDetail(m - 1, perMonth);
      }
    }
  });

  const actualPerMonth: number[] = Array(months).fill(0);
  expenses.forEach((exp) => {
    if (exp.approvalStatus === 'rejected') return;
    if (exp.isOutstandingAdvance) return;
    if (exp.month >= 1 && exp.month <= months) {
      actualPerMonth[exp.month - 1] += exp.amount;
    }
  });

  const plannedRevPerMonth: number[] = Array(months).fill(0);
  const actualRevPerMonth: number[] = Array(months).fill(0);
  revenues.forEach((r) => {
    if (r.month >= 1 && r.month <= months) {
      plannedRevPerMonth[r.month - 1] += r.amount;
      if (r.status === 'collected') actualRevPerMonth[r.month - 1] += r.amount;
    }
  });

  const currentMonth = startDate ? getCurrentMonth(startDate, months) : Math.ceil(months / 2);

  let cumulativePlanned = 0;
  let cumulativeActual = 0;

  return Array.from({ length: months }, (_, i) => {
    const month = i + 1;
    const planned = plannedPerMonth[i];
    const actual = actualPerMonth[i];
    const variance = planned - actual;
    const utilizationPct = planned > 0 ? (actual / planned) * 100 : (actual > 0 ? 999 : 0);
    cumulativePlanned += planned;
    cumulativeActual += actual;
    const isCurrent = month === currentMonth;
    const isPast = month < currentMonth;

    let status: MonthStatus;
    if (planned === 0 && actual === 0) {
      status = 'inactive';
    } else if (month > currentMonth) {
      status = 'future';
    } else if (utilizationPct > 100) {
      status = 'over';
    } else if (utilizationPct >= 85) {
      status = 'near_limit';
    } else {
      status = 'on_track';
    }

    return {
      month,
      planned,
      actual,
      variance,
      utilizationPct,
      plannedRevenue: plannedRevPerMonth[i],
      actualRevenue: actualRevPerMonth[i],
      netCashFlow: actualRevPerMonth[i] - actual,
      cumulativePlanned,
      cumulativeActual,
      status,
      isCurrent,
      isPast,
      items: itemsPerMonth[i],
    };
  });
}
