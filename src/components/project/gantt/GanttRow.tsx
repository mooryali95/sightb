import { Milestone, MILESTONE_STATUS_LABELS } from '@/types/project';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ACTUAL_BAR_COLORS, STATUS_BAR_COLORS, barPosition, type DatedMilestone, type Timeline } from './timeline';

interface GanttRowProps {
  milestone: DatedMilestone;
  timeline: Timeline;
  today: Date;
  striped: boolean;
  onClick?: (milestone: Milestone) => void;
}

/** One milestone: its label, its planned bar with the progress fill, and the actual bar under it. */
export function GanttRow({ milestone: m, timeline, today, striped, onClick }: GanttRowProps) {
  const planned = barPosition(timeline, m.startDate, m.endDate);
  const actual = m.actualStartDate ? barPosition(timeline, m.actualStartDate, m.actualEndDate || today) : null;

  return (
    <div
      className={cn(
        'flex items-center border-b border-border/30 hover:bg-muted/20 transition-colors',
        striped ? 'bg-muted/5' : 'bg-transparent',
      )}
      style={{ minHeight: 40 }}
    >
      <div
        className="w-36 shrink-0 px-3 py-1.5 border-e border-border cursor-pointer hover:text-primary transition-colors"
        onClick={() => onClick?.(m)}
      >
        <div className="flex items-center gap-1.5">
          <span className={cn('w-2 h-2 rounded-full shrink-0', STATUS_BAR_COLORS[m.status])} />
          <span className="text-xs truncate font-medium">{m.name}</span>
        </div>
        <span className="text-xs text-muted-foreground">{m.percentComplete}%</span>
      </div>

      <div className="flex-1 relative h-full" style={{ minHeight: 40 }}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'absolute top-2 h-5 rounded-sm cursor-pointer transition hover:brightness-110',
                  STATUS_BAR_COLORS[m.status],
                )}
                style={{ right: planned.left, width: planned.width, minWidth: 4 }}
                onClick={() => onClick?.(m)}
              >
                {m.percentComplete > 0 && m.percentComplete < 100 && (
                  <div
                    className="absolute inset-y-0 start-0 rounded-sm bg-white/30 dark:bg-white/20"
                    style={{ width: `${m.percentComplete}%` }}
                  />
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs max-w-xs">
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

        {actual && (
          <div
            className={cn('absolute top-6 h-2 rounded-full opacity-80', ACTUAL_BAR_COLORS[m.status])}
            style={{ right: actual.left, width: actual.width, minWidth: 4 }}
          />
        )}
      </div>
    </div>
  );
}
