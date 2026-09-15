/**
 * The expense form, for adding and for editing.
 *
 * The single-source rule lives here: a new expense draws from exactly one of
 * the active fund or a custody, never neither and never both, and never more
 * than that source still holds. The database enforces the same rule in its
 * triggers; the form refuses first so the user sees why.
 *
 * The section remounts this component (via `key`) on every open. An edit
 * starts from the row's values through the `useState` initialisers below,
 * and an add starts blank, so there is no reset handler. The trigger button
 * is rendered here (the responsive dialog wants it as a prop) but opening is
 * the section's call through `onRequestOpen`, so the remount happens first.
 */
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/store/useStore';
import { formatCurrency, calcVAT, addVAT, removeVAT } from '@/lib/finance';
import {
  EXPENSE_CATEGORY_LABELS, APPROVAL_STATUS_LABELS,
  type ExpenseCategory, type ApprovalStatus, type Resource, type Custody, type BudgetItem, type Expense,
} from '@/types/project';
import { getActiveFund, getFundRemaining, getCustodyBreakdown } from '@/lib/funds';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveFormDialog } from '@/components/ResponsiveFormDialog';
import { FormFooter } from '@/components/FormFooter';
import { Plus, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/utils';
import { translateDbError } from './translateDbError';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The section opens the form (and remounts it) when the trigger is pressed. */
  onRequestOpen: () => void;
  /** The row being edited; absent for a new expense. */
  editing?: Expense;
  projectId: string;
  durationMonths: number;
  expenses: Expense[];
  resources: Resource[];
  custodies: Custody[];
  budgetItems: BudgetItem[];
  taxPercent: number;
  projectStatus?: string;
  isAdmin: boolean;
}

