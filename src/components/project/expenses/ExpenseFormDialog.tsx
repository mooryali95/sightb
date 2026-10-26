/**
 * The expense form, for adding and for editing.
 *
 * The single-source rule lives in expenseSource.ts: a new expense draws from
 * exactly one of the active fund or a custody, never neither and never both,
 * and never more than that source still holds. The database enforces the
 * same rule in its triggers; the form refuses first so the user sees why.
 *
 * The section remounts this component (via `key`) on every open. An edit
 * starts from the row's values through the `useState` initialisers below,
 * and an add starts blank, so there is no reset handler. The trigger button
 * is rendered here (the responsive dialog wants it as a prop) but opening is
 * the section's call through `onRequestOpen`, so the remount happens first.
 */
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/store/useStore';
import { RegistryNamePicker } from '@/components/registry/RegistryNamePicker';
import { formatCurrency } from '@/lib/finance';
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
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/utils';
import { translateDbError } from './translateDbError';
import { bookedAmount, budgetItemRemaining, chosen, fundBlocksSubmit, resolveExpenseSource } from './expenseSource';
import { SourcePicker, type SourceMode } from './SourcePicker';
import { VatControls } from './VatControls';

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
  const activeFund = useMemo(() => getActiveFund(projectId, projectFunds), [projectId, projectFunds]);

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
  const [partyId, setPartyId] = useState<string | undefined>(editing?.partyId);
  const companyId = useStore((s) => s.projects.find((p) => p.id === projectId)?.companyId);
  const [invoiceRef, setInvoiceRef] = useState(editing?.invoiceRef || '');
  const [isVatExempt, setIsVatExempt] = useState(editing?.isVatExempt || false);
  const [inputInclusive, setInputInclusive] = useState(false);
  const [sourceMode, setSourceMode] = useState<SourceMode>(
    editing ? (editing.custodyId ? 'custody' : 'fund') : (activeFund ? 'fund' : 'custody'),
  );

  const paymentRequests = useStore((s) => s.paymentRequests);
  const cashTransfers = useStore((s) => s.cashTransfers);
  const projPRs = useMemo(() => paymentRequests.filter((p) => p.projectId === projectId), [paymentRequests, projectId]);
  const projTransfers = useMemo(() => (cashTransfers || []).filter((t) => t.projectId === projectId), [cashTransfers, projectId]);
  // SSOT: رصيد العهدة = المبلغ + التحويلات الواردة − المصروف − السلف القائمة
  const activeCustodies = useMemo(() => custodies.filter((c) => c.status !== 'closed'), [custodies]);
  const custodyBreakdowns = useMemo(
    () => new Map(custodies.map((c) => [c.id, getCustodyBreakdown(c, expenses, projTransfers, projPRs)])),
    [custodies, expenses, projTransfers, projPRs],
  );
  const activeFundRemaining = activeFund ? getFundRemaining(activeFund, expenses, custodies, projPRs, projTransfers) : 0;
  const matchingBudgetItems = budgetItems.filter((b) => b.category === category);
  const parsedAmount = parseFloat(amount) || 0;

  // Auto-fill fundId for NEW expense ONLY when the source mode is "fund".
  // Single-source rule: custody-backed expense MUST NOT also link to a fund.
  useEffect(() => {
    if (open && !editingId && activeFund && sourceMode === 'fund') {
      setFundId((prev) => prev || activeFund.id);
    }
    if (sourceMode === 'custody') setFundId('');
  }, [open, editingId, activeFund, sourceMode]);

  const changeSourceMode = (mode: SourceMode) => {
    setSourceMode(mode);
    if (mode === 'fund') { setCustodyId(''); setFundId(activeFund?.id || ''); }
    else setFundId('');
  };

  const handleInlineAcknowledge = async () => {
    if (!activeFund || activeFund.status !== 'transferred') return;
    try {
      await acknowledgeFund(activeFund.id);
      toast.success('تم إقرار استلام الدفعة');
    } catch (err) {
      toast.error(errorMessage(err, 'تعذّر إقرار الاستلام'));
    }
  };

  const submitHeld = fundBlocksSubmit(!!editingId, activeFund, custodyId);

  const handleSubmit = async () => {
    if (!description.trim() || !amount) return;
    const finalAmount = bookedAmount(parseFloat(amount), inputInclusive, isVatExempt, taxPercent);
    const source = resolveExpenseSource({
      editing: !!editingId, activeFund, fundId, custodyId, amount: finalAmount, activeFundRemaining,
      custodyRemaining: (id) => custodyBreakdowns.get(id)?.remaining ?? 0,
    });
    if (source.error) {
      if (source.long) toast.error(source.error, { duration: 8000 });
      else toast.error(source.error);
      return;
    }

    const fields = {
      category,
      description: description.trim(),
      amount: finalAmount,
      date,
      month: parseInt(month),
      responsible: responsible.trim() || undefined,
      approvalStatus,
      vendor: vendor.trim() || undefined,
      // Only sent once someone picked or cleared a registry link, so a database
      // without the registry never sees the column.
      ...(partyId !== editing?.partyId ? { partyId: partyId ?? '' } : {}),
      invoiceRef: invoiceRef.trim() || undefined,
      isVatExempt,
      fundId: source.effectiveFundId,
    };
    try {
      if (editingId) {
        await updateExpense(editingId, {
          ...fields,
          resourceId: chosen(resourceId) ?? null,
          custodyId: source.custodyId ?? null,
          budgetItemId: chosen(budgetItemId) ?? null,
        });
        toast.success('تم تعديل المصروف');
      } else {
        await addExpense({
          projectId,
          ...fields,
          resourceId: chosen(resourceId),
          custodyId: source.custodyId,
          budgetItemId: chosen(budgetItemId),
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
    }
  };

  return (
    <ResponsiveFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editingId ? 'تعديل المصروف' : 'إضافة مصروف جديد'}
      trigger={<Button size="sm" className="gap-1.5" onClick={onRequestOpen}><Plus className="w-3.5 h-3.5" />إضافة مصروف</Button>}
      footer={<FormFooter onCancel={() => onOpenChange(false)} onSubmit={handleSubmit} submitLabel={editingId ? 'حفظ التعديلات' : 'إضافة'} submitDisabled={submitHeld} />}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>الفئة</Label>
          <Select value={category} onValueChange={(v) => { setCategory(v as ExpenseCategory); setBudgetItemId(''); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
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
                {matchingBudgetItems.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.description} — متبقي: {formatCurrency(budgetItemRemaining(b, expenses))}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {/* مصدر الصرف — قاعدة المصدر الواحد: دفعة أو عهدة، واحدة فقط */}
        {!editingId && (activeFund || activeCustodies.length > 0) && (
          <SourcePicker
            mode={sourceMode}
            onModeChange={changeSourceMode}
            activeFund={activeFund}
            activeFundRemaining={activeFundRemaining}
            fundId={fundId}
            onFundChange={setFundId}
            custodies={activeCustodies}
            custodyId={custodyId}
            onCustodyChange={setCustodyId}
            breakdownOf={(id) => custodyBreakdowns.get(id)}
            amount={parsedAmount}
            isAdmin={isAdmin}
            onAcknowledge={handleInlineAcknowledge}
          />
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
                {Array.from({ length: durationMonths }, (_, i) => <SelectItem key={i + 1} value={String(i + 1)}>شهر {i + 1}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <VatControls
          amount={parsedAmount}
          taxPercent={taxPercent}
          isVatExempt={isVatExempt}
          onExemptChange={(exempt) => { setIsVatExempt(exempt); if (exempt) setInputInclusive(false); }}
          inputInclusive={inputInclusive}
          onInclusiveChange={setInputInclusive}
        />

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
            <Label htmlFor="expense-vendor">المورّد</Label>
            <RegistryNamePicker id="expense-vendor" ariaLabel="المورّد" companyId={companyId} value={{ text: vendor, partyId }}
              onChange={(v) => { setVendor(v.text); setPartyId(v.partyId); }} />
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
              {Object.entries(APPROVAL_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
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
                {resources.map((r) => <SelectItem key={r.id} value={r.id}>{r.name} {r.role ? `(${r.role})` : ''}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </ResponsiveFormDialog>
  );
}
