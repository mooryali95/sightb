import { useState, useEffect, useRef } from 'react';
import { useStore } from '@/store/useStore';
import { formatCurrency } from '@/lib/finance';
import {
  MILESTONE_STATUS_LABELS, MILESTONE_STATUS_COLORS, REVENUE_STATUS_LABELS,
  type MilestoneStatus, type Milestone, type Project, type Revenue,
} from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ResponsiveFormDialog } from '@/components/ResponsiveFormDialog';
import { FormFooter } from '@/components/FormFooter';
import { Plus, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GanttChart } from './GanttChart';
import { List, GanttChartSquare } from 'lucide-react';

interface MilestonesSectionProps {
  projectId: string;
  milestones: Milestone[];
  project: Project;
  readOnly?: boolean;
  revenues?: Revenue[];
}

export function MilestonesSection({ projectId, milestones, project, readOnly = false, revenues = [] }: MilestonesSectionProps) {
  const { addMilestone, updateMilestone, deleteMilestone, updateProject, updateRevenue } = useStore();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [weight, setWeight] = useState('');
  const [status, setStatus] = useState<MilestoneStatus>('planned');
  const [percentComplete, setPercentComplete] = useState('0');
  const [plannedStart, setPlannedStart] = useState('');
  const [plannedEnd, setPlannedEnd] = useState('');
  const [linkedRevenueId, setLinkedRevenueId] = useState('');

  // Revenue prompt
  const [revenuePrompt, setRevenuePrompt] = useState<{ milestoneId: string; revenue: Revenue } | null>(null);

  // Auto-detect delayed milestones (once per mount)
  const delayChecked = useRef(false);
  useEffect(() => {
    if (delayChecked.current || readOnly || milestones.length === 0) return;
    delayChecked.current = true;
    const now = new Date().toISOString().split('T')[0];
    milestones.forEach(async (m) => {
      if (m.plannedEnd && m.plannedEnd < now && m.status !== 'completed' && m.status !== 'delayed') {
        await updateMilestone(m.id, { status: 'delayed' });
        toast.info(`المرحلة "${m.name}" تحولت لـ "متأخرة" تلقائياً`);
      }
    });
    // Safe to depend on the array itself: `delayChecked` makes the body run at
    // most once per mount, so the extra re-runs return immediately instead of
    // writing again.
  }, [milestones, readOnly, updateMilestone]);

  const resetForm = () => {
    setEditingId(null); setName(''); setDescription(''); setWeight('');
    setStatus('planned'); setPercentComplete('0'); setPlannedStart(''); setPlannedEnd('');
    setLinkedRevenueId('');
  };

  const openEdit = (m: Milestone) => {
    setEditingId(m.id); setName(m.name); setDescription(m.description || '');
    setWeight(String(m.weight)); setStatus(m.status);
    setPercentComplete(String(m.percentComplete));
    setPlannedStart(m.plannedStart || ''); setPlannedEnd(m.plannedEnd || '');
    setLinkedRevenueId(m.linkedRevenueId || '');
    setOpen(true);
  };

  const recalcProjectPercent = (updatedMilestones: Milestone[]) => {
    const totalWeight = updatedMilestones.reduce((s, m) => s + m.weight, 0);
    if (totalWeight === 0) return 0;
    const weighted = updatedMilestones.reduce((s, m) => s + (m.weight * m.percentComplete), 0);
    return Math.round(weighted / totalWeight);
  };

  const checkRevenuePrompt = (milestoneId: string, pct: number, statusVal?: string) => {
    if (pct === 100 || statusVal === 'completed') {
      const milestone = milestones.find(m => m.id === milestoneId);
      if (milestone?.linkedRevenueId) {
        const linkedRevenue = revenues.find(r => r.id === milestone.linkedRevenueId);
        if (linkedRevenue && linkedRevenue.status === 'planned') {
          setRevenuePrompt({ milestoneId, revenue: linkedRevenue });
        }
      }
    }
  };

  const checkProjectAutoComplete = async (updatedMilestones: Milestone[], projectPct: number) => {
    if (updatedMilestones.length === 0) return;
    const allCompleted = updatedMilestones.every(m => m.status === 'completed' || m.percentComplete === 100);
    if (allCompleted && projectPct === 100 && project.status === 'active') {
      await updateProject(projectId, { status: 'completed', percentComplete: 100 });
      toast.success('🎉 المشروع اكتمل — تم تحويل حالته إلى "مكتمل" تلقائياً');
    }
    if (!allCompleted && project.status === 'completed') {
      await updateProject(projectId, { status: 'active' });
      toast.info('المشروع عاد لحالة "نشط" — بعض المراحل لم تكتمل');
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    let pct = parseInt(percentComplete) || 0;
    let st = status;

    // Auto status based on percent
    if (pct === 100 && st !== 'completed') st = 'completed';
    if (pct > 0 && pct < 100 && st === 'planned') st = 'in_progress';

    const data = {
      name: name.trim(),
      description: description || undefined,
      weight: parseFloat(weight) || 0,
      status: st,
      percentComplete: pct,
      plannedStart: plannedStart || undefined,
      plannedEnd: plannedEnd || undefined,
      sortOrder: milestones.length,
      linkedRevenueId: linkedRevenueId && linkedRevenueId !== 'none' ? linkedRevenueId : undefined,
    };

    if (editingId) {
      await updateMilestone(editingId, data);
      const updated = milestones.map(m => m.id === editingId ? { ...m, ...data } : m);
      const newPct = recalcProjectPercent(updated);
      await updateProject(projectId, { percentComplete: newPct });
      toast.success('تم تعديل المرحلة');
      checkRevenuePrompt(editingId, data.percentComplete, data.status);
      await checkProjectAutoComplete(updated, newPct);
    } else {
      await addMilestone({ projectId, ...data, actualStart: undefined, actualEnd: undefined });
      toast.success('تمت إضافة المرحلة');
    }
    resetForm();
    setOpen(false);
  };

  const handlePercentChange = async (m: Milestone, newPct: number) => {
    const updates: Partial<Milestone> = { percentComplete: newPct };

    // Auto status transitions
    if (newPct === 100 && m.status !== 'completed') {
      updates.status = 'completed';
      toast.success(`✓ المرحلة "${m.name}" اكتملت تلقائياً`);
    }
    if (newPct < 100 && newPct > 0 && m.status === 'completed') {
      updates.status = 'in_progress';
    }
    if (newPct > 0 && m.status === 'planned') {
      updates.status = 'in_progress';
    }

    await updateMilestone(m.id, updates);
    const updated = milestones.map(ms => ms.id === m.id ? { ...ms, ...updates } : ms);
    const projectPct = recalcProjectPercent(updated);
    await updateProject(projectId, { percentComplete: projectPct });
    await checkProjectAutoComplete(updated, projectPct);
    checkRevenuePrompt(m.id, newPct, updates.status);
  };

  // Sort milestones by planned start date, then planned end date
  const sortedMilestones = [...milestones].sort((a, b) => {
    const dateA = a.plannedStart || a.plannedEnd || '';
    const dateB = b.plannedStart || b.plannedEnd || '';
    if (dateA && dateB) return dateA.localeCompare(dateB);
    if (dateA) return -1;
    if (dateB) return 1;
    return a.sortOrder - b.sortOrder;
  });

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
        {!readOnly && (
        <ResponsiveFormDialog
          open={open}
          onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}
          title={editingId ? 'تعديل المرحلة' : 'إضافة مرحلة'}
          trigger={<Button size="sm" className="gap-1.5"><Plus className="w-3.5 h-3.5" />مرحلة جديدة</Button>}
          footer={<FormFooter onCancel={() => setOpen(false)} onSubmit={handleSubmit} submitLabel={editingId ? 'حفظ التعديلات' : 'إضافة'} />}
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
        )}
      </div>

      {/* Overall progress */}
      {milestones.length > 0 && (
        <div className="mb-4 space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>الإنجاز الكلي للمشروع</span>
            <span>{weightedComplete}%</span>
          </div>
          <Progress value={weightedComplete} className="h-3" />

          {totalWeight > 0 && (totalWeight < 0.99 || totalWeight > 1.01) && (
            <div className="p-2 rounded-lg border bg-health-warning health-warning text-xs flex items-center gap-1.5">
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
        <Tabs defaultValue="list" className="space-y-3">
          <TabsList className="h-8">
            <TabsTrigger value="list" className="gap-1 text-xs"><List className="w-3.5 h-3.5" />قائمة</TabsTrigger>
            <TabsTrigger value="gantt" className="gap-1 text-xs"><GanttChartSquare className="w-3.5 h-3.5" />Gantt</TabsTrigger>
          </TabsList>

          <TabsContent value="gantt">
            <GanttChart milestones={milestones} onMilestoneClick={(m) => !readOnly && openEdit(m)} />
          </TabsContent>

          <TabsContent value="list">
          <div className="space-y-3">
          {sortedMilestones.map((m) => (
            <div key={m.id} className="p-3 rounded-lg border border-border bg-muted/10">
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
                  <Button variant="ghost" size="icon" onClick={() => openEdit(m)}>
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                  <ConfirmDeleteDialog title="حذف المرحلة" description="هل أنت متأكد من حذف هذه المرحلة؟" onConfirm={() => deleteMilestone(m.id)} />
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
                    onChange={(e) => handlePercentChange(m, Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
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
          ))}
          </div>
          </TabsContent>
        </Tabs>
      )}

      {/* Revenue auto-suggest dialog */}
      <Dialog open={!!revenuePrompt} onOpenChange={(v) => { if (!v) setRevenuePrompt(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>إصدار فاتورة؟</DialogTitle>
          </DialogHeader>
          {revenuePrompt && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                المرحلة اكتملت — هل تريد تحويل الدفعة المرتبطة إلى "مُفوتر"؟
              </p>
              <div className="p-3 rounded-lg border border-border bg-muted/30">
                <p className="text-sm font-medium">{revenuePrompt.revenue.description}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  المبلغ: {formatCurrency(revenuePrompt.revenue.amount)} · الحالة: {REVENUE_STATUS_LABELS[revenuePrompt.revenue.status]}
                </p>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={async () => {
                  await updateRevenue(revenuePrompt.revenue.id, { status: 'invoiced' });
                  toast.success('تم تحويل الدفعة إلى مُفوتر');
                  setRevenuePrompt(null);
                }}>
                  نعم — أصدر الفاتورة
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setRevenuePrompt(null)}>
                  لاحقاً
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
