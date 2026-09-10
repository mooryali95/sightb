/**
 * The dialog that raises a new payment request.
 *
 * Its eight fields are local, but the *seed* that opens it is not, and that
 * asymmetry is deliberate. The balances table above the tabs has a "دفع
 * المستحقات" button which pre-fills this dialog for one resource, and Radix
 * unmounts an inactive `TabsContent` — so anything held inside the requests tab
 * is gone the moment that button is clicked from the reimbursements tab.
 * Keeping the seed in the section and the fields here preserves that hand-off
 * while leaving the section with one piece of state instead of nine.
 *
 * Because Radix unmounts a closed dialog's content, the body remounts on every
 * open and reads the seed through `useState` initialisers. That is what resets
 * the form between openings — there is no separate reset path to keep in sync.
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
import {
  EXPENSE_CATEGORY_LABELS,
  PAYMENT_PRIORITY_LABELS,
  PAYMENT_REQUEST_TYPE_LABELS,
  type BudgetItem,
  type PaymentPriority,
  type PaymentRequestType,
  type Resource,
  type ResourceReimbursement,
} from '@/types/project';
import type { NewRequestSeed } from './newRequestSeed';

interface Props {
  projectId: string;
  /** Non-null means open; the object carries whatever the opener pre-filled. */
  seed: NewRequestSeed | null;
  projResources: Resource[];
  projReimbs: ResourceReimbursement[];
  projBudgetItems: BudgetItem[];
  onClose: () => void;
}

export function NewPaymentRequestDialog({
  projectId, seed, projResources, projReimbs, projBudgetItems, onClose,
}: Props) {
  return (
    <Dialog open={!!seed} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>طلب صرف دفعة جديدة</DialogTitle>
        </DialogHeader>
        {seed && (
          <Body
            projectId={projectId}
            seed={seed}
            projResources={projResources}
            projReimbs={projReimbs}
            projBudgetItems={projBudgetItems}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Body({
  projectId, seed, projResources, projReimbs, projBudgetItems, onClose,
}: Props & { seed: NewRequestSeed }) {
  const { createPaymentRequest, submitPaymentRequest } = useStore();

  const [pResourceId, setPResourceId] = useState(seed.resourceId);
  const [pType, setPType] = useState<PaymentRequestType>(seed.requestType);
  const [pAmount, setPAmount] = useState('');
  const [pDescription, setPDescription] = useState(seed.description);
  const [pJustification, setPJustification] = useState('');
  const [pPriority, setPPriority] = useState<PaymentPriority>(seed.priority);
  const [pSelectedReimbs, setPSelectedReimbs] = useState<string[]>(seed.selectedReimbursementIds);
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
      onClose();
    } catch (e: any) { toast.error(e.message || 'فشلت العملية'); }
  };

  return (
    <>
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
                  {EXPENSE_CATEGORY_LABELS[b.category] || b.category} — {b.description} ({formatCurrency(b.plannedAmount)})
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
        <Button variant="outline" onClick={onClose}>إلغاء</Button>
        <Button onClick={handleCreateReq}>إنشاء وإرسال للاعتماد</Button>
      </DialogFooter>
    </>
  );
}
