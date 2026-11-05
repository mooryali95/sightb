/**
 * The reject-settlement dialog: an admin sends a submitted settlement back
 * with a mandatory reason. Remounted by the section on every open, so an
 * abandoned reason does not resurface on the next fund.
 */
import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/utils';
import { useShallow } from 'zustand/react/shallow';

interface Props {
  /** The settlement being rejected; the dialog is closed when null. */
  settlementId: string | null;
  onClose: () => void;
}

export function RejectSettlementDialog({ settlementId, onClose }: Props) {
  const { rejectSettlement } = useStore(useShallow((s) => ({ rejectSettlement: s.rejectSettlement })));
  const [rejectReason, setRejectReason] = useState('');

  const handleReject = async () => {
    if (!settlementId || !rejectReason.trim()) {
      toast.error('سبب الرفض مطلوب');
      return;
    }
    try {
      await rejectSettlement(settlementId, rejectReason.trim());
      toast.success('تم رفض التسوية');
      onClose();
    } catch (e) {
      toast.error(errorMessage(e, 'تعذّر الرفض'));
    }
  };

  return (
    <Dialog open={!!settlementId} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>رفض التسوية</DialogTitle>
        </DialogHeader>
        <div>
          <Label>سبب الرفض</Label>
          <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button variant="destructive" onClick={handleReject}>رفض التسوية</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
