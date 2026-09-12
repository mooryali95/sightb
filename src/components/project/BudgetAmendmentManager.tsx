import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Unlock, Lock, CheckCircle2, X, History, ArrowLeftRight, FileEdit } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/finance';
import {
  BUDGET_AMENDMENT_STATUS_LABELS, BUDGET_AMENDMENT_STATUS_COLORS,
  EXPENSE_CATEGORY_LABELS, type BudgetAmendment, type BudgetAmendmentSnapshotItem,
  type ExpenseCategory,
} from '@/types/project';

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
    budgetAmendments, openBudgetAmendment, cancelBudgetAmendment,
    approveBudgetAmendment, loadBudgetAmendments,
  } = useStore();

  const [openDialog, setOpenDialog] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [comparisonOpen, setComparisonOpen] = useState<BudgetAmendment | null>(null);

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

  const handleOpen = async () => {
    if (!reason.trim()) {
      toast.error('يرجى كتابة سبب التعديل');
      return;
    }
    setSubmitting(true);
    try {
      await openBudgetAmendment(projectId, reason);
      toast.success('🔓 تم فتح الموازنة للتعديل — أُخذت لقطة قبل التعديل');
      setReason('');
      setOpenDialog(false);
    } catch (err) {
      console.error('[open-amendment]', err);
      toast.error('فشل فتح الموازنة، حاول مرة أخرى');
    } finally {
      setSubmitting(false);
    }
  };

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
                      <span className="text-amber-600 dark:text-amber-400 font-medium">
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
            baselineLocked && (
              <Dialog open={openDialog} onOpenChange={setOpenDialog}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-1.5">
                    <Unlock className="w-3.5 h-3.5" /> فتح الموازنة للتعديل
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>فتح الموازنة للتعديل</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-2">
                    <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700/50">
                      <p className="text-xs text-amber-800 dark:text-amber-200">
                        🔒 الموازنة حالياً مقفلة بخط الأساس.
                      </p>
                      <ul className="text-xs text-amber-700 dark:text-amber-300 mt-2 space-y-1 list-disc pr-4">
                        <li>سيتم أخذ لقطة (snapshot) للوضع الحالي قبل التعديل</li>
                        <li>ستتمكن من إضافة/تعديل/حذف البنود مؤقتاً</li>
                        <li>عند الاعتماد، تُحفظ لقطة بعد التعديل للمقارنة المستقبلية</li>
                      </ul>
                    </div>
                    <div className="space-y-2">
                      <Label>سبب التعديل <span className="text-destructive">*</span></Label>
                      <Textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="مثال: تصحيح خطأ في تقدير تكلفة الموارد البشرية، أو إعادة توزيع الموازنة بناءً على تغير المتطلبات..."
                        rows={3}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setOpenDialog(false)}>إلغاء</Button>
                    <Button onClick={handleOpen} disabled={submitting || !reason.trim()}>
                      {submitting ? 'جاري الفتح...' : 'فتح الموازنة'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )
          )}
        </div>
      </div>

      {/* History list */}
      {history.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border">
          <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-muted-foreground" />
            سجل التعديلات ({history.length})
          </h4>
          <div className="space-y-1.5">
            {history.map((a) => {
              const delta = (a.totalAfter ?? 0) - a.totalBefore;
              return (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-2 p-2 rounded-lg border border-border bg-muted/30 text-xs"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${BUDGET_AMENDMENT_STATUS_COLORS[a.status]}`}>
                        {BUDGET_AMENDMENT_STATUS_LABELS[a.status]}
                      </span>
                      <span className="text-muted-foreground">
                        {new Date(a.createdAt).toLocaleDateString('ar-SA', {
                          calendar: 'gregory', year: 'numeric', month: 'short', day: 'numeric',
                        })}
                      </span>
                      {a.status === 'approved' && (
                        <span className={`font-mono ${delta >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                          {delta >= 0 ? '+' : ''}{formatCurrency(delta)}
                        </span>
                      )}
                    </div>
                    <p className="truncate mt-0.5">{a.reason}</p>
                  </div>
                  {a.status === 'approved' && a.snapshotAfter && (
                    <Button
                      size="sm" variant="ghost"
                      className="h-7 px-2 gap-1 shrink-0"
                      onClick={() => setComparisonOpen(a)}
                    >
                      <ArrowLeftRight className="w-3 h-3" /> مقارنة
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Comparison dialog */}
      <Dialog open={!!comparisonOpen} onOpenChange={(v) => !v && setComparisonOpen(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>مقارنة الموازنة قبل وبعد التعديل</DialogTitle>
          </DialogHeader>
          {comparisonOpen && <ComparisonView amendment={comparisonOpen} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ComparisonView({ amendment }: { amendment: BudgetAmendment }) {
  const before = amendment.snapshotBefore;
  const after = amendment.snapshotAfter || [];
  const delta = (amendment.totalAfter ?? 0) - amendment.totalBefore;

  // Build comparison rows by item id
  const beforeMap = new Map(before.map((b) => [b.id || `${b.category}-${b.description}`, b]));
  const afterMap = new Map(after.map((a) => [a.id || `${a.category}-${a.description}`, a]));
  const allKeys = new Set<string>([...beforeMap.keys(), ...afterMap.keys()]);

  const rows: Array<{
    key: string; before?: BudgetAmendmentSnapshotItem; after?: BudgetAmendmentSnapshotItem;
    type: 'unchanged' | 'modified' | 'added' | 'removed';
  }> = [];
  for (const k of allKeys) {
    const b = beforeMap.get(k);
    const a = afterMap.get(k);
    let type: 'unchanged' | 'modified' | 'added' | 'removed' = 'unchanged';
    if (b && !a) type = 'removed';
    else if (!b && a) type = 'added';
    // A move to another category is a change too, even at the same amount.
    else if (b && a && (b.plannedAmount !== a.plannedAmount || b.description !== a.description || b.category !== a.category)) type = 'modified';
    rows.push({ key: k, before: b, after: a, type });
  }
  rows.sort((x, y) => {
    const order = { added: 0, modified: 1, removed: 2, unchanged: 3 };
    return order[x.type] - order[y.type];
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-lg border border-border bg-muted/30 text-center">
          <p className="text-xs text-muted-foreground">قبل التعديل</p>
          <p className="text-sm font-mono font-bold mt-1">{formatCurrency(amendment.totalBefore)}</p>
          <p className="text-[10px] text-muted-foreground">{before.length} بند</p>
        </div>
        <div className="p-3 rounded-lg border border-border bg-muted/30 text-center">
          <p className="text-xs text-muted-foreground">بعد التعديل</p>
          <p className="text-sm font-mono font-bold mt-1">{formatCurrency(amendment.totalAfter ?? 0)}</p>
          <p className="text-[10px] text-muted-foreground">{after.length} بند</p>
        </div>
        <div className="p-3 rounded-lg border border-border bg-muted/30 text-center">
          <p className="text-xs text-muted-foreground">الفرق</p>
          <p className={`text-sm font-mono font-bold mt-1 ${delta >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
            {delta >= 0 ? '+' : ''}{formatCurrency(delta)}
          </p>
        </div>
      </div>

      <div className="space-y-1 text-xs">
        <p><span className="font-semibold">السبب:</span> {amendment.reason}</p>
        {amendment.approvedAt && (
          <p className="text-muted-foreground">
            اعتُمد في: {new Date(amendment.approvedAt).toLocaleString('ar-SA', {
              calendar: 'gregory', year: 'numeric', month: 'short', day: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </p>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>الحالة</th>
              <th>الفئة</th>
              <th>الوصف</th>
              <th>قبل</th>
              <th>بعد</th>
              <th>الفرق</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const beforeAmt = r.before?.plannedAmount ?? 0;
              const afterAmt = r.after?.plannedAmount ?? 0;
              const diff = afterAmt - beforeAmt;
              const item = r.after || r.before;
              const badgeClass =
                r.type === 'added' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' :
                r.type === 'removed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                r.type === 'modified' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' :
                'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
              const label = r.type === 'added' ? 'مُضاف' : r.type === 'removed' ? 'محذوف' : r.type === 'modified' ? 'مُعدّل' : '—';
              return (
                <tr key={r.key} className={r.type === 'unchanged' ? 'opacity-60' : ''}>
                  <td><span className={`text-[10px] px-1.5 py-0.5 rounded-full ${badgeClass}`}>{label}</span></td>
                  <td className="text-xs">{EXPENSE_CATEGORY_LABELS[item?.category as ExpenseCategory] || item?.category}</td>
                  <td className="text-xs">{item?.description}</td>
                  <td className="font-mono text-xs">{r.before ? formatCurrency(beforeAmt) : '—'}</td>
                  <td className="font-mono text-xs">{r.after ? formatCurrency(afterAmt) : '—'}</td>
                  <td className={`font-mono text-xs ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {diff !== 0 ? `${diff > 0 ? '+' : ''}${formatCurrency(diff)}` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
