/**
 * One milestone in the list: name, status, weight, link badge, progress,
 * the inline percent, and the planned dates.
 */
import { MILESTONE_STATUS_LABELS, MILESTONE_STATUS_COLORS, type Milestone } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { Pencil } from 'lucide-react';

interface Props {
  milestone: Milestone;
  readOnly: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onPercentChange: (pct: number) => void;
}

export function MilestoneCard({ milestone: m, readOnly, onEdit, onDelete, onPercentChange }: Props) {
  return (
    <div className="p-3 rounded-lg border border-border bg-muted/10">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="text-sm font-medium">{m.name}</h4>
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${MILESTONE_STATUS_COLORS[m.status]}`}>
            {MILESTONE_STATUS_LABELS[m.status]}
          </span>
          {m.weight > 0 && <span className="text-xs text-muted-foreground">وزن: {m.weight}</span>}
          {m.linkedRevenueId && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">مربوط بإيراد</span>
          )}
        </div>
        {!readOnly && (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onEdit}>
            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
          </Button>
          <ConfirmDeleteDialog title="حذف المرحلة" description="هل أنت متأكد من حذف هذه المرحلة؟" onConfirm={onDelete} />
        </div>
        )}
      </div>
      {m.description && <p className="text-xs text-muted-foreground mb-2">{m.description}</p>}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <Progress value={m.percentComplete} className="h-2" />
        </div>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            value={m.percentComplete}
            onChange={(e) => onPercentChange(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
            className="w-16 h-7 text-xs text-center"
            min="0" max="100"
            disabled={readOnly}
          />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
      </div>
      {(m.plannedStart || m.plannedEnd) && (
        <p className="text-xs text-muted-foreground mt-1">
          {m.plannedStart && `بداية: ${m.plannedStart}`}
          {m.plannedStart && m.plannedEnd && ' · '}
          {m.plannedEnd && `نهاية: ${m.plannedEnd}`}
        </p>
      )}
    </div>
  );
}
