/**
 * The figures shown for one resource, computed once for the table row and
 * once for the inspector so the two cannot drift apart.
 */
import { getTotalPlanned } from '@/lib/finance';
import type { BudgetItem, Expense, Resource } from '@/types/project';

export interface ResourceFigures {
  /** The linked budget items' plan, or monthly cost × duration when there is none. */
  plannedForResource: number;
  /** True when the plan is the estimate, not a budget item. */
  isEstimated: boolean;
  totalSpent: number;
  variance: number;
  spentPct: number;
  linkedBudget: BudgetItem[];
}

/**
 * `countedExpenses` must already exclude what no summary counts as spend
 * (rejected expenses, outstanding advances); the caller filters once.
 */
export function resourceFigures(
  r: Resource, budgetItems: BudgetItem[], countedExpenses: Expense[], durationMonths: number,
): ResourceFigures {
  const totalSpent = countedExpenses.filter(e => e.resourceId === r.id).reduce((s, e) => s + e.amount, 0);
  const linkedBudget = budgetItems.filter(b => b.resourceId === r.id);
  const plannedForResource = linkedBudget.length > 0
    ? getTotalPlanned(linkedBudget)
    : r.monthlyCost * (durationMonths || 1);
  const isEstimated = linkedBudget.length === 0 && r.monthlyCost > 0;
  const variance = plannedForResource - totalSpent;
  const spentPct = plannedForResource > 0 ? (totalSpent / plannedForResource) * 100 : 0;
  return { plannedForResource, isEstimated, totalSpent, variance, spentPct, linkedBudget };
}
