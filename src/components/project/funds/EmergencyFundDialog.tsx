/**
 * The emergency-fund dialog: opens a new fund before the previous one is
 * settled. The reason is mandatory and at least ten characters, and the
 * store records the fund in the audit log as an exception.
 */
import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage, todayLocal } from '@/lib/utils';

interface Props {
  projectId: string;
  /** The unsettled fund this one jumps ahead of; shown in the warning. */
  blockingFundNumber?: number;
}

export function EmergencyFundDialog({ projectId, blockingFundNumber }: Props) {
  const { createFund } = useStore();

  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [emAmount, setEmAmount] = useState('');
  const [emDate, setEmDate] = useState(todayLocal());
  const [emReason, setEmReason] = useState('');
  const [emNotes, setEmNotes] = useState('');

  const handleEmergency = async () => {
    const amt = parseFloat(emAmount);
    if (!amt || amt <= 0) { toast.error('أدخل مبلغاً صحيحاً'); return; }
    if (!emReason.trim() || emReason.trim().length < 10) {
      toast.error('سبب الدفعة الاستثنائية مطلوب (10 أحرف على الأقل)');
      return;
    }
    try {
      await createFund(projectId, amt, emDate, emNotes.trim() || undefined, {
        emergency: true,
        emergencyReason: emReason.trim(),
      });
      toast.success('تم إنشاء الدفعة الاستثنائية وتسجيلها في سجل التدقيق');
      setEmergencyOpen(false);
      setEmAmount(''); setEmNotes(''); setEmReason('');
    } catch (e) {
      toast.error(errorMessage(e, 'تعذّر إنشاء الدفعة الاستثنائية'));
    }
  };

  return (
    <Dialog open={emergencyOpen} onOpenChange={setEmergencyOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-destructive/40 text-destructive hover:bg-destructive/5">
          <AlertTriangle className="w-3 h-3" /> دفعة استثنائية
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-destructive">دفعة استثنائية (تجاوز قاعدة التسوية)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="p-2 rounded-md bg-destructive/5 border border-destructive/30 text-xs text-destructive">
            ستنشئ دفعة جديدة قبل تسوية الدفعة #{blockingFundNumber}. هذا الإجراء يُسجَّل في سجل التدقيق ويظهر باسم "دفعة استثنائية" في الملاحظات.
          </div>
          <div>
            <Label>المبلغ</Label>
            <Input type="number" value={emAmount} onChange={(e) => setEmAmount(e.target.value)} placeholder="0" />
          </div>
          <div>
            <Label>تاريخ التحويل</Label>
            <Input type="date" value={emDate} onChange={(e) => setEmDate(e.target.value)} />
          </div>
          <div>
            <Label>سبب الاستثناء <span className="text-destructive">*</span></Label>
            <Textarea
              value={emReason}
              onChange={(e) => setEmReason(e.target.value)}
              rows={3}
              placeholder="مثال: مدفوعات عاجلة لمورد حرج قبل اكتمال تسوية الدفعة السابقة..."
            />
          </div>
          <div>
            <Label>ملاحظات إضافية (اختياري)</Label>
            <Textarea value={emNotes} onChange={(e) => setEmNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setEmergencyOpen(false)}>إلغاء</Button>
          <Button variant="destructive" onClick={handleEmergency}>اعتماد الدفعة الاستثنائية</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
