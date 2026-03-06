import { BudgetItem, Expense, Revenue, ProjectSummary, Project } from '@/types/project';

export function formatCurrency(amount: number, currency = 'ر.س'): string {
  return `${amount.toLocaleString('ar-SA', { maximumFractionDigits: 0 })} ${currency}`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
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
  const effectiveRevenue = totalRevenue || project.contractValue;
  const netProfit = effectiveRevenue - totalActual;
  const profitMargin = effectiveRevenue > 0 ? (netProfit / effectiveRevenue) * 100 : 0;
  const remaining = totalPlanned - totalActual;

  return {
    totalBudget: project.contractValue,
    totalPlanned,
    totalActual,
    totalRevenue: effectiveRevenue,
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
