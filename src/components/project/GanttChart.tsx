import { useMemo, useState } from 'react';
import { Milestone, MILESTONE_STATUS_LABELS } from '@/types/project';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { STATUS_BAR_COLORS, buildTimeline, todayPosition, type ViewMode } from './gantt/timeline';
import { GanttRow } from './gantt/GanttRow';

interface GanttChartProps {
  milestones: Milestone[];
  onMilestoneClick?: (milestone: Milestone) => void;
}

export function GanttChart({ milestones, onMilestoneClick }: GanttChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('months');
  const timeline = useMemo(() => buildTimeline(milestones, viewMode), [milestones, viewMode]);

  if (timeline.milestones.length === 0) {
    return (
      <div className="text-center py-6 text-sm text-muted-foreground">
        لا توجد مراحل بتواريخ محددة لعرضها في المخطط الزمني
      </div>
    );
  }

  const today = new Date();
  const todayPos = todayPosition(timeline, today);

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
        <div className="flex border-b border-border bg-muted/30">
          <div className="w-36 shrink-0 px-3 py-2 text-xs font-medium text-muted-foreground border-l border-border">
            المرحلة
          </div>
          <div className="flex-1 flex min-w-0">
            {timeline.columns.map((col, i) => (
              <div
                key={i}
                className="text-xs text-center text-muted-foreground py-2 border-l border-border/50 truncate"
                style={{ flex: col.days }}
              >
                {col.label}
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
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

          {timeline.milestones.map((m, idx) => (
            <GanttRow
              key={m.id}
              milestone={m}
              timeline={timeline}
              today={today}
              striped={idx % 2 === 1}
              onClick={onMilestoneClick}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-t border-border bg-muted/20 text-xs">
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
