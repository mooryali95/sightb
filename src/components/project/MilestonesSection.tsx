import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { formatCurrency } from '@/lib/finance';
import {
  MILESTONE_STATUS_LABELS, MILESTONE_STATUS_COLORS,
  type MilestoneStatus, type Milestone, type Project,
} from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { Progress } from '@/components/ui/progress';

interface MilestonesSectionProps {
  projectId: string;
  milestones: Milestone[];
  project: Project;
}

export function MilestonesSection({ projectId, milestones, project }: MilestonesSectionProps) {
  const { addMilestone, updateMilestone, deleteMilestone, updateProject } = useStore();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [weight, setWeight] = useState('');
  const [status, setStatus] = useState<MilestoneStatus>('planned');
  const [percentComplete, setPercentComplete] = useState('0');
  const [plannedStart, setPlannedStart] = useState('');
  const [plannedEnd, setPlannedEnd] = useState('');

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setWeight('');
    setStatus('planned');
    setPercentComplete('0');
    setPlannedStart('');
    setPlannedEnd('');
  };

  const openEdit = (m: Milestone) => {
    setEditingId(m.id);
    setName(m.name);
    setDescription(m.description || '');
    setWeight(String(m.weight));
    setStatus(m.status);
    setPercentComplete(String(m.percentComplete));
    setPlannedStart(m.plannedStart || '');
    setPlannedEnd(m.plannedEnd || '');
    setOpen(true);
  };

  const recalcProjectPercent = (updatedMilestones: Milestone[]) => {
    const totalWeight = updatedMilestones.reduce((s, m) => s + m.weight, 0);
    if (totalWeight === 0) return 0;
    const weighted = updatedMilestones.reduce((s, m) => s + (m.weight * m.percentComplete), 0);
    return Math.round(weighted / totalWeight);
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    const data = {
      name: name.trim(),
      description: description || undefined,
      weight: parseFloat(weight) || 0,
      status,
      percentComplete: parseInt(percentComplete) || 0,
      plannedStart: plannedStart || undefined,
      plannedEnd: plannedEnd || undefined,
      sortOrder: milestones.length,
    };

    if (editingId) {
      await updateMilestone(editingId, data);
      const updated = milestones.map(m => m.id === editingId ? { ...m, ...data } : m);
      const newPct = recalcProjectPercent(updated);
      await updateProject(projectId, { percentComplete: newPct });
      toast.success('تم تعديل المرحلة');
    } else {
      await addMilestone({ projectId, ...data, linkedRevenueId: undefined, actualStart: undefined, actualEnd: undefined });
      toast.success('تمت إضافة المرحلة');
    }
    resetForm();
    setOpen(false);
  };

  const handlePercentChange = async (m: Milestone, newPct: number) => {
    await updateMilestone(m.id, { percentComplete: newPct });
    const updated = milestones.map(ms => ms.id === m.id ? { ...ms, percentComplete: newPct } : ms);
    const projectPct = recalcProjectPercent(updated);
    await updateProject(projectId, { percentComplete: projectPct });
  };

  const totalWeight = milestones.reduce((s, m) => s + m.weight, 0);
  const weightedComplete = totalWeight > 0
    ? Math.round(milestones.reduce((s, m) => s + (m.weight * m.percentComplete), 0) / totalWeight)
    : 0;

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold">المراحل والمعالم</h3>
          <p className="text-xs text-muted-foreground">
            الإنجاز المرجّح: {weightedComplete}% · {milestones.length} مرحلة
            {totalWeight > 0 && totalWeight !== 1 && ` · إجمالي الأوزان: ${totalWeight.toFixed(2)}`}
          </p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5"><Plus className="w-3.5 h-3.5" />مرحلة جديدة</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingId ? 'تعديل المرحلة' : 'إضافة مرحلة'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
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
                  <Input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} step="0.1" min="0" max="1" placeholder="0.25" />
                </div>
                <div className="space-y-2">
                  <Label>الإنجاز %</Label>
                  <Input type="number" value={percentComplete} onChange={(e) => setPercentComplete(e.target.value)} min="0" max="100" />
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
              <Button onClick={handleSubmit} className="w-full">{editingId ? 'حفظ التعديلات' : 'إضافة'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Overall progress */}
      {milestones.length > 0 && (
        <div className="mb-4 space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>الإنجاز الكلي للمشروع</span>
            <span>{weightedComplete}%</span>
          </div>
          <Progress value={weightedComplete} className="h-3" />

          {/* Weight warning */}
          {totalWeight > 0 && (totalWeight < 0.99 || totalWeight > 1.01) && (
            <div className="p-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-400 text-xs flex items-center gap-1.5">
              ⚠️ مجموع الأوزان ({totalWeight.toFixed(2)}) {totalWeight < 0.99 ? 'أقل' : 'أكبر'} من 1 — يُفضل أن يكون المجموع = 1.00
            </div>
          )}
        </div>
      )}

      {milestones.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">لا توجد مراحل بعد</p>
          <p className="text-xs text-muted-foreground mt-1">أضف مراحل المشروع لتتبع الإنجاز وربط مؤشرات EVM</p>
        </div>
      ) : (
        <div className="space-y-3">
          {milestones.map((m) => (
            <div key={m.id} className="p-3 rounded-lg border border-border bg-muted/10">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium">{m.name}</h4>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${MILESTONE_STATUS_COLORS[m.status]}`}>
                    {MILESTONE_STATUS_LABELS[m.status]}
                  </span>
                  {m.weight > 0 && <span className="text-[10px] text-muted-foreground">وزن: {m.weight}</span>}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(m)}>
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                  <ConfirmDeleteDialog title="حذف المرحلة" description="هل أنت متأكد من حذف هذه المرحلة؟" onConfirm={() => deleteMilestone(m.id)} />
                </div>
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
                    onChange={(e) => handlePercentChange(m, Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                    className="w-16 h-7 text-xs text-center"
                    min="0" max="100"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
              {(m.plannedStart || m.plannedEnd) && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  {m.plannedStart && `بداية: ${m.plannedStart}`}
                  {m.plannedStart && m.plannedEnd && ' · '}
                  {m.plannedEnd && `نهاية: ${m.plannedEnd}`}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
