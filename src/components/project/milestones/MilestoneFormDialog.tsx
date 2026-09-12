/**
 * The milestone form, for adding and for editing. It collects and
 * normalises the values; the section owns the writes, since a save also
 * moves the project's percent and may offer an invoice.
 *
 * The section remounts this component (via `key`) on every open, so an
 * edit starts from the row through the `useState` initialisers and an add
 * starts blank; there is no reset handler.
 */
import { useState } from 'react';
import { formatCurrency } from '@/lib/finance';
import {
  MILESTONE_STATUS_LABELS, REVENUE_STATUS_LABELS, type Milestone, type MilestoneStatus, type Revenue,
} from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveFormDialog } from '@/components/ResponsiveFormDialog';
import { FormFooter } from '@/components/FormFooter';
import { Plus } from 'lucide-react';

/** What a saved form carries. Empty strings mean a cleared optional field. */
export interface MilestoneFormValues {
  name: string;
  description: string;
  weight: number;
  status: MilestoneStatus;
  percentComplete: number;
  plannedStart: string;
  plannedEnd: string;
  /** Empty when unlinked. */
  linkedRevenueId: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The section opens the form (and remounts it) when the trigger is pressed. */
  onRequestOpen: () => void;
  /** The row being edited; absent for a new milestone. */
  editing?: Milestone;
  revenues: Revenue[];
  onSave: (values: MilestoneFormValues) => Promise<void>;
}

export function MilestoneFormDialog({ open, onOpenChange, onRequestOpen, editing, revenues, onSave }: Props) {
  const [name, setName] = useState(editing?.name ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [weight, setWeight] = useState(editing ? String(editing.weight) : '');
  const [status, setStatus] = useState<MilestoneStatus>(editing?.status ?? 'planned');
  const [percentComplete, setPercentComplete] = useState(editing ? String(editing.percentComplete) : '0');
  const [plannedStart, setPlannedStart] = useState(editing?.plannedStart ?? '');
  const [plannedEnd, setPlannedEnd] = useState(editing?.plannedEnd ?? '');
  const [linkedRevenueId, setLinkedRevenueId] = useState(editing?.linkedRevenueId ?? '');

  const handleSubmit = async () => {
    if (!name.trim()) return;
    const pct = parseInt(percentComplete) || 0;
    let st = status;

    // Auto status based on percent
    if (pct === 100 && st !== 'completed') st = 'completed';
    if (pct > 0 && pct < 100 && st === 'planned') st = 'in_progress';

    await onSave({
      name: name.trim(), weight: parseFloat(weight) || 0, status: st, percentComplete: pct,
      description: description.trim(), plannedStart, plannedEnd,
      linkedRevenueId: linkedRevenueId && linkedRevenueId !== 'none' ? linkedRevenueId : '',
    });
    onOpenChange(false);
  };

  return (
    <ResponsiveFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? 'تعديل المرحلة' : 'إضافة مرحلة'}
      trigger={<Button size="sm" className="gap-1.5" onClick={onRequestOpen}><Plus className="w-3.5 h-3.5" />مرحلة جديدة</Button>}
      footer={<FormFooter onCancel={() => onOpenChange(false)} onSubmit={handleSubmit} submitLabel={editing ? 'حفظ التعديلات' : 'إضافة'} />}
    >
      <div className="space-y-4">
          <div className="space-y-2">
            <Label>اسم المرحلة</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: مرحلة التصميم" />
          </div>
          <div className="space-y-2">
            <Label>الوصف (اختياري)</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>الوزن (0-1)</Label>
              <Input type="number" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} step="0.1" min="0" max="1" placeholder="0.25" />
            </div>
            <div className="space-y-2">
              <Label>الإنجاز %</Label>
              <Input type="number" inputMode="numeric" value={percentComplete} onChange={(e) => setPercentComplete(e.target.value)} min="0" max="100" />
            </div>
            <div className="space-y-2">
              <Label>الحالة</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as MilestoneStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(MILESTONE_STATUS_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>تاريخ البداية المخطط</Label>
              <Input type="date" value={plannedStart} onChange={(e) => setPlannedStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>تاريخ النهاية المخطط</Label>
              <Input type="date" value={plannedEnd} onChange={(e) => setPlannedEnd(e.target.value)} />
            </div>
          </div>
          {revenues.length > 0 && (
            <div className="space-y-2">
              <Label>ربط بإيراد (اختياري)</Label>
              <Select value={linkedRevenueId} onValueChange={setLinkedRevenueId}>
                <SelectTrigger><SelectValue placeholder="بدون ربط" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون ربط</SelectItem>
                  {revenues.map(r => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.description} — {formatCurrency(r.amount)} ({REVENUE_STATUS_LABELS[r.status]})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
      </div>
    </ResponsiveFormDialog>
  );
}
