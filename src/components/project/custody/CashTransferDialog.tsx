/**
 * Moves cash from a fund the manager still holds into a custody. Not an
 * expense: the money changes hands, not ledgers, and the fund's remainder
 * is the ceiling.
 *
 * The section remounts this component (via `key`) on every open, so a
 * half-typed transfer never resurfaces. Source and target are both the
 * user's pick: the section used to carry an opener that pre-picked the fund,
 * but nothing ever called it, so the behaviour here is what shipped.
 */
import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { formatCurrency } from '@/lib/finance';
import type { ProjectFund } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveFormDialog } from '@/components/ResponsiveFormDialog';
import { FormFooter } from '@/components/FormFooter';
import { ArrowDownToLine } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/utils';

/** A fund with a balance, as the section computes it. */
export type AvailableFund = ProjectFund & { remaining: number };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRequestOpen: () => void;
  projectId: string;
  availableFunds: AvailableFund[];
  activeCustodies: { id: string; resourceName: string; remaining: number }[];
}

export function CashTransferDialog({
  open, onOpenChange, onRequestOpen, projectId, availableFunds, activeCustodies,
}: Props) {
  const { createCashTransfer, refreshCashDerivations } = useStore();

  const [transferCustodyId, setTransferCustodyId] = useState<string>('');
  const [transferFundId, setTransferFundId] = useState<string>('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split('T')[0]);
  const [transferNotes, setTransferNotes] = useState('');

  const handleTransfer = async () => {
    const amt = parseFloat(transferAmount);
    if (!amt || amt <= 0) { toast.error('أدخل مبلغاً صحيحاً'); return; }
    if (!transferFundId) { toast.error('اختر الدفعة المصدر'); return; }
    if (!transferCustodyId) { toast.error('اختر العهدة المستهدفة'); return; }
    const fund = availableFunds.find(f => f.id === transferFundId);
    if (!fund) { toast.error('الدفعة غير موجودة'); return; }
    if (amt > fund.remaining) {
      toast.error(`المبلغ يتجاوز رصيد الدفعة المتاح (${formatCurrency(fund.remaining)})`);
      return;
    }
    try {
      await createCashTransfer({
        projectId,
        fromFundId: transferFundId,
        toCustodyId: transferCustodyId,
        amount: amt,
        transferDate,
        notes: transferNotes.trim() || undefined,
      });
      toast.success('تم تسجيل تحويل النقد');
      onOpenChange(false);
    } catch (e) {
      // رفض الخادم يعني أن أرقام الواجهة قديمة — أعد المزامنة فوراً
      await refreshCashDerivations?.(projectId).catch(() => undefined);
      toast.error(`${errorMessage(e, 'تعذّر تسجيل التحويل')} — تم تحديث الأرصدة من الخادم`);
    }
  };

  return (
    <ResponsiveFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="تحويل نقد من المدير إلى عهدة"
      trigger={<Button size="sm" variant="outline" className="gap-1.5" onClick={onRequestOpen}><ArrowDownToLine className="w-3.5 h-3.5" />تحويل نقد</Button>}
      footer={<FormFooter onCancel={() => onOpenChange(false)} onSubmit={handleTransfer} submitLabel="تسجيل التحويل" />}
    >
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          يحوّل مبلغاً من النقد المتبقي بيد المدير (دفعة مصدر) إلى رصيد عهدة قائمة. لا يُحتسب كمصروف.
        </p>
        <div className="space-y-2">
          <Label>الدفعة المصدر</Label>
          <Select value={transferFundId} onValueChange={setTransferFundId}>
            <SelectTrigger><SelectValue placeholder="اختر دفعة" /></SelectTrigger>
            <SelectContent>
              {availableFunds.map(f => (
                <SelectItem key={f.id} value={f.id}>
                  دفعة #{f.fundNumber} — متاح {formatCurrency(f.remaining)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>العهدة المستهدفة</Label>
          <Select value={transferCustodyId} onValueChange={setTransferCustodyId}>
            <SelectTrigger><SelectValue placeholder="اختر عهدة" /></SelectTrigger>
            <SelectContent>
              {activeCustodies.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  {c.resourceName} — رصيد {formatCurrency(c.remaining)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>المبلغ</Label>
          <Input type="number" inputMode="decimal" value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} placeholder="0" />
        </div>
        <div className="space-y-2">
          <Label>التاريخ</Label>
          <Input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>ملاحظات (اختياري)</Label>
          <Input value={transferNotes} onChange={(e) => setTransferNotes(e.target.value)} placeholder="مثال: تعزيز عهدة المشتريات" />
        </div>
      </div>
    </ResponsiveFormDialog>
  );
}
