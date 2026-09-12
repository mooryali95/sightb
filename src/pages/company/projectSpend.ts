/**
 * What a project has spent, from the expenses the summary library counts,
 * and how much of its contract that is. Both project lists on the company
 * page draw their bar from this so they cannot drift apart.
 */
import type { Expense, Project } from '@/types/project';

export interface ProjectSpend {
  totalSpent: number;
  /** Capped at 100 so the bar never overflows. */
  spentPercent: number;
}

export function projectSpend(project: Project, countedExpenses: Expense[]): ProjectSpend {
  const totalSpent = countedExpenses.filter(e => e.projectId === project.id).reduce((s, e) => s + e.amount, 0);
  const spentPercent = project.contractValue > 0 ? Math.min((totalSpent / project.contractValue) * 100, 100) : 0;
  return { totalSpent, spentPercent };
}

/** The bar colour for a spend ratio: red past 90%, amber past 70%. */
export function spendBarClass(spentPercent: number): string {
  return spentPercent > 90 ? 'bg-destructive' : spentPercent > 70 ? 'bg-warning' : 'bg-primary';
}
