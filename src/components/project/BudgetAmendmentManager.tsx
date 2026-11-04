/**
 * The amendment card of a locked budget: open it with a reason (a snapshot
 * is taken), approve or cancel the open draft, and the history with each
 * approved amendment's comparison. The dialog, the history and the
 * comparison live under amendments/.
 */
import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Unlock, CheckCircle2, X, FileEdit } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/finance';
import type { BudgetAmendment } from '@/types/project';
import { OpenAmendmentDialog } from './amendments/OpenAmendmentDialog';
import { AmendmentHistory } from './amendments/AmendmentHistory';

interface BudgetAmendmentManagerProps {
  projectId: string;
  baselineLocked: boolean;
  readOnly?: boolean;
  /** يُستدعى عند فتح/إلغاء/اعتماد التعديل لتحديث حالة UI الأب */
  onAmendmentChange?: (activeDraft: BudgetAmendment | null) => void;
}

export function BudgetAmendmentManager({
  projectId, baselineLocked, readOnly = false, onAmendmentChange,
}: BudgetAmendmentManagerProps) {
  const {
    budgetAmendments, cancelBudgetAmendment, approveBudgetAmendment, loadBudgetAmendments,
  } = useStore();

  const [submitting, setSubmitting] = useState(false);

  const projectAmendments = budgetAmendments.filter((a) => a.projectId === projectId);
  const activeDraft = projectAmendments.find((a) => a.status === 'draft');
  const history = projectAmendments.filter((a) => a.status !== 'draft');

  useEffect(() => {
    loadBudgetAmendments(projectId).catch((err) => console.error('[load-amendments]', err));
  }, [projectId, loadBudgetAmendments]);

  useEffect(() => {
    onAmendmentChange?.(activeDraft || null);
    // Narrowed to the draft's identity and status on purpose. `activeDraft` is
    // derived by `.find()` on every render, and `onAmendmentChange` is a parent
    // callback that is not memoized — depending on either would notify the
    // parent on every render, and the parent re-renders in response.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDraft?.id, activeDraft?.status]);

  const handleApprove = async () => {
    if (!activeDraft) return;
    setSubmitting(true);
    try {
      await approveBudgetAmendment(activeDraft.id);
      toast.success('✅ تم اعتماد التعديل وحفظ لقطة بعد التعديل للمقارنة');
    } catch (err) {
      console.error('[approve-amendment]', err);
      toast.error('فشل اعتماد التعديل');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!activeDraft) return;
    setSubmitting(true);
    try {
      await cancelBudgetAmendment(activeDraft.id);
      toast.info('تم إلغاء التعديل — الموازنة مقفلة كما كانت');
    } catch (err) {
      console.error('[cancel-amendment]', err);
      toast.error('فشل إلغاء التعديل');
    } finally {
      setSubmitting(false);
    }
  };

  // Don't show anything if budget is not locked or in read-only
  if (readOnly) return null;
  if (!baselineLocked && history.length === 0 && !activeDraft) return null;

  return (
    <div className="stat-card border-primary/30">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <FileEdit className="w-4 h-4 text-primary" />
            تعديل الموازنة المقفلة
          </h3>
          {activeDraft ? (
            <div className="mt-2 space-y-1">
              <p className="text-xs text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1.5">
                <Unlock className="w-3.5 h-3.5" />
                الموازنة مفتوحة للتعديل الآن
              </p>
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold">السبب:</span> {activeDraft.reason}
              </p>
              <p className="text-xs text-muted-foreground">
                لقطة قبل: <span className="font-mono">{formatCurrency(activeDraft.totalBefore)}</span>
                {' · '}
                {activeDraft.snapshotBefore.length} بند
              </p>
            </div>
          ) : baselineLocked ? (
            <p className="text-xs text-muted-foreground mt-1">
              الموازنة مقفلة بخط الأساس. لإجراء تعديل، افتح الموازنة وستُحفظ لقطة قبل وبعد التعديل تلقائياً للمقارنة.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">
              سجل تعديلات الموازنة السابقة
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {activeDraft ? (
            <>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" disabled={submitting} className="gap-1.5">
                    <X className="w-3.5 h-3.5" /> إلغاء التعديل
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>إلغاء تعديل الموازنة؟</AlertDialogTitle>
                    <AlertDialogDescription>
                      سيتم إغلاق الموازنة دون اعتماد أي تغييرات. <br />
                      <span className="text-warning dark:text-amber-400 font-medium">
                        ملاحظة: التغييرات التي أجريتها على بنود الموازنة في قاعدة البيانات لن تُسترجع تلقائياً، 
                        لكن لقطة "قبل التعديل" محفوظة ويمكنك الرجوع لها يدوياً.
                      </span>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>تراجع</AlertDialogCancel>
                    <AlertDialogAction onClick={handleCancel}>تأكيد الإلغاء</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Button size="sm" onClick={handleApprove} disabled={submitting} className="gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> اعتماد التعديل
              </Button>
            </>
          ) : (
            baselineLocked && <OpenAmendmentDialog projectId={projectId} />
          )}
        </div>
      </div>

      <AmendmentHistory history={history} />
    </div>
  );
}
