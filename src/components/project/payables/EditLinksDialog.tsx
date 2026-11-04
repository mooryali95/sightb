/**
 * The edit-links dialog: re-links a payment request to the reimbursement rows
 * it pays, and re-derives its amount from them while it is still unpaid.
 * Once paid, only the links and the description move; the amount is money
 * that has already left.
 *
 * The section remounts this component (via `key`) on every open, so the
 * form starts from the request's current links and needs no reset.
 */
import { useMemo, useState } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn, errorMessage } from '@/lib/utils';
import { formatCurrency } from '@/lib/finance';
import {
  PAYMENT_REQUEST_STATUS_LABELS,
  type PaymentRequest,
  type ResourceReimbursement,
} from '@/types/project';

interface Props {
  /** The request being re-linked; the dialog is closed when absent. */
  request: PaymentRequest | undefined;
  projReimbs: ResourceReimbursement[];
  onClose: () => void;
}

export function EditLinksDialog({ request, projReimbs, onClose }: Props) {
  const { updatePaymentRequest } = useStore();

  const [editLinkedIds, setEditLinkedIds] = useState<string[]>([...(request?.linkedReimbursementIds || [])]);
  const [editDescription, setEditDescription] = useState(request?.description || '');
  const editEligibleReimbs = useMemo(() => {
    if (!request) return [];
    // Show approved reimbursements for the same resource, plus already-linked ones (even if not approved)
    return projReimbs.filter(
      (r) => r.resourceId === request.resourceId
        && (r.status === 'approved' || editLinkedIds.includes(r.id) || (request.linkedReimbursementIds || []).includes(r.id)),
    );
  }, [request, projReimbs, editLinkedIds]);

  const handleSaveEditLinks = async () => {
    if (!request) return;
    try {
      const updates: Partial<PaymentRequest> = {
        linkedReimbursementIds: editLinkedIds,
        description: editDescription.trim() || request.description,
      };
      // If reimbursement type and not yet paid, recompute amount from linked items
      if (request.requestType === 'reimbursement' && request.status !== 'paid') {
        const newAmount = projReimbs
          .filter((r) => editLinkedIds.includes(r.id))
          .reduce((s, r) => s + r.amount, 0);
        if (newAmount > 0) updates.amount = newAmount;
      }
      await updatePaymentRequest(request.id, updates);
      toast.success('تم تحديث ربط البنود');
      onClose();
    } catch (e) {
      toast.error(errorMessage(e, 'فشل التحديث'));
    }
  };

  return (
    <Dialog open={!!request} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>تعديل ربط البنود</DialogTitle>
        </DialogHeader>
        {request && (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded">
              <p>طلب الصرف: <strong>{request.description}</strong></p>
              <p>الحالة: <Badge variant="outline" className="text-xs">{PAYMENT_REQUEST_STATUS_LABELS[request.status]}</Badge></p>
              {request.status === 'paid' && (
                <p className="text-warning mt-1">⚠ المبلغ ثابت لأن الطلب مدفوع — فقط الربط والوصف قابلان للتعديل.</p>
              )}
            </div>
            <div>
              <Label>الوصف</Label>
              <Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
            </div>
            {request.requestType === 'reimbursement' && (
              <div>
                <Label>البنود المرتبطة (مستحقات)</Label>
                <div className="border rounded-lg p-2 max-h-64 overflow-y-auto space-y-1.5 mt-1.5">
                  {editEligibleReimbs.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3">لا توجد مستحقات معتمدة قابلة للربط</p>
                  ) : (
                    editEligibleReimbs.map((r) => {
                      const checked = editLinkedIds.includes(r.id);
                      // Boolean(): paymentRequestId is optional, so `&&` would
                      // otherwise yield '' | undefined and leak into `disabled`.
                      const linkedElsewhere = Boolean(r.paymentRequestId) && r.paymentRequestId !== request.id;
                      return (
                        <label key={r.id} className={cn('flex items-start gap-2 p-1.5 rounded cursor-pointer hover:bg-muted/50', linkedElsewhere && 'opacity-60')}>
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={checked}
                            disabled={linkedElsewhere && !checked}
                            onChange={(e) => {
                              setEditLinkedIds((prev) =>
                                e.target.checked ? [...prev, r.id] : prev.filter((x) => x !== r.id),
                              );
                            }}
                          />
                          <div className="flex-1 text-xs">
                            <div className="font-medium">{r.description}</div>
                            <div className="text-muted-foreground flex gap-2">
                              <span>{formatCurrency(r.amount)}</span>
                              <span>· {r.expenseDate}</span>
                              {linkedElsewhere && <span className="text-warning">· مربوط بطلب آخر</span>}
                            </div>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  المجموع الجديد: <strong>{formatCurrency(projReimbs.filter((r) => editLinkedIds.includes(r.id)).reduce((s, r) => s + r.amount, 0))}</strong>
                </p>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleSaveEditLinks}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
