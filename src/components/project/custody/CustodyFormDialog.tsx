/**
 * The custody form, for adding and for editing.
 *
 * A custody is drawn from a fund: while a fund with a balance exists the
 * link is mandatory, and only an admin may leave it off, with a written
 * reason that goes into the notes as an audit trail. An edit may not reduce
 * the amount below what was already spent from it.
 *
 * The section remounts this component (via `key`) on every open; an edit
 * starts from the row through the `useState` initialisers and an add starts
 * blank. The trigger renders here (the responsive dialog wants it as a prop)
 * but opening is the section's call through `onRequestOpen`.
 */
import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/store/useStore';
import { formatCurrency } from '@/lib/finance';
import type { Custody, Expense } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveFormDialog } from '@/components/ResponsiveFormDialog';
import { FormFooter } from '@/components/FormFooter';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage, todayLocal } from '@/lib/utils';
import type { AvailableFund } from './CashTransferDialog';
import { useShallow } from 'zustand/react/shallow';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRequestOpen: () => void;
  /** The custody being edited; absent for a new one. */
  editing?: Custody;
  projectId: string;
  custodies: Custody[];
  expenses: Expense[];
  availableFunds: AvailableFund[];
  isAdmin: boolean;
}

export function CustodyFormDialog({
  open, onOpenChange, onRequestOpen, editing, projectId, custodies, expenses, availableFunds, isAdmin,
}: Props) {
  const { addCustody, updateCustody } = useStore(useShallow((s) => ({ addCustody: s.addCustody, updateCustody: s.updateCustody })));

  const editingId = editing?.id ?? null;
  const [resourceName, setResourceName] = useState(editing?.resourceName ?? '');
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '');
  const [notes, setNotes] = useState(editing?.notes || '');
  const [receivedDate, setReceivedDate] = useState(editing?.receivedDate || todayLocal());
  const [sourceFundId, setSourceFundId] = useState<string>(editing?.sourceFundId || 'none');
  const [unlinkReason, setUnlinkReason] = useState('');

  // افتراضياً اختر أحدث دفعة متاحة عند فتح النموذج — مرة واحدة فقط.
  // Once only: the guard used to be `sourceFundId === 'none'`, so an admin who
  // deliberately chose "no fund" was handed the newest fund straight back and
  // the unlink reason was never asked for. The dialog is remounted on every
  // open, so a ref is enough to remember that the default has been applied.
  const defaulted = useRef(false);
  useEffect(() => {
    if (open && !defaulted.current && sourceFundId === 'none' && availableFunds.length > 0) {
      defaulted.current = true;
      setSourceFundId(availableFunds[0].id);
    }
  }, [open, availableFunds, sourceFundId]);

  const fundsExist = availableFunds.length > 0;
  const isUnlinked = sourceFundId === 'none';
  const requiresUnlinkReason = fundsExist && isUnlinked;

  const handleAdd = async () => {
    if (!resourceName.trim() || !amount) return;
    if (fundsExist && isUnlinked && !isAdmin) {
      toast.error('يجب ربط العهدة بدفعة نشطة. تواصل مع المدير لإنشاء عهدة بدون ربط.');
      return;
    }
    if (requiresUnlinkReason && !editingId && (!unlinkReason.trim() || unlinkReason.trim().length < 10)) {
      toast.error('سبب عدم الربط بدفعة مطلوب (10 أحرف على الأقل)');
      return;
    }
    try {
      const finalNotes = requiresUnlinkReason && !editingId
        ? `[عهدة غير مربوطة بدفعة] ${unlinkReason.trim()}${notes.trim() ? ` — ${notes.trim()}` : ''}`
        : (notes.trim() || undefined);
      if (editingId) {
        const original = custodies.find(c => c.id === editingId);
        const spent = expenses.filter((e) => e.custodyId === editingId).reduce((s, e) => s + e.amount, 0);
        const newAmt = parseFloat(amount);
        if (original && newAmt !== original.amount && newAmt < spent) {
          toast.error(`لا يمكن تخفيض المبلغ تحت ${formatCurrency(spent)} (المصروف عليها)`);
          return;
        }
        await updateCustody(editingId, {
          resourceName: resourceName.trim(),
          amount: newAmt,
          notes: finalNotes ?? null,
          receivedDate,
          sourceFundId: sourceFundId !== 'none' ? sourceFundId : null,
        });
        toast.success('تم تعديل العهدة');
      } else {
        await addCustody({
          projectId,
          resourceName: resourceName.trim(),
          amount: parseFloat(amount),
          notes: finalNotes,
          status: 'active',
          receivedDate,
          sourceFundId: sourceFundId !== 'none' ? sourceFundId : undefined,
        });
        toast.success('تمت إضافة العهدة');
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e, 'تعذّر حفظ العهدة'));
    }
  };

  return (
    <ResponsiveFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editingId ? 'تعديل العهدة' : 'إضافة عهدة جديدة'}
      trigger={<Button size="sm" className="gap-1.5" onClick={onRequestOpen}><Plus className="w-3.5 h-3.5" />عهدة جديدة</Button>}
      footer={<FormFooter onCancel={() => onOpenChange(false)} onSubmit={handleAdd} submitLabel={editingId ? 'حفظ' : 'إضافة'} />}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>اسم المستلم</Label>
          <Input value={resourceName} onChange={(e) => setResourceName(e.target.value)} placeholder="مثال: عمر أحمد" />
        </div>
        <div className="space-y-2">
          <Label>المبلغ</Label>
          <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        </div>
        <div className="space-y-2">
          <Label>مصدر العهدة (الدفعة) {fundsExist && <span className="text-destructive">*</span>}</Label>
          <Select value={sourceFundId} onValueChange={setSourceFundId}>
            <SelectTrigger><SelectValue placeholder="اختر الدفعة المصدر" /></SelectTrigger>
            <SelectContent>
              {(!fundsExist || isAdmin) && (
                <SelectItem value="none">
                  {fundsExist ? '⚠️ بدون ربط (إدارة فقط — يتطلب مبرر)' : 'بدون ربط بدفعة (لا توجد دفعات نشطة)'}
                </SelectItem>
              )}
              {availableFunds.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  دفعة #{f.fundNumber} — متاح {formatCurrency(f.remaining)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {fundsExist
              ? 'الربط بدفعة إلزامي للحفاظ على دقة المحاسبة. يُخصم مبلغ العهدة فوراً من رصيد الدفعة.'
              : 'لا توجد دفعات نشطة — يمكن إنشاء العهدة بدون ربط.'}
          </p>
        </div>
        {requiresUnlinkReason && (
          <div className="space-y-2 p-3 rounded-md border border-destructive/30 bg-destructive/5">
            <Label className="text-destructive">سبب عدم الربط بدفعة <span className="text-destructive">*</span></Label>
            <Input
              value={unlinkReason}
              onChange={(e) => setUnlinkReason(e.target.value)}
              placeholder="مثال: عهدة طارئة بانتظار اعتماد دفعة جديدة"
            />
            <p className="text-xs text-destructive/80">سيُحفظ السبب في ملاحظات العهدة كأثر تدقيق.</p>
          </div>
        )}
        <div className="space-y-2">
          <Label>تاريخ استلام العهدة</Label>
          <Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>ملاحظات (اختياري)</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="مثال: عهدة مشتريات شهر مارس" />
        </div>
      </div>
    </ResponsiveFormDialog>
  );
}
