/**
 * The milestone maths, kept pure so the header, the project row and the
 * status transitions cannot disagree.
 */
import type { Milestone, MilestoneStatus } from '@/types/project';

/** The project's percent complete: each milestone's percent weighted by its weight, rounded. */
export function weightedPercent(milestones: Milestone[]): number {
  const totalWeight = milestones.reduce((s, m) => s + m.weight, 0);
  if (totalWeight === 0) return 0;
  const weighted = milestones.reduce((s, m) => s + (m.weight * m.percentComplete), 0);
  return Math.round(weighted / totalWeight);
}

/** By planned start, then planned end; undated milestones last, in their sort order. */
export function sortMilestones(milestones: Milestone[]): Milestone[] {
  return [...milestones].sort((a, b) => {
    const dateA = a.plannedStart || a.plannedEnd || '';
    const dateB = b.plannedStart || b.plannedEnd || '';
    if (dateA && dateB) return dateA.localeCompare(dateB);
    if (dateA) return -1;
    if (dateB) return 1;
    return a.sortOrder - b.sortOrder;
  });
}

/**
 * The status a percent implies, when it changes one. 100 wins: a planned
 * milestone typed straight to 100 is completed, not "in progress". A
 * milestone that leaves 100, or a planned one that starts, is in progress.
 */
export function statusForPercent(status: MilestoneStatus, pct: number): MilestoneStatus | undefined {
  if (pct === 100) return status === 'completed' ? undefined : 'completed';
  if (pct > 0 && (status === 'completed' || status === 'planned')) return 'in_progress';
  return undefined;
}
