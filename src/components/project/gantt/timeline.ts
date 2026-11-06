import type { Milestone } from '@/types/project';

export type ViewMode = 'months' | 'weeks';

export interface TimelineColumn {
  label: string;
  days: number;
}

/** A milestone that has at least one planned date, with its dates parsed. */
export type DatedMilestone = Milestone & {
  startDate: Date;
  endDate: Date;
  actualStartDate?: Date;
  actualEndDate?: Date;
};

export interface Timeline {
  start: Date;
  end: Date;
  totalDays: number;
  columns: TimelineColumn[];
  milestones: DatedMilestone[];
}

export interface BarPosition {
  /** Offset from the timeline's origin (rendered on the right in RTL). */
  left: string;
  width: string;
}

export const STATUS_BAR_COLORS: Record<string, string> = {
  planned: 'bg-slate-400 dark:bg-slate-500',
  in_progress: 'bg-info',
  completed: 'bg-success',
  delayed: 'bg-destructive',
  cancelled: 'bg-gray-300 dark:bg-gray-600',
};

export const ACTUAL_BAR_COLORS: Record<string, string> = {
  planned: 'bg-slate-300/50 dark:bg-slate-600/50',
  in_progress: 'bg-info/20',
  completed: 'bg-success/20',
  delayed: 'bg-destructive/20',
  cancelled: 'bg-gray-200/50 dark:bg-gray-700/50',
};

const MONTH_NAMES = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

const PAD_BEFORE_DAYS = 7;
const PAD_AFTER_DAYS = 14;

export function parseDate(d?: string | null): Date | null {
  if (!d) return null;
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export function formatShortDate(d: Date): string {
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export function diffDays(a: Date, b: Date): number {
  return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

/** Keeps the milestones that carry a planned date and parses every date they have. */
export function dateMilestones(milestones: Milestone[]): DatedMilestone[] {
  const valid: DatedMilestone[] = [];
  milestones.forEach((m) => {
    const ps = parseDate(m.plannedStart);
    const pe = parseDate(m.plannedEnd);
    if (!ps && !pe) return;
    const start = ps || pe!;
    const end = pe || ps!;
    valid.push({
      ...m,
      startDate: start,
      endDate: end < start ? start : end,
      actualStartDate: parseDate(m.actualStart) || undefined,
      actualEndDate: parseDate(m.actualEnd) || undefined,
    });
  });
  return valid;
}

function monthColumns(padStart: Date, padEnd: Date): TimelineColumn[] {
  const cols: TimelineColumn[] = [];
  const cur = new Date(padStart.getFullYear(), padStart.getMonth(), 1);
  while (cur <= padEnd) {
    const monthEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
    const colStart = cur < padStart ? padStart : cur;
    const colEnd = monthEnd > padEnd ? padEnd : monthEnd;
    cols.push({ label: `${MONTH_NAMES[cur.getMonth()]} ${cur.getFullYear()}`, days: diffDays(colStart, colEnd) });
    cur.setMonth(cur.getMonth() + 1);
  }
  return cols;
}

function weekColumns(padStart: Date, padEnd: Date): TimelineColumn[] {
  const cols: TimelineColumn[] = [];
  const cur = new Date(padStart);
  cur.setDate(cur.getDate() - cur.getDay());
  while (cur <= padEnd) {
    cols.push({ label: formatShortDate(cur), days: 7 });
    cur.setDate(cur.getDate() + 7);
  }
  return cols;
}

/**
 * Builds the padded range every dated milestone fits in, with its columns.
 * With no dated milestone the range collapses to today and carries nothing.
 */
export function buildTimeline(milestones: Milestone[], viewMode: ViewMode): Timeline {
  const dated = dateMilestones(milestones);
  const dates = dated.flatMap((m) =>
    [m.startDate, m.endDate, m.actualStartDate, m.actualEndDate].filter((d): d is Date => Boolean(d)),
  );
  if (dates.length === 0) {
    return { start: new Date(), end: new Date(), totalDays: 1, columns: [], milestones: [] };
  }

  const min = new Date(Math.min(...dates.map((d) => d.getTime())));
  const max = new Date(Math.max(...dates.map((d) => d.getTime())));
  const padStart = new Date(min);
  padStart.setDate(padStart.getDate() - PAD_BEFORE_DAYS);
  const padEnd = new Date(max);
  padEnd.setDate(padEnd.getDate() + PAD_AFTER_DAYS);

  return {
    start: padStart,
    end: padEnd,
    totalDays: Math.max(1, diffDays(padStart, padEnd)),
    columns: viewMode === 'months' ? monthColumns(padStart, padEnd) : weekColumns(padStart, padEnd),
    milestones: dated,
  };
}

/** Where a bar sits along the timeline, as percentages of its total length. */
export function barPosition(timeline: Timeline, start: Date, end: Date): BarPosition {
  const leftDays = diffDays(timeline.start, start);
  const widthDays = Math.max(1, diffDays(start, end));
  const leftPct = (leftDays / timeline.totalDays) * 100;
  const widthPct = (widthDays / timeline.totalDays) * 100;
  return { left: `${Math.max(0, leftPct)}%`, width: `${Math.min(widthPct, 100 - leftPct)}%` };
}

/** The today marker's offset, or null when today falls outside the range. */
export function todayPosition(timeline: Timeline, today: Date): string | null {
  const d = diffDays(timeline.start, today);
  if (d < 0 || d > timeline.totalDays) return null;
  return `${(d / timeline.totalDays) * 100}%`;
}
