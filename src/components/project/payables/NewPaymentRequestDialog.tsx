/**
 * The new-payment-request dialog.
 *
 * Lifted out of the section with its eight pieces of form state, which
 * nothing outside the dialog ever read. It is mounted at section level, not
 * inside the requests tab panel, because the balances table above the tabs
 * opens it too and Radix unmounts an inactive panel.
 *
 * There is no reset handler: the section remounts this component (via `key`)
 * each time it opens, so a preset from the balances table always lands on a
 * clean form and closing discards whatever was typed.
 */
import { useMemo, useState } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/finance';
import { errorMessage } from '@/lib/utils';
import {
  EXPENSE_CATEGORY_LABELS,
  PAYMENT_PRIORITY_LABELS,
  PAYMENT_REQUEST_TYPE_LABELS,
  type BudgetItem,
  type ExpenseCategory,
  type PaymentPriority,
  type PaymentRequestType,
  type Resource,
  type ResourceReimbursement,
} from '@/types/project';

/** What the balances table pre-fills when it opens the dialog for one resource. */
export interface NewPaymentRequestPreset {
  resourceId: string;
  selectedReimbIds: string[];
  description: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projResources: Resource[];
  projReimbs: ResourceReimbursement[];
  projBudgetItems: BudgetItem[];
  preset?: NewPaymentRequestPreset;
}

export function NewPaymentRequestDialog({
  open, onOpenChange, projectId, projResources, projReimbs, projBudgetItems, preset,
}: Props) {
  const { createPaymentRequest, submitPaymentRequest } = useStore();

  const [pResourceId, setPResourceId] = useState(preset?.resourceId ?? '');
  const [pType, setPType] = useState<PaymentRequestType>('reimbursement');
  const [pAmount, setPAmount] = useState('');
  const [pDescription, setPDescription] = useState(preset?.description ?? '');
  const [pJustification, setPJustification] = useState('');
  const [pPriority, setPPriority] = useState<PaymentPriority>('normal');
  const [pSelectedReimbs, setPSelectedReimbs] = useState<string[]>(preset?.selectedReimbIds ?? []);
  const [pBudgetItemId, setPBudgetItemId] = useState<string>('');

  const eligibleReimbs = useMemo(
    () => projReimbs.filter(
      (r) => r.resourceId === pResourceId && r.status === 'approved',
    ),
    [projReimbs, pResourceId],
  );

  const computedAmount = useMemo(() => {
    if (pType !== 'reimbursement') return 0;
    return eligibleReimbs
      .filter((r) => pSelectedReimbs.includes(r.id))
      .reduce((s, r) => s + r.amount, 0);
  }, [pType, eligibleReimbs, pSelectedReimbs]);

  const handleCreateReq = async () => {
    if (!pResourceId || !pDescription.trim()) {
      toast.error('يرجى تعبئة الحقول المطلوبة'); return;
    }
    const finalAmount = pType === 'reimbursement' ? computedAmount : parseFloat(pAmount || '0');
    if (finalAmount <= 0) {
      toast.error('المبلغ يجب أن يكون أكبر من صفر'); return;
    }
    try {
      const id = await createPaymentRequest({
        projectId, resourceId: pResourceId, requestType: pType,
        amount: finalAmount, description: pDescription,
        justification: pJustification, priority: pPriority,
        linkedReimbursementIds: pType === 'reimbursement' ? pSelectedReimbs : [],
        budgetItemId: pBudgetItemId || undefined,
      });
      // Auto-submit if user wants? For now keep as draft, then submit
      await submitPaymentRequest(id);
      toast.success('تم إنشاء وإرسال طلب الصرف');
      onOpenChange(false);
    } catch (e) { toast.error(errorMessage(e)); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>طلب صرف دفعة جديدة</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>المورد *</Label>
              <Select value={pResourceId} onValueChange={(v) => { setPResourceId(v); setPSelectedReimbs([]); }}>
                <SelectTrigger><SelectValue placeholder="اختر المورد" /></SelectTrigger>
                <SelectContent>
                  {projResources.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>نوع الطلب *</Label>
              <Select value={pType} onValueChange={(v) => setPType(v as PaymentRequestType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_REQUEST_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {pType === 'reimbursement' && pResourceId && (
            <div className="border rounded p-3 bg-muted/20">
              <div className="text-sm font-medium mb-2">اختر الاستردادات المعتمدة لهذا المورد:</div>
              {eligibleReimbs.length === 0 ? (
                <p className="text-xs text-muted-foreground">لا توجد استردادات معتمدة غير مدفوعة لهذا المورد.</p>
              ) : eligibleReimbs.map((r) => (
                <label key={r.id} className="flex items-center gap-2 text-sm py-1 cursor-pointer">
                  <input type="checkbox"
                    checked={pSelectedReimbs.includes(r.id)}
                    onChange={(e) => {
                      if (e.target.checked) setPSelectedReimbs([...pSelectedReimbs, r.id]);
                      else setPSelectedReimbs(pSelectedReimbs.filter((x) => x !== r.id));
                    }} />
                  <span className="flex-1">{r.expenseDate} — {r.description}</span>
                  <span className="font-medium">{formatCurrency(r.amount)}</span>
                </label>
              ))}
              <div className="text-sm font-bold mt-2 pt-2 border-t">
                المجموع: {formatCurrency(computedAmount)}
              </div>
            </div>
          )}

          {pType !== 'reimbursement' && (
            <div>
              <Label>المبلغ *</Label>
              <Input type="number" inputMode="decimal" value={pAmount} onChange={(e) => setPAmount(e.target.value)} />
            </div>
          )}

          <div>
            <Label>وصف الطلب *</Label>
            <Input value={pDescription} onChange={(e) => setPDescription(e.target.value)} placeholder="استرداد مصاريف لابتوب" />
          </div>
          <div>
            <Label>المبرر</Label>
            <Textarea value={pJustification} onChange={(e) => setPJustification(e.target.value)} rows={2} />
          </div>
          <div>
            <Label>الأولوية</Label>
            <Select value={pPriority} onValueChange={(v) => setPPriority(v as PaymentPriority)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PAYMENT_PRIORITY_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>بند الموازنة المرتبط (اختياري)</Label>
            <Select value={pBudgetItemId || 'none'} onValueChange={(v) => setPBudgetItemId(v === 'none' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="بدون ربط" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— بدون ربط —</SelectItem>
                {projBudgetItems.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {EXPENSE_CATEGORY_LABELS[b.category as ExpenseCategory] || b.category} — {b.description} ({formatCurrency(b.plannedAmount)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              ربط الطلب ببند موازنة يضمن ظهوره في تحليل الانحراف وتقارير CPI.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={handleCreateReq}>إنشاء وإرسال للاعتماد</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
