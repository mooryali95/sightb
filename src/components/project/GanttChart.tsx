import { useMemo, useState } from 'react';
import { Milestone, MILESTONE_STATUS_LABELS, MILESTONE_STATUS_COLORS } from '@/types/project';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface GanttChartProps {
  milestones: Milestone[];
  onMilestoneClick?: (milestone: Milestone) => void;
}

const STATUS_BAR_COLORS: Record<string, string> = {
  planned: 'bg-slate-400 dark:bg-slate-500',
  in_progress: 'bg-blue-500 dark:bg-blue-400',
  completed: 'bg-emerald-500 dark:bg-emerald-400',
  delayed: 'bg-red-500 dark:bg-red-400',
  cancelled: 'bg-gray-300 dark:bg-gray-600',
};

const ACTUAL_BAR_COLORS: Record<string, string> = {
  planned: 'bg-slate-300/50 dark:bg-slate-600/50',
  in_progress: 'bg-blue-300/60 dark:bg-blue-600/40',
  completed: 'bg-emerald-300/60 dark:bg-emerald-600/40',
  delayed: 'bg-red-300/60 dark:bg-red-600/40',
  cancelled: 'bg-gray-200/50 dark:bg-gray-700/50',
};

function parseDate(d?: string | null): Date | null {
  if (!d) return null;
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function formatShortDate(d: Date): string {
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function diffDays(a: Date, b: Date): number {
  return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

type ViewMode = 'months' | 'weeks';

export function GanttChart({ milestones, onMilestoneClick }: GanttChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('months');

  const { timelineStart, timelineEnd, totalDays, columns, validMilestones } = useMemo(() => {
    // Collect all dates
    const dates: Date[] = [];
    const valid: (Milestone & { startDate: Date; endDate: Date; actualStartDate?: Date; actualEndDate?: Date })[] = [];

    milestones.forEach(m => {
      const ps = parseDate(m.plannedStart);
      const pe = parseDate(m.plannedEnd);
      if (!ps && !pe) return; // Skip milestones without dates

      const start = ps || pe!;
      const end = pe || ps!;
      dates.push(start, end);

      const as = parseDate(m.actualStart);
      const ae = parseDate(m.actualEnd);
      if (as) dates.push(as);
      if (ae) dates.push(ae);

      valid.push({
        ...m,
        startDate: start,
        endDate: end < start ? start : end,
        actualStartDate: as || undefined,
        actualEndDate: ae || undefined,
      });
    });

    if (dates.length === 0) {
      return { timelineStart: new Date(), timelineEnd: new Date(), totalDays: 1, columns: [] as { label: string; days: number }[], validMilestones: [] as typeof valid };
    }

    const min = new Date(Math.min(...dates.map(d => d.getTime())));
    const max = new Date(Math.max(...dates.map(d => d.getTime())));

    // Add padding
    const padStart = new Date(min);
    padStart.setDate(padStart.getDate() - 7);
    const padEnd = new Date(max);
    padEnd.setDate(padEnd.getDate() + 14);

    const total = Math.max(1, diffDays(padStart, padEnd));

    // Generate columns
    const cols: { label: string; days: number }[] = [];
    if (viewMode === 'months') {
      const cur = new Date(padStart.getFullYear(), padStart.getMonth(), 1);
      while (cur <= padEnd) {
        const monthEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
        const colStart = cur < padStart ? padStart : cur;
        const colEnd = monthEnd > padEnd ? padEnd : monthEnd;
        const days = diffDays(colStart, colEnd);
        const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
        cols.push({ label: `${monthNames[cur.getMonth()]} ${cur.getFullYear()}`, days });
        cur.setMonth(cur.getMonth() + 1);
      }
    } else {
      const cur = new Date(padStart);
      const dayOfWeek = cur.getDay();
      cur.setDate(cur.getDate() - dayOfWeek);
      while (cur <= padEnd) {
        const weekEnd = new Date(cur);
        weekEnd.setDate(weekEnd.getDate() + 6);
        cols.push({ label: `${formatShortDate(cur)}`, days: 7 });
        cur.setDate(cur.getDate() + 7);
      }
    }

    return { timelineStart: padStart, timelineEnd: padEnd, totalDays: total, columns: cols, validMilestones: valid };
  }, [milestones, viewMode]);

  if (validMilestones.length === 0) {
    return (
      <div className="text-center py-6 text-sm text-muted-foreground">
        لا توجد مراحل بتواريخ محددة لعرضها في المخطط الزمني
      </div>
    );
  }

  const getBarPosition = (start: Date, end: Date) => {
    const leftDays = diffDays(timelineStart, start);
    const widthDays = Math.max(1, diffDays(start, end));
    const leftPct = (leftDays / totalDays) * 100;
    const widthPct = (widthDays / totalDays) * 100;
    return { left: `${Math.max(0, leftPct)}%`, width: `${Math.min(widthPct, 100 - leftPct)}%` };
  };

  const today = new Date();
  const todayPos = (() => {
    const d = diffDays(timelineStart, today);
    if (d < 0 || d > totalDays) return null;
    return `${(d / totalDays) * 100}%`;
  })();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">المخطط الزمني (Gantt)</h4>
        <Select value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
          <SelectTrigger className="w-24 h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="months">شهري</SelectItem>
            <SelectItem value="weeks">أسبوعي</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border border-border rounded-lg overflow-hidden bg-card">
        {/* Header */}
        <div className="flex border-b border-border bg-muted/30">
          <div className="w-36 shrink-0 px-3 py-2 text-[10px] font-medium text-muted-foreground border-l border-border">
            المرحلة
          </div>
          <div className="flex-1 flex min-w-0">
            {columns.map((col, i) => (
              <div
                key={i}
                className="text-[10px] text-center text-muted-foreground py-2 border-l border-border/50 truncate"
                style={{ flex: col.days }}
              >
                {col.label}
              </div>
            ))}
          </div>
        </div>

        {/* Rows */}
        <div className="relative">
          {/* Today line */}
          {todayPos && (
            <div
              className="absolute top-0 bottom-0 w-px bg-destructive/60 z-10 pointer-events-none"
              style={{ right: todayPos }}
            >
              <div className="absolute -top-0 right-[-10px] text-[8px] text-destructive bg-destructive/10 px-1 rounded">
                اليوم
              </div>
            </div>
          )}

          {validMilestones.map((m, idx) => {
            const planned = getBarPosition(m.startDate, m.endDate);
            const hasActual = m.actualStartDate;
            const actual = hasActual
              ? getBarPosition(m.actualStartDate!, m.actualEndDate || today)
              : null;

            return (
              <div
                key={m.id}
                className={cn(
                  'flex items-center border-b border-border/30 hover:bg-muted/20 transition-colors',
                  idx % 2 === 0 ? 'bg-transparent' : 'bg-muted/5',
                )}
                style={{ minHeight: 40 }}
              >
                {/* Label */}
                <div
                  className="w-36 shrink-0 px-3 py-1.5 border-l border-border cursor-pointer hover:text-primary transition-colors"
                  onClick={() => onMilestoneClick?.(m)}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={cn('w-2 h-2 rounded-full shrink-0', STATUS_BAR_COLORS[m.status])} />
                    <span className="text-xs truncate font-medium">{m.name}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{m.percentComplete}%</span>
                </div>

                {/* Timeline area */}
                <div className="flex-1 relative h-full" style={{ minHeight: 40 }}>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            'absolute top-2 h-5 rounded-sm cursor-pointer transition-all hover:brightness-110',
                            STATUS_BAR_COLORS[m.status],
                          )}
                          style={{ right: planned.left, width: planned.width, minWidth: 4 }}
                          onClick={() => onMilestoneClick?.(m)}
                        >
                          {/* Progress fill inside planned bar */}
                          {m.percentComplete > 0 && m.percentComplete < 100 && (
                            <div
                              className="absolute inset-y-0 right-0 rounded-sm bg-white/30 dark:bg-white/20"
                              style={{ width: `${m.percentComplete}%` }}
                            />
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs max-w-xs" dir="rtl">
                        <div className="space-y-1">
                          <p className="font-semibold">{m.name}</p>
                          <p>الحالة: {MILESTONE_STATUS_LABELS[m.status]}</p>
                          <p>الإنجاز: {m.percentComplete}%</p>
                          {m.plannedStart && <p>بداية مخططة: {m.plannedStart}</p>}
                          {m.plannedEnd && <p>نهاية مخططة: {m.plannedEnd}</p>}
                          {m.actualStart && <p>بداية فعلية: {m.actualStart}</p>}
                          {m.actualEnd && <p>نهاية فعلية: {m.actualEnd}</p>}
                          {m.weight > 0 && <p>الوزن: {m.weight}</p>}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  {/* Actual bar (below planned) */}
                  {actual && (
                    <div
                      className={cn(
                        'absolute top-6 h-2 rounded-full opacity-80',
                        ACTUAL_BAR_COLORS[m.status],
                      )}
                      style={{ right: actual.left, width: actual.width, minWidth: 4 }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-t border-border bg-muted/20 text-[10px]">
          {Object.entries(MILESTONE_STATUS_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center gap-1">
              <span className={cn('w-2.5 h-2.5 rounded-sm', STATUS_BAR_COLORS[key])} />
              <span className="text-muted-foreground">{label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1 mr-2">
            <span className="w-4 h-1 rounded-full bg-destructive/60" />
            <span className="text-muted-foreground">اليوم</span>
          </div>
        </div>
      </div>
    </div>
  );
}
