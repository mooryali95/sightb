/**
 * The fund settlement dialog: reconciles what a fund received against what
 * was documented against it and the cash the manager still holds, and will
 * not send a difference of more than one unit without a reason.
 *
 * `existing` is the settlement already on file for the fund, if any. It
 * seeds the form and decides whether the form is still editable (a draft or
 * a rejected settlement) or a read-only view of one already sent.
 *
 * The section remounts this component (via `key`) on every open, so the
 * form starts from the settlement as it stands and needs no reset.
 */
import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/utils';
import { formatCurrency } from '@/lib/finance';
import type { CashTransfer, Custody, Expense, FundSettlement, FundSettlementAttachment, PaymentRequest, ProjectFund } from '@/types/project';
import { isSettlementEditable, needsReason, settlementFigures } from './settlementFigures';
import { SettlementFiguresGrid } from './SettlementFiguresGrid';
import { OpenItemsNote } from './OpenItemsNote';
import { AttachmentsEditor } from './AttachmentsEditor';
import { useShallow } from 'zustand/react/shallow';

interface Props {
  /** The fund being settled; the dialog is closed when absent. */
  fund: ProjectFund | undefined;
  /** The settlement already on file for it, if any. */
  existing: FundSettlement | undefined;
  projectExpenses: Expense[];
  projectCustodies: Custody[];
  projPRs: PaymentRequest[];
  projTransfers: CashTransfer[];
  readOnly: boolean;
  onClose: () => void;
}

function StatusNote({ existing }: { existing: FundSettlement | undefined }) {
  if (!existing) return null;
  if (existing.status === 'rejected' && existing.rejectionReason) {
    return (
      <div className="p-3 rounded-md border border-destructive/30 bg-destructive/5 text-sm text-destructive">
        <strong>سبب الرفض:</strong> {existing.rejectionReason}
      </div>
    );
  }
  if (existing.status === 'approved') {
    return (
      <div className="p-3 rounded-md border border-success/30 bg-success/10 text-sm text-success">
        ✓ مُعتمدة في {existing.approvalDate?.split('T')[0]}
      </div>
    );
  }
  return null;
}

export function FundSettlementDialog({
  fund, existing, projectExpenses, projectCustodies, projPRs, projTransfers, readOnly, onClose,
}: Props) {
  const { submitSettlement, updateSettlementDraft } = useStore(useShallow((s) => ({ submitSettlement: s.submitSettlement, updateSettlementDraft: s.updateSettlementDraft })));

  const [remainingCash, setRemainingCash] = useState(existing ? String(existing.remainingCash) : '0');
  const [diffReason, setDiffReason] = useState(existing?.differenceReason || '');
  const [attachments, setAttachments] = useState<FundSettlementAttachment[]>(existing?.attachments || []);

  const cash = parseFloat(remainingCash) || 0;
  const figures = fund
    ? settlementFigures(fund, { expenses: projectExpenses, custodies: projectCustodies, paymentRequests: projPRs, cashTransfers: projTransfers }, cash)
    : null;
  const editable = isSettlementEditable(existing);

  const handleSubmitSettlement = async () => {
    if (!fund || !figures) return;
    // Pre-validation: لا تسوية مع وجود روابط مزدوجة (عهدة + دفعة على نفس البند)
    if (figures.violations.length > 0) {
      const sample = figures.violations.slice(0, 3).map((v) => `• ${v.description} (${formatCurrency(v.amount)})`).join('\n');
      toast.error(
        `لا يمكن إرسال التسوية: ${figures.violations.length} بند مربوط بعهدة ودفعة معاً. صحّح الروابط أولاً.\n${sample}`,
        { duration: 9000 },
      );
      return;
    }
    if (needsReason(figures.difference) && !diffReason.trim()) {
      toast.error('يجب توضيح سبب الفرق');
      return;
    }
    try {
      await submitSettlement(fund.id, cash, attachments, diffReason || undefined);
      toast.success('تم إرسال التسوية للاعتماد');
      onClose();
    } catch (e) {
      toast.error(errorMessage(e, 'تعذّر إرسال التسوية'));
    }
  };

  const handleSaveDraft = async () => {
    if (!fund) return;
    if (!existing) {
      toast.error('لا توجد مسودة لحفظها — اضغط "إرسال للاعتماد" لإنشاء التسوية أولاً.');
      return;
    }
    try {
      await updateSettlementDraft(existing.id, { remainingCash: cash, attachments, differenceReason: diffReason || undefined });
      toast.success('تم حفظ المسودة');
    } catch (e) {
      toast.error(errorMessage(e, 'تعذّر الحفظ'));
    }
  };

  return (
    <Dialog open={!!fund} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>تسوية الدفعة #{fund?.fundNumber}</DialogTitle>
        </DialogHeader>
        {fund && figures && (
          <div className="space-y-4">
            <SettlementFiguresGrid received={fund.amount} spent={figures.spent} difference={figures.difference} breakdown={figures.breakdown} />

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>المتبقي النقدي المُعاد</Label>
                {editable && (
                  <Button type="button" size="sm" variant="outline" onClick={() => setRemainingCash(String(figures.computedRemaining))}>
                    احتسب تلقائياً
                  </Button>
                )}
              </div>
              <Input type="number" value={remainingCash} onChange={(e) => setRemainingCash(e.target.value)} disabled={!editable} />
              <OpenItemsNote open={figures.openItems} />
            </div>

            {needsReason(figures.difference) && (
              <div>
                <Label>سبب الفرق <span className="text-destructive">*</span></Label>
                <Textarea
                  value={diffReason}
                  onChange={(e) => setDiffReason(e.target.value)}
                  rows={2}
                  placeholder="مثال: مصروف نقدي بدون فاتورة..."
                  disabled={!editable}
                />
              </div>
            )}

            <AttachmentsEditor attachments={attachments} onChange={setAttachments} />

            <StatusNote existing={existing} />
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
          {fund && editable && !readOnly && (
            <>
              <Button variant="outline" onClick={handleSaveDraft}>حفظ مسودة</Button>
              <Button onClick={handleSubmitSettlement}>إرسال للاعتماد</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
