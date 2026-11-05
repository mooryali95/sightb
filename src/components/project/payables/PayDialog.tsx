/**
 * The pay dialog: confirms an approved or scheduled request against exactly
 * one cash source, a fund or a custody, and refuses a source that cannot
 * cover the amount.
 *
 * The database accepts a payment with neither source, but an expense that
 * belongs to no fund and no custody leaves cash integrity with nothing to
 * reconcile it against, so the dialog never offers that.
 *
 * The section remounts this component (via `key`) on every open, so the
 * source is pre-picked from the balances current at that moment and the
 * form needs no reset.
 */
import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { cn, errorMessage, todayLocal } from '@/lib/utils';
import { formatCurrency } from '@/lib/finance';
import { PAYMENT_METHOD_LABELS, type PaymentMethod, type PaymentRequest } from '@/types/project';
import type { AvailableCustody, AvailableFund } from './SettleAdvanceDialog';

interface Props {
  /** The request being paid; the dialog is closed when absent. */
  request: PaymentRequest | undefined;
  /** A scheduled request carries its date in; otherwise today. */
  initialDate?: string;
  onClose: () => void;
  availableFunds: AvailableFund[];
  availableCustodies: AvailableCustody[];
}

export function PayDialog({ request, initialDate, onClose, availableFunds, availableCustodies }: Props) {
  const { payPaymentRequest } = useStore();

  const [payDate, setPayDate] = useState(initialDate || todayLocal());
  const [payMethod, setPayMethod] = useState<PaymentMethod>('bank_transfer');
  const [payRef, setPayRef] = useState('');
  // Pre-pick the first fund with a balance; failing that, the first custody.
  // With neither, the fund radio stays selected with nothing chosen, which
  // keeps the confirm control disabled until a source exists.
  const [paySource, setPaySource] = useState<'fund' | 'custody'>(
    availableFunds.length === 0 && availableCustodies.length > 0 ? 'custody' : 'fund',
  );
  const [paySourceFundId, setPaySourceFundId] = useState<string>(availableFunds[0]?.fund.id ?? '');
  const [paySourceCustodyId, setPaySourceCustodyId] = useState<string>(
    availableFunds.length === 0 ? (availableCustodies[0]?.custody.id ?? '') : '',
  );

  const handlePay = async () => {
    if (!request) return;
    // Exactly one source: a fund or a custody. The database accepts a payment
    // with neither, but an expense that belongs to no fund and no custody
    // leaves cash integrity with nothing to reconcile it against — so the
    // dialog never offers it.
    // Balance check
    if (paySource === 'fund') {
      if (!paySourceFundId) { toast.error('اختر الدفعة المصدر'); return; }
      const f = availableFunds.find((x) => x.fund.id === paySourceFundId);
      if (!f) { toast.error('الدفعة المختارة غير متوفرة'); return; }
      if (f.remaining < request.amount) {
        toast.error(`رصيد الدفعة غير كافٍ. المتاح: ${formatCurrency(f.remaining)}`); return;
      }
    } else if (paySource === 'custody') {
      if (!paySourceCustodyId) { toast.error('اختر العهدة المصدر'); return; }
      const c = availableCustodies.find((x) => x.custody.id === paySourceCustodyId);
      if (!c) { toast.error('العهدة المختارة غير متوفرة'); return; }
      if (c.remaining < request.amount) {
        toast.error(`رصيد العهدة غير كافٍ. المتاح: ${formatCurrency(c.remaining)}`); return;
      }
    }
    try {
      await payPaymentRequest(request.id, {
        paidDate: payDate, paymentMethod: payMethod,
        paymentReference: payRef,
        paidFromFundId: paySource === 'fund' ? paySourceFundId : null,
        paidFromCustodyId: paySource === 'custody' ? paySourceCustodyId : null,
      });
      toast.success('تم تأكيد الدفع وتسجيل المصروف تلقائياً');
      onClose();
    } catch (e) { toast.error(errorMessage(e)); }
  };


  return (
    <Dialog open={!!request} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>تأكيد الدفع</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>تاريخ الدفع *</Label>
            <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
          </div>
          <div>
            <Label>طريقة الدفع *</Label>
            <Select value={payMethod} onValueChange={(v) => setPayMethod(v as PaymentMethod)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>مرجع الدفع (اختياري)</Label>
            <Input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="رقم التحويل/الشيك" />
          </div>
          {/* ─── مصدر النقد ─── */}
          <div className="border rounded-lg p-3 bg-muted/20 space-y-2">
            <Label className="font-semibold">مصدر النقد *</Label>
            {request && (
              <p className="text-xs text-muted-foreground">
                المبلغ المطلوب: <strong className="text-foreground">{formatCurrency(request.amount)}</strong>
              </p>
            )}
            <RadioGroup value={paySource} onValueChange={(v) => setPaySource(v as 'fund' | 'custody')} className="space-y-2">
              <div className="flex items-start gap-2">
                <RadioGroupItem value="fund" id="src-fund" disabled={availableFunds.length === 0} className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="src-fund" className={cn('cursor-pointer', availableFunds.length === 0 && 'text-muted-foreground')}>
                    من دفعة محددة {availableFunds.length === 0 && '(لا توجد دفعات بها رصيد)'}
                  </Label>
                  {paySource === 'fund' && availableFunds.length > 0 && (
                    <Select value={paySourceFundId} onValueChange={setPaySourceFundId}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="اختر الدفعة" /></SelectTrigger>
                      <SelectContent>
                        {availableFunds.map(({ fund, remaining }) => (
                          <SelectItem key={fund.id} value={fund.id}>
                            دفعة #{fund.fundNumber} — متاح {formatCurrency(remaining)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="custody" id="src-custody" disabled={availableCustodies.length === 0} className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="src-custody" className={cn('cursor-pointer', availableCustodies.length === 0 && 'text-muted-foreground')}>
                    من عهدة قائمة {availableCustodies.length === 0 && '(لا توجد عُهد نشطة برصيد)'}
                  </Label>
                  {paySource === 'custody' && availableCustodies.length > 0 && (
                    <Select value={paySourceCustodyId} onValueChange={setPaySourceCustodyId}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="اختر العهدة" /></SelectTrigger>
                      <SelectContent>
                        {availableCustodies.map(({ custody, remaining }) => (
                          <SelectItem key={custody.id} value={custody.id}>
                            {custody.resourceName} — متاح {formatCurrency(remaining)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            </RadioGroup>
            {availableFunds.length === 0 && availableCustodies.length === 0 && (
              <p className="text-xs text-destructive">
                لا يوجد مصدر سيولة كافٍ. حرّر سلفة قائمة أو سجّل دفعة جديدة.
              </p>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            عند التأكيد سيُنشأ مصروف تلقائياً مربوط بالمصدر المحدد ويُحسب ضمن رصيد الدفعة/العهدة.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handlePay} disabled={paySource === 'fund' ? !paySourceFundId : !paySourceCustodyId}>تأكيد الدفع</Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
