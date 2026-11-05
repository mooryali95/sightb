/**
 * The reject dialog. One dialog serves both ledgers: `target.kind` says
 * whether the reason goes to a reimbursement or to a payment request, and
 * the reason itself is mandatory.
 *
 * The section remounts this component (via `key`) on every open, so a reason
 * typed and abandoned does not resurface on the next row.
 */
import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/utils';
import { useShallow } from 'zustand/react/shallow';

export interface RejectTarget { id: string; kind: 'reimb' | 'req' }

interface Props {
  /** What is being rejected; the dialog is closed when null. */
  target: RejectTarget | null;
  onClose: () => void;
}

export function RejectDialog({ target, onClose }: Props) {
  const { rejectReimbursement, rejectPaymentRequest } = useStore(useShallow((s) => ({ rejectReimbursement: s.rejectReimbursement, rejectPaymentRequest: s.rejectPaymentRequest })));

  const [rejectReason, setRejectReason] = useState('');

  const handleReject = async () => {
    if (!target || !rejectReason.trim()) {
      toast.error('سبب الرفض مطلوب'); return;
    }
    try {
      if (target.kind === 'reimb') {
        await rejectReimbursement(target.id, rejectReason);
      } else {
        await rejectPaymentRequest(target.id, rejectReason);
      }
      toast.success('تم الرفض');
      onClose();
    } catch (e) { toast.error(errorMessage(e)); }
  };

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>سبب الرفض</DialogTitle></DialogHeader>
        <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={4} placeholder="اكتب سبباً واضحاً..." />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button variant="destructive" onClick={handleReject}>رفض</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
