/**
 * The milestones section: the weighted percent complete, the list (or the
 * Gantt view), and every write that moves a milestone. Each write leaves
 * the project row's percent in step with the milestones, since EVM and the
 * dashboard read it there. The form, the card, the invoice prompt and the
 * maths live under milestones/.
 */
import { useState, useEffect, useRef } from 'react';
import { useStore } from '@/store/useStore';
import { useDialogSession } from '@/hooks/useDialogSession';
import { type Milestone, type MilestoneUpdate, type Project, type Revenue } from '@/types/project';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GanttChart } from './GanttChart';
import { List, GanttChartSquare } from 'lucide-react';
import { MilestoneFormDialog, type MilestoneFormValues } from './milestones/MilestoneFormDialog';
import { MilestoneCard } from './milestones/MilestoneCard';
import { InvoicePrompt } from './milestones/InvoicePrompt';
import { weightedPercent, sortMilestones, statusForPercent } from './milestones/milestoneFigures';
import { runOrToast } from '@/lib/run-or-toast';
import { todayLocal } from '@/lib/utils';

interface MilestonesSectionProps {
  projectId: string;
  milestones: Milestone[];
  project: Project;
  readOnly?: boolean;
  revenues?: Revenue[];
}

export function MilestonesSection({ projectId, milestones, project, readOnly = false, revenues = [] }: MilestonesSectionProps) {
  const { addMilestone, updateMilestone, deleteMilestone, updateProject } = useStore();
  // Remounted on open so an edit starts from the row and an add starts blank; see useDialogSession.
  const form = useDialogSession<{ milestone?: Milestone }>();
  const [invoiceFor, setInvoiceFor] = useState<Revenue | null>(null);

  // Auto-detect delayed milestones (once per mount)
  const delayChecked = useRef(false);
  useEffect(() => {
    if (delayChecked.current || readOnly || milestones.length === 0) return;
    delayChecked.current = true;
    const now = todayLocal();
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

  // The link is passed in rather than read from the row: an edit may set the
  // link and the completion together, and the row still carries the old one.
  const checkRevenuePrompt = (pct: number, statusVal: string | undefined, linkedRevenueId: string | undefined) => {
    if (pct === 100 || statusVal === 'completed') {
      const linkedRevenue = linkedRevenueId ? revenues.find(r => r.id === linkedRevenueId) : undefined;
      if (linkedRevenue && linkedRevenue.status === 'planned') setInvoiceFor(linkedRevenue);
    }
  };

  // Every write that moves a milestone leaves the project row's percent
  // consistent with the milestones, and completes or reactivates the project.
  const syncProject = async (updated: Milestone[]) => {
    const projectPct = weightedPercent(updated);
    await updateProject(projectId, { percentComplete: projectPct });
    if (updated.length === 0) return;
    const allCompleted = updated.every(m => m.status === 'completed' || m.percentComplete === 100);
    if (allCompleted && projectPct === 100 && project.status === 'active') {
      await updateProject(projectId, { status: 'completed', percentComplete: 100 });
      toast.success('🎉 المشروع اكتمل — تم تحويل حالته إلى "مكتمل" تلقائياً');
    }
    if (!allCompleted && project.status === 'completed') {
      await updateProject(projectId, { status: 'active' });
      toast.info('المشروع عاد لحالة "نشط" — بعض المراحل لم تكتمل');
    }
  };

  const handleSave = async (values: MilestoneFormValues) => {
    const editing = form.value?.milestone;
    const link = values.linkedRevenueId || undefined;
    if (editing) {
      // A cleared field goes as null so the store writes it; undefined would mean "unchanged".
      const data: MilestoneUpdate = {
        ...values,
        description: values.description || null,
        plannedStart: values.plannedStart || null,
        plannedEnd: values.plannedEnd || null,
        linkedRevenueId: link ?? null,
        sortOrder: editing.sortOrder,
      };
      await updateMilestone(editing.id, data);
      toast.success('تم تعديل المرحلة');
      await syncProject(milestones.map(m => m.id === editing.id ? { ...m, ...values, linkedRevenueId: link } : m));
      checkRevenuePrompt(values.percentComplete, values.status, link);
    } else {
      const data = {
        ...values,
        description: values.description || undefined,
        plannedStart: values.plannedStart || undefined,
        plannedEnd: values.plannedEnd || undefined,
        linkedRevenueId: link,
        sortOrder: milestones.length,
        actualStart: undefined, actualEnd: undefined,
      };
      const newId = await addMilestone({ projectId, ...data });
      toast.success('تمت إضافة المرحلة');
      await syncProject([...milestones, { id: newId, projectId, createdAt: '', ...data }]);
    }
  };

  const handleDelete = async (m: Milestone) => {
    if (!(await runOrToast(() => deleteMilestone(m.id), 'تعذّر حذف المرحلة'))) return;
    await runOrToast(() => syncProject(milestones.filter(x => x.id !== m.id)), 'حُذفت المرحلة وتعذّر تحديث إنجاز المشروع');
  };

  const handlePercentChange = async (m: Milestone, newPct: number) => {
    const updates: Partial<Milestone> = { percentComplete: newPct };
    const next = statusForPercent(m.status, newPct);
    if (next) updates.status = next;
    if (next === 'completed') toast.success(`✓ المرحلة "${m.name}" اكتملت تلقائياً`);

    if (!(await runOrToast(() => updateMilestone(m.id, updates), 'تعذّر تحديث إنجاز المرحلة'))) return;
    await runOrToast(() => syncProject(milestones.map(ms => ms.id === m.id ? { ...ms, ...updates } : ms)), 'تعذّر تحديث إنجاز المشروع');
    checkRevenuePrompt(newPct, updates.status, m.linkedRevenueId);
  };

  const sortedMilestones = sortMilestones(milestones);
  const totalWeight = milestones.reduce((s, m) => s + m.weight, 0);
  const weightedComplete = weightedPercent(milestones);

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
          <MilestoneFormDialog
            key={form.session}
            open={form.value !== null}
            onOpenChange={(v) => { if (!v) form.close(); }}
            onRequestOpen={() => form.open({})}
            editing={form.value?.milestone}
            revenues={revenues}
            onSave={handleSave}
          />
        )}
      </div>

      {/* Overall progress */}
      {milestones.length > 0 && (
        <div className="mb-4 space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>الإنجاز الكلي للمشروع</span>
            <span>{weightedComplete}%</span>
          </div>
          <Progress value={weightedComplete} aria-label="الإنجاز الموزون للمراحل" className="h-3" />

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
            <GanttChart milestones={milestones} onMilestoneClick={(m) => !readOnly && form.open({ milestone: m })} />
          </TabsContent>

          <TabsContent value="list">
          <div className="space-y-3">
          {sortedMilestones.map((m) => (
            <MilestoneCard
              key={m.id}
              milestone={m}
              readOnly={readOnly}
              onEdit={() => form.open({ milestone: m })}
              onDelete={() => handleDelete(m)}
              onPercentChange={(pct) => handlePercentChange(m, pct)}
            />
          ))}
          </div>
          </TabsContent>
        </Tabs>
      )}

      <InvoicePrompt revenue={invoiceFor} onClose={() => setInvoiceFor(null)} />
    </div>
  );
}