export function ExpenseFormDialog({
  open, onOpenChange, onRequestOpen, editing, projectId, durationMonths, expenses, resources, custodies,
  budgetItems, taxPercent, projectStatus, isAdmin,
}: Props) {
  const { addExpense, updateExpense, projectFunds, acknowledgeFund, updateProject } = useStore();
  const activeFund = useMemo(
    () => getActiveFund(projectId, projectFunds),
    [projectId, projectFunds],
  );

  const editingId = editing?.id ?? null;
  const [category, setCategory] = useState<ExpenseCategory>(editing?.category ?? 'salary');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '');
  const [month, setMonth] = useState(editing ? String(editing.month) : '1');
  const [date, setDate] = useState(editing?.date ?? new Date().toISOString().split('T')[0]);
  const [responsible, setResponsible] = useState(editing?.responsible || '');
  const [resourceId, setResourceId] = useState<string>(editing?.resourceId || '');
  const [custodyId, setCustodyId] = useState<string>(editing?.custodyId || '');
  const [budgetItemId, setBudgetItemId] = useState<string>(editing?.budgetItemId || '');
  const [fundId, setFundId] = useState<string>(editing?.fundId || '');
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>(editing?.approvalStatus || 'approved');
  const [vendor, setVendor] = useState(editing?.vendor || '');
  const [invoiceRef, setInvoiceRef] = useState(editing?.invoiceRef || '');
  const [isVatExempt, setIsVatExempt] = useState(editing?.isVatExempt || false);
  const [inputInclusive, setInputInclusive] = useState(false);

  const fundIsRequired = !!activeFund;
  const [sourceMode, setSourceMode] = useState<'fund' | 'custody'>(
    editing ? (editing.custodyId ? 'custody' : 'fund') : (activeFund ? 'fund' : 'custody'),
  );
  const paymentRequests = useStore((s) => s.paymentRequests);
  const cashTransfers = useStore((s) => s.cashTransfers);
  const projPRs = useMemo(() => paymentRequests.filter((p) => p.projectId === projectId), [paymentRequests, projectId]);
  const projTransfers = useMemo(
    () => (cashTransfers || []).filter((t) => t.projectId === projectId),
    [cashTransfers, projectId],
  );
  // SSOT: رصيد العهدة = المبلغ + التحويلات الواردة − المصروف − السلف القائمة
  const activeCustodies = useMemo(
    () => custodies.filter((c) => c.status !== 'closed'),
    [custodies],
  );
  const custodyBreakdowns = useMemo(
    () => new Map(custodies.map((c) => [c.id, getCustodyBreakdown(c, expenses, projTransfers, projPRs)])),
    [custodies, expenses, projTransfers, projPRs],
  );
  const custodyRemainingOf = (id: string) => custodyBreakdowns.get(id)?.remaining ?? 0;

  const activeFundRemaining = activeFund
    ? getFundRemaining(activeFund, expenses, custodies, projPRs, projTransfers)
    : 0;

  const matchingBudgetItems = budgetItems.filter(b => b.category === category);

  const hasCustody = !!(custodyId && custodyId !== 'none');

  // Auto-fill fundId for NEW expense ONLY when the source mode is "fund".
  // Single-source rule: custody-backed expense MUST NOT also link to a fund.
  useEffect(() => {
    if (open && !editingId && activeFund && sourceMode === 'fund') {
      setFundId((prev) => prev || activeFund.id);
    }
    if (sourceMode === 'custody') setFundId('');
  }, [open, editingId, activeFund, sourceMode]);


  const handleInlineAcknowledge = async () => {
    if (!activeFund || activeFund.status !== 'transferred') return;
    try {
      await acknowledgeFund(activeFund.id);
      toast.success('تم إقرار استلام الدفعة');
    } catch (err) {
      toast.error(errorMessage(err, 'تعذّر إقرار الاستلام'));
    }
  };

  // Block submit only if fund is required (no custody) AND fund still 'transferred'
  const fundBlocksSubmit = !editingId && !!activeFund && activeFund.status === 'transferred' && !hasCustody;

  const handleSubmit = async () => {
    if (!description.trim() || !amount) return;
    if (fundBlocksSubmit) {
      toast.error(`الدفعة #${activeFund!.fundNumber} لم يُقَرّ باستلامها بعد. اضغط "إقرار الاستلام" أعلى النموذج.`);
      return;
    }
    const rawAmount = parseFloat(amount);
    const finalAmount = (inputInclusive && !isVatExempt) ? removeVAT(rawAmount, taxPercent) : rawAmount;

    // Single-source: custody wins. Otherwise pick chosen fund or active fund.
    const effectiveFundId = hasCustody
      ? undefined
      : (fundId && fundId !== 'none'
          ? fundId
          : (fundIsRequired && !editingId ? activeFund?.id : undefined));
    if (fundIsRequired && !editingId && !hasCustody && !effectiveFundId) {
      toast.error('يجب ربط المصروف بالدفعة النشطة أو اختيار عهدة');
      return;
    }
    // قاعدة المصدر الواحد: مصدر واحد إلزامي — لا بدون مصدر ولا الاثنين معاً
    if (!editingId && !hasCustody && !effectiveFundId) {
      toast.error('يجب اختيار مصدر الصرف: دفعة أو عهدة.');
      return;
    }
    if (hasCustody && fundId && fundId !== 'none') {
      toast.error('لا يمكن ربط المصروف بعهدة ودفعة في آن واحد. اختر مصدراً واحداً فقط.');
      return;
    }

    // Hard UI guard: overflow on custody — guide user to split instead of silent DB fail
    if (!editingId && hasCustody) {
      const remaining = custodyRemainingOf(custodyId);
      if (finalAmount > remaining) {
        toast.error(
          `المبلغ (${formatCurrency(finalAmount)}) يتجاوز المتبقي في العهدة (${formatCurrency(remaining)}). قسّم المصروف لجزأين: الأول من هذه العهدة بالمبلغ المتاح، والباقي من عهدة/دفعة أخرى.`,
          { duration: 8000 },
        );
        return;
      }
    }

    // Hard UI guard: overflow on fund (when not via custody)
    if (!editingId && !hasCustody && effectiveFundId) {
      if (effectiveFundId === activeFund?.id && finalAmount > activeFundRemaining) {
        toast.error(
          `المبلغ (${formatCurrency(finalAmount)}) يتجاوز المتبقي في الدفعة #${activeFund!.fundNumber} (${formatCurrency(activeFundRemaining)}). قسّم المصروف، أو سجّل دفعة جديدة، أو حرّر سلفة قائمة.`,
          { duration: 8000 },
        );
        return;
      }
    }


    try {
      if (editingId) {
        await updateExpense(editingId, {
          category,
          description: description.trim(),
          amount: finalAmount,
          date,
          month: parseInt(month),
          responsible: responsible.trim() || undefined,
          resourceId: resourceId && resourceId !== 'none' ? resourceId : null,
          custodyId: custodyId && custodyId !== 'none' ? custodyId : null,
          budgetItemId: budgetItemId && budgetItemId !== 'none' ? budgetItemId : null,
          approvalStatus,
          vendor: vendor.trim() || undefined,
          invoiceRef: invoiceRef.trim() || undefined,
          isVatExempt,
          fundId: effectiveFundId,
        });
        toast.success('تم تعديل المصروف');
      } else {
        await addExpense({
          projectId,
          category,
          description: description.trim(),
          amount: finalAmount,
          date,
          month: parseInt(month),
          responsible: responsible.trim() || undefined,
          resourceId: resourceId && resourceId !== 'none' ? resourceId : undefined,
          custodyId: custodyId && custodyId !== 'none' ? custodyId : undefined,
          budgetItemId: budgetItemId && budgetItemId !== 'none' ? budgetItemId : undefined,
          approvalStatus,
          vendor: vendor.trim() || undefined,
          invoiceRef: invoiceRef.trim() || undefined,
          isVatExempt,
          fundId: effectiveFundId,
        });
        toast.success('تمت إضافة المصروف');

        // Auto-activate project on first expense
        if (projectStatus && ['planning', 'approved', 'pending_approval'].includes(projectStatus)) {
          await updateProject(projectId, { status: 'active' });
          toast.info('المشروع تحوّل لحالة "نشط" تلقائياً');
        }
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(translateDbError(errorMessage(err, '')) || 'تعذّر حفظ المصروف');
      return;
    }
  };

  return (
    <ResponsiveFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editingId ? 'تعديل المصروف' : 'إضافة مصروف جديد'}
      trigger={<Button size="sm" className="gap-1.5" onClick={onRequestOpen}><Plus className="w-3.5 h-3.5" />إضافة مصروف</Button>}
      footer={<FormFooter onCancel={() => onOpenChange(false)} onSubmit={handleSubmit} submitLabel={editingId ? 'حفظ التعديلات' : 'إضافة'} submitDisabled={fundBlocksSubmit} />}
    >
      <div className="space-y-4">
          <div className="space-y-2">
            <Label>الفئة</Label>
            <Select value={category} onValueChange={(v) => { setCategory(v as ExpenseCategory); setBudgetItemId(''); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!editingId && matchingBudgetItems.length > 0 && (
            <div className="space-y-2">
              <Label>ربط ببند الموازنة <span className="text-muted-foreground text-xs">(مهم للتتبع)</span></Label>
              <Select value={budgetItemId} onValueChange={setBudgetItemId}>
                <SelectTrigger><SelectValue placeholder="اختر بند الموازنة" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون ربط</SelectItem>
                  {matchingBudgetItems.map((b) => {
                    const spent = expenses.filter((e) => e.budgetItemId === b.id && e.approvalStatus !== 'rejected').reduce((s, e) => s + e.amount, 0);
                    return (
                      <SelectItem key={b.id} value={b.id}>{b.description} — متبقي: {formatCurrency(b.plannedAmount - spent)}</SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}
          {/* مصدر الصرف — قاعدة المصدر الواحد: دفعة أو عهدة، واحدة فقط */}
          {!editingId && (activeFund || activeCustodies.length > 0) && (
            <div className="space-y-3 p-3 rounded-lg border border-amber-300/50 bg-amber-50/50 dark:bg-amber-900/10 dark:border-amber-700/30">
              <Label className="flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5" />
                مصدر الصرف
                <span className="text-destructive text-xs">*</span>
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button" size="sm"
                  variant={sourceMode === 'fund' ? 'default' : 'outline'}
                  disabled={!activeFund}
                  onClick={() => { setSourceMode('fund'); setCustodyId(''); setFundId(activeFund?.id || ''); }}
                >
                  من الدفعة
                </Button>
                <Button
                  type="button" size="sm"
                  variant={sourceMode === 'custody' ? 'default' : 'outline'}
                  disabled={activeCustodies.length === 0}
                  onClick={() => { setSourceMode('custody'); setFundId(''); }}
                >
                  من العهدة
                </Button>
              </div>

              {sourceMode === 'fund' && activeFund && (
                <div className="space-y-2">
                  {activeFund.status === 'transferred' && (
                    <div className="flex items-start justify-between gap-2 p-2 rounded bg-background border border-border">
                      <div className="text-xs">
                        <p className="font-semibold">الدفعة #{activeFund.fundNumber} — قيد التحويل</p>
                        <p className="text-muted-foreground mt-0.5">
                          يجب إقرار الاستلام قبل الصرف منها.
                        </p>
                      </div>
                      {isAdmin && (
                        <Button type="button" size="sm" variant="outline" onClick={handleInlineAcknowledge}>
                          إقرار الاستلام
                        </Button>
                      )}
                    </div>
                  )}
                  <Select value={fundId || activeFund.id} onValueChange={setFundId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={activeFund.id}>
                        الدفعة #{activeFund.fundNumber} — متبقي: {formatCurrency(activeFundRemaining)}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {parseFloat(amount) > 0 && parseFloat(amount) > activeFundRemaining && (
                    <p className="text-xs text-destructive">
                      ⚠️ المبلغ يتجاوز رصيد الدفعة المتبقي — سيُرفض من النظام
                    </p>
                  )}
                </div>
              )}

              {sourceMode === 'custody' && (
                <div className="space-y-2">
                  <Select value={custodyId} onValueChange={setCustodyId}>
                    <SelectTrigger><SelectValue placeholder="اختر العهدة" /></SelectTrigger>
                    <SelectContent>
                      {activeCustodies.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.resourceName} — متبقي: {formatCurrency(custodyRemainingOf(c.id))}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {hasCustody && (() => {
                    const b = custodyBreakdowns.get(custodyId);
                    if (!b) return null;
                    const parsedAmount = parseFloat(amount) || 0;
                    return (
                      <div className="space-y-1 text-xs">
                        <p className="text-muted-foreground">
                          العهدة: {formatCurrency(b.baseAmount)}
                          {b.transfersIn > 0 && ` + تحويلات واردة: ${formatCurrency(b.transfersIn)}`}
                          {' '}− مصروف: {formatCurrency(b.spent)}
                          {b.outstandingAdvances > 0 && ` − سلف قائمة: ${formatCurrency(b.outstandingAdvances)}`}
                        </p>
                        <p className={b.remaining > 0 ? 'font-semibold' : 'text-destructive font-semibold'}>
                          المتبقي: {formatCurrency(b.remaining)}
                          {b.remaining <= 0 && ' ⚠️ العهدة مستنفدة'}
                        </p>
                        {parsedAmount > 0 && parsedAmount > b.remaining && (
                          <p className="text-destructive">
                            ⚠️ المبلغ ({formatCurrency(parsedAmount)}) يتجاوز المتبقي ({formatCurrency(b.remaining)}).
                            قسّم المصروف: {formatCurrency(b.remaining)} من هذه العهدة، والباقي من عهدة/دفعة أخرى.
                          </p>
                        )}
                        <p className="text-muted-foreground">
                          سيُخصم من العهدة فقط ولن يُخصم من الدفعة مرة أخرى (مبلغ العهدة محجوز مسبقاً).
                        </p>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>الوصف</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="مثال: راتب شهر يناير — أحمد" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>المبلغ</Label>
              <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-2">
              <Label>الشهر</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: durationMonths }, (_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>شهر {i + 1}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* VAT controls */}
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={isVatExempt} onChange={(e) => { setIsVatExempt(e.target.checked); if (e.target.checked) setInputInclusive(false); }} className="rounded" />
              معفى من الضريبة
            </label>
            {!isVatExempt && (
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={inputInclusive} onChange={(e) => setInputInclusive(e.target.checked)} className="rounded" />
                المبلغ شامل الضريبة
              </label>
            )}
          </div>
          {parseFloat(amount) > 0 && !isVatExempt && taxPercent > 0 && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
              {inputInclusive
                ? `بدون ضريبة: ${formatCurrency(removeVAT(parseFloat(amount), taxPercent))} · الضريبة: ${formatCurrency(parseFloat(amount) - removeVAT(parseFloat(amount), taxPercent))}`
                : `شامل الضريبة: ${formatCurrency(addVAT(parseFloat(amount), taxPercent))} · الضريبة: ${formatCurrency(calcVAT(parseFloat(amount), taxPercent))}`
              }
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>التاريخ</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>المسؤول</Label>
              <Input value={responsible} onChange={(e) => setResponsible(e.target.value)} placeholder="اختياري" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>المورّد</Label>
              <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="اختياري" />
            </div>
            <div className="space-y-2">
              <Label>مرجع الفاتورة</Label>
              <Input value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} placeholder="اختياري" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>حالة الاعتماد</Label>
            <Select value={approvalStatus} onValueChange={(v) => setApprovalStatus(v as ApprovalStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(APPROVAL_STATUS_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!editingId && resources.length > 0 && (
            <div className="space-y-2">
              <Label>المورد (اختياري)</Label>
              <Select value={resourceId} onValueChange={setResourceId}>
                <SelectTrigger><SelectValue placeholder="اختر المورد" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون مورد</SelectItem>
                  {resources.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name} {r.role ? `(${r.role})` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
      </div>
    </ResponsiveFormDialog>
  );
}
