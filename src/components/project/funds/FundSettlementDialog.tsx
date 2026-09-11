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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Paperclip, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn, errorMessage } from '@/lib/utils';
import { formatCurrency } from '@/lib/finance';
import {
  getFundSpent,
  getFundDirectSpent,
  getFundCustodyDraw,
  getFundOutstandingAdvances,
  getFundCashTransfersOut,
  getFundRemaining,
  calculateSettlementDifference,
  getFundOpenItems,
  auditFundFinancialLinks,
} from '@/lib/funds';
import type {
  CashTransfer,
  Custody,
  Expense,
  FundSettlement,
  FundSettlementAttachment,
  PaymentRequest,
  ProjectFund,
} from '@/types/project';

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

export function FundSettlementDialog({
  fund, existing, projectExpenses, projectCustodies, projPRs, projTransfers, readOnly, onClose,
}: Props) {
  const { submitSettlement, updateSettlementDraft } = useStore();

  const [remainingCash, setRemainingCash] = useState(existing ? String(existing.remainingCash) : '0');
  const [diffReason, setDiffReason] = useState(existing?.differenceReason || '');
  const [attachments, setAttachments] = useState<FundSettlementAttachment[]>(existing?.attachments || []);
  const [attachName, setAttachName] = useState('');
  const [attachUrl, setAttachUrl] = useState('');

  const settlementSpent = fund
    ? getFundSpent(fund.id, projectExpenses, projectCustodies, projPRs, projTransfers)
    : 0;
  const settlementDiff = fund
    ? calculateSettlementDifference(
        fund.amount,
        settlementSpent,
        parseFloat(remainingCash) || 0,
      )
    : 0;

  const addAttachment = () => {
    if (!attachName.trim()) return;
    setAttachments((a) => [...a, {
      name: attachName.trim(),
      url: attachUrl.trim() || undefined,
      uploadedAt: new Date().toISOString(),
    }]);
    setAttachName(''); setAttachUrl('');
  };

  const removeAttachment = (idx: number) => {
    setAttachments((a) => a.filter((_, i) => i !== idx));
  };

  const handleSubmitSettlement = async () => {
    if (!fund) return;
    // Pre-validation: لا تسوية مع وجود روابط مزدوجة (عهدة + دفعة على نفس البند)
    const violations = auditFundFinancialLinks(fund.id, projectExpenses, projPRs);
    if (violations.length > 0) {
      const sample = violations.slice(0, 3).map((v) => `• ${v.description} (${formatCurrency(v.amount)})`).join('\n');
      toast.error(
        `لا يمكن إرسال التسوية: ${violations.length} بند مربوط بعهدة ودفعة معاً. صحّح الروابط أولاً.\n${sample}`,
        { duration: 9000 },
      );
      return;
    }
    const cash = parseFloat(remainingCash) || 0;
    if (Math.abs(settlementDiff) > 1 && !diffReason.trim()) {
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
      await updateSettlementDraft(existing.id, {
        remainingCash: parseFloat(remainingCash) || 0,
        attachments,
        differenceReason: diffReason || undefined,
      });
      toast.success('تم حفظ المسودة');
    } catch (e) {
      toast.error(errorMessage(e, 'تعذّر الحفظ'));
    }
  };

  return (
    <Dialog open={!!fund} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            تسوية الدفعة #{fund?.fundNumber}
          </DialogTitle>
        </DialogHeader>
        {fund && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">المستلم</p>
                <p className="font-mono font-semibold">{formatCurrency(fund.amount)}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">المصروف الموثق</p>
                <p className="font-mono font-semibold">{formatCurrency(settlementSpent)}</p>
              </div>
              <div className={cn(
                'p-3 rounded-lg border-2',
                Math.abs(settlementDiff) <= 1
                  ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-300/40'
                  : Math.abs(settlementDiff) > 1000
                    ? 'bg-destructive/10 border-destructive/40 animate-pulse'
                    : 'bg-amber-50 dark:bg-amber-900/10 border-amber-300/40',
              )}>
                <p className="text-xs text-muted-foreground">الفرق</p>
                <p className={cn(
                  'font-mono font-semibold',
                  Math.abs(settlementDiff) <= 1
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : Math.abs(settlementDiff) > 1000
                      ? 'text-destructive text-lg'
                      : 'text-amber-700 dark:text-amber-400',
                )}>
                  {formatCurrency(settlementDiff)}
                </p>
                {Math.abs(settlementDiff) > 1000 && (
                  <p className="text-xs text-destructive font-semibold mt-1">
                    ⚠️ فرق كبير — يتطلب توضيحاً مفصّلاً
                  </p>
                )}
            </div>

            {/* تفصيل مكوّنات المصروف الموثق */}
            {fund && (() => {
              const direct = getFundDirectSpent(fund.id, projectExpenses, projectCustodies);
              const custDraw = getFundCustodyDraw(fund.id, projectCustodies);
              const advances = getFundOutstandingAdvances(fund.id, projPRs);
              const transOut = getFundCashTransfersOut(fund.id, projTransfers);
              return (
                <div className="text-xs text-muted-foreground bg-muted/30 rounded-md p-2 grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div>مصروف مباشر: <span className="font-mono text-foreground">{formatCurrency(direct)}</span></div>
                  <div>عهد مسحوبة: <span className="font-mono text-foreground">{formatCurrency(custDraw)}</span></div>
                  <div>سلف قائمة: <span className="font-mono text-foreground">{formatCurrency(advances)}</span></div>
                  <div>تحويلات نقدية: <span className="font-mono text-foreground">{formatCurrency(transOut)}</span></div>
                </div>
              );
            })()}

            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>المتبقي النقدي المُعاد</Label>
                {(() => {
                  const computedRemaining = getFundRemaining(fund, projectExpenses, projectCustodies, projPRs, projTransfers);
                  const editable = !existing || existing.status === 'draft' || existing.status === 'rejected';
                  if (!editable) return null;
                  return (
                    <Button
                      type="button" size="sm" variant="outline"
                      onClick={() => setRemainingCash(String(Math.max(computedRemaining, 0)))}
                    >
                      احتسب تلقائياً
                    </Button>
                  );
                })()}
              </div>
              <Input
                type="number"
                value={remainingCash}
                onChange={(e) => setRemainingCash(e.target.value)}
                disabled={!!existing &&
                  existing.status !== 'draft' &&
                  existing.status !== 'rejected'}
              />
              {/* تفسير المتبقي: قائمة البنود غير المسوّاة */}
              {(() => {
                const open = getFundOpenItems(fund.id, projectCustodies, projPRs, projTransfers, projectExpenses);
                const hasOpen = open.openCustodies.length > 0 || open.outstandingAdvances.length > 0;
                if (!hasOpen) {
                  return (
                    <div className="text-xs p-2 rounded-md bg-success/10 text-success border border-success/20">
                      ✓ كل مكونات الدفعة موثّقة. لا توجد عهد مفتوحة أو سلف قائمة — المتبقي = 0 يعني الإقفال الكامل.
                    </div>
                  );
                }
                return (
                  <div className="text-xs p-2 rounded-md bg-warning/10 border border-warning/20 space-y-1.5">
                    <p className="font-semibold text-warning-foreground">بنود غير مسوّاة تمنع إقفال المتبقي عند 0:</p>
                    {open.openCustodies.length > 0 && (
                      <div>
                        <p className="text-muted-foreground">عهد مفتوحة من هذه الدفعة:</p>
                        <ul className="list-disc pr-4 mt-0.5">
                          {open.openCustodies.map((c) => (
                            <li key={c.id}>{c.resourceName} — متبقي فيها: <span className="font-mono">{formatCurrency(c.remaining)}</span></li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {open.outstandingAdvances.length > 0 && (
                      <div>
                        <p className="text-muted-foreground">سلف قائمة على موردين:</p>
                        <ul className="list-disc pr-4 mt-0.5">
                          {open.outstandingAdvances.map((a) => (
                            <li key={a.id}>{a.description} — <span className="font-mono">{formatCurrency(a.remaining)}</span></li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {Math.abs(settlementDiff) > 1 && (
              <div>
                <Label>سبب الفرق <span className="text-destructive">*</span></Label>
                <Textarea
                  value={diffReason}
                  onChange={(e) => setDiffReason(e.target.value)}
                  rows={2}
                  placeholder="مثال: مصروف نقدي بدون فاتورة..."
                  disabled={!!existing &&
                    existing.status !== 'draft' &&
                    existing.status !== 'rejected'}
                />
              </div>
            )}

            <div>
              <Label>المرفقات (فواتير)</Label>
              <div className="space-y-2 mt-2">
                {attachments.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 border rounded-md text-sm">
                    <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="flex-1">{a.name}</span>
                    {a.url && (
                      <a href={a.url} target="_blank" rel="noopener" className="text-xs text-primary underline">
                        فتح
                      </a>
                    )}
                    <Button size="icon" variant="ghost" className="h-6 w-6"
                      onClick={() => removeAttachment(i)}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input
                    placeholder="اسم المرفق"
                    value={attachName}
                    onChange={(e) => setAttachName(e.target.value)}
                    className="text-xs"
                  />
                  <Input
                    placeholder="رابط (اختياري)"
                    value={attachUrl}
                    onChange={(e) => setAttachUrl(e.target.value)}
                    className="text-xs"
                  />
                  <Button size="sm" variant="outline" onClick={addAttachment}>إضافة</Button>
                </div>
              </div>
            </div>

            {(() => {
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
                  <div className="p-3 rounded-md border border-emerald-300 bg-emerald-50 dark:bg-emerald-900/10 text-sm text-emerald-700 dark:text-emerald-400">
                    ✓ مُعتمدة في {existing.approvalDate?.split('T')[0]}
                  </div>
                );
              }
              return null;
            })()}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
          {fund && (() => {
            const editable = !existing || existing.status === 'draft' || existing.status === 'rejected';
            if (!editable || readOnly) return null;
            return (
              <>
                <Button variant="outline" onClick={handleSaveDraft}>حفظ مسودة</Button>
                <Button onClick={handleSubmitSettlement}>إرسال للاعتماد</Button>
              </>
            );
          })()}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
