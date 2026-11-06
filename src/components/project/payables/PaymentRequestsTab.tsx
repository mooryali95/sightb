/**
 * The payment-requests tab: every request on the project as a card, with the
 * status chain it has walked and the actions its status and the viewer's role
 * allow.
 *
 * The body is moved verbatim from the section. The five things it used to
 * reach into the parent for — opening the new-request dialog, the reject
 * dialog, the pay dialog, the settle-advance dialog and the edit-links
 * dialog — arrive as callbacks, because each of those dialogs serves more than
 * this tab and stays where it was.
 */
import { useStore } from '@/store/useStore';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { CalendarClock, Send } from 'lucide-react';
import { toast } from 'sonner';
import { cn, errorMessage, todayLocal } from '@/lib/utils';
import { formatCurrency } from '@/lib/finance';
import { buildTimeline } from '@/lib/resource-payables';
import {
  PAYMENT_PRIORITY_COLORS,
  PAYMENT_PRIORITY_LABELS,
  PAYMENT_REQUEST_STATUS_COLORS,
  PAYMENT_REQUEST_STATUS_LABELS,
  PAYMENT_REQUEST_TYPE_LABELS,
  type PaymentRequest,
  type Resource,
} from '@/types/project';
import { useShallow } from 'zustand/react/shallow';

interface Props {
  projReqs: PaymentRequest[];
  projResources: Resource[];
  canEdit: boolean;
  isAdmin: boolean;
  /** Age of an outstanding advance in days; shared with the section's exports and alerts. */
  advanceAgeDays: (req: PaymentRequest) => number;
  onNewRequest: () => void;
  onReject: (target: { id: string; kind: 'reimb' | 'req' }) => void;
  onPay: (reqId: string, scheduledDate?: string) => void;
  onSettleAdvance: (reqId: string) => void;
  onEditLinks: (reqId: string) => void;
}

const ageBadgeClasses = (days: number) =>
  days >= 90 ? 'border-destructive text-destructive bg-destructive/10'
  : days >= 60 ? 'border-warning text-warning-foreground bg-warning/15'
  : days >= 30 ? 'border-warning text-warning bg-warning/10'
  : 'border-muted text-muted-foreground';

export function PaymentRequestsTab({
  projReqs, projResources, canEdit, isAdmin, advanceAgeDays,
  onNewRequest, onReject, onPay, onSettleAdvance, onEditLinks,
}: Props) {
  const {
    reviewPaymentRequest, approvePaymentRequest, schedulePaymentRequest,
    cancelPaymentRequest, deletePaymentRequest,
  } = useStore(useShallow((s) => ({ reviewPaymentRequest: s.reviewPaymentRequest, approvePaymentRequest: s.approvePaymentRequest, schedulePaymentRequest: s.schedulePaymentRequest, cancelPaymentRequest: s.cancelPaymentRequest, deletePaymentRequest: s.deletePaymentRequest })));

  return (
    <div className="space-y-3">
    <div className="flex justify-between items-center">
      <h3 className="text-base font-semibold">طلبات صرف الدفعات</h3>
      {canEdit && projResources.length > 0 && (
        <Button size="sm" variant="default" onClick={onNewRequest}>
          <Send className="h-4 w-4 me-1" /> طلب صرف جديد
        </Button>
      )}
    </div>

    {projReqs.length === 0 ? (
      <p className="text-sm text-muted-foreground p-6 text-center">لا توجد طلبات صرف.</p>
    ) : (
      <div className="space-y-3">
        {projReqs.map((req) => {
          const res = projResources.find((r) => r.id === req.resourceId);
          const timeline = buildTimeline(req);
          return (
            <Card key={req.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                <div>
                  <div className="font-semibold">{req.description}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {res?.name || '—'} · {PAYMENT_REQUEST_TYPE_LABELS[req.requestType]} · {formatCurrency(req.amount)}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {req.requestType === 'advance' && req.status === 'paid' && req.isAdvanceOutstanding && (() => {
                    const days = advanceAgeDays(req);
                    return (
                      <Badge variant="outline" className={cn('text-xs', ageBadgeClasses(days))}>
                        منذ {days} يوم
                      </Badge>
                    );
                  })()}
                  <Badge className={PAYMENT_PRIORITY_COLORS[req.priority]}>
                    {PAYMENT_PRIORITY_LABELS[req.priority]}
                  </Badge>
                  <Badge className={PAYMENT_REQUEST_STATUS_COLORS[req.status]}>
                    {PAYMENT_REQUEST_STATUS_LABELS[req.status]}
                  </Badge>
                </div>

              </div>

              {/* Timeline */}
              <div className="flex flex-wrap items-center gap-1 text-xs my-3 overflow-x-auto pb-2">
                {timeline.map((step, i) => (
                  <div key={step.key} className="flex items-center gap-1 shrink-0">
                    <div className={cn(
                      'flex flex-col items-center px-2 py-1 rounded',
                      step.current && 'bg-primary/10 ring-1 ring-primary',
                      step.done && !step.current && 'opacity-100',
                      !step.done && 'opacity-40',
                    )}>
                      <div className="font-medium">{step.label}</div>
                      {step.date && <div className="text-xs text-muted-foreground">{step.date.split('T')[0]}</div>}
                    </div>
                    {i < timeline.length - 1 && <div className="text-muted-foreground">←</div>}
                  </div>
                ))}
              </div>

              {req.justification && (
                <div className="text-xs text-muted-foreground border-s-2 border-muted ps-2 mb-2">{req.justification}</div>
              )}
              {req.rejectionReason && (
                <div className="text-xs text-destructive mb-2">سبب الرفض: {req.rejectionReason}</div>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2">
                {isAdmin && req.status === 'submitted' && (
                  <>
                    <Button size="sm" variant="outline"
                      onClick={async () => {
                        try { await reviewPaymentRequest(req.id); toast.success('قيد المراجعة'); }
                        catch (e) { toast.error(errorMessage(e)); }
                      }}>بدء المراجعة</Button>
                    <Button size="sm"
                      onClick={async () => {
                        try { await approvePaymentRequest(req.id); toast.success('تم الاعتماد'); }
                        catch (e) { toast.error(errorMessage(e)); }
                      }}>اعتماد</Button>
                    <Button size="sm" variant="outline"
                      onClick={() => onReject({ id: req.id, kind: 'req' })}>رفض</Button>
                  </>
                )}
                {isAdmin && req.status === 'under_review' && (
                  <>
                    <Button size="sm"
                      onClick={async () => {
                        try { await approvePaymentRequest(req.id); toast.success('تم الاعتماد'); }
                        catch (e) { toast.error(errorMessage(e)); }
                      }}>اعتماد</Button>
                    <Button size="sm" variant="outline"
                      onClick={() => onReject({ id: req.id, kind: 'req' })}>رفض</Button>
                  </>
                )}
                {(canEdit || isAdmin) && req.status === 'approved' && (
                  <>
                    <Button size="sm" variant="outline"
                      onClick={async () => {
                        const date = window.prompt('تاريخ الجدولة (YYYY-MM-DD):', todayLocal());
                        if (!date) return;
                        try { await schedulePaymentRequest(req.id, date); toast.success('تمت الجدولة'); }
                        catch (e) { toast.error(errorMessage(e)); }
                      }}>
                      <CalendarClock className="h-4 w-4 me-1" /> جدولة
                    </Button>
                    <Button size="sm"
                      onClick={() => onPay(req.id)}>
                      تأكيد الدفع
                    </Button>
                  </>
                )}
                {(canEdit || isAdmin) && req.status === 'scheduled' && (
                  <Button size="sm"
                    onClick={() => onPay(req.id, req.scheduledDate)}>
                    تأكيد الدفع
                  </Button>
                )}

                {canEdit && req.status === 'paid' && req.requestType === 'advance' && req.isAdvanceOutstanding && (
                  <Button size="sm" variant="default"
                    onClick={() => onSettleAdvance(req.id)}>
                    تسوية السلفة
                  </Button>
                )}
                {req.status === 'paid' && req.requestType === 'advance' && !req.isAdvanceOutstanding && req.advanceSettledAt && (
                  <Badge variant="outline" className="text-success border-success/30">
                    {req.settlementType === 'cash_refund' ? 'رد نقدي' :
                     req.settlementType === 'payroll_deduction' ? 'تحوّلت إلى حافز' :
                     req.settlementType === 'written_off' ? 'مشطوبة' :
                     'مسوّاة بمستندات'} — {String(req.advanceSettledAt).split('T')[0]}
                  </Badge>
                )}
                {canEdit && (req.status === 'draft' || req.status === 'submitted') && (
                  <Button size="sm" variant="ghost"
                    onClick={async () => {
                      try { await cancelPaymentRequest(req.id); toast.success('تم الإلغاء'); }
                      catch (e) { toast.error(errorMessage(e)); }
                    }}>إلغاء</Button>
                )}
                {/* تعديل الربط — مسموح في كل الحالات لـ canEdit (في draft) أو admin (بعد الاعتماد) */}
                {((canEdit && req.status === 'draft') || (isAdmin && req.status !== 'cancelled' && req.status !== 'rejected')) && (
                  <Button size="sm" variant="outline" onClick={() => onEditLinks(req.id)}>
                    تعديل الربط
                  </Button>
                )}

                {isAdmin && (req.status === 'draft' || req.status === 'cancelled' || req.status === 'rejected') && (
                  <ConfirmDeleteDialog
                    title="حذف طلب الصرف"
                    description={`حذف طلب صرف "${req.description}" نهائياً؟`}
                    onConfirm={async () => {
                      try { await deletePaymentRequest(req.id); toast.success('تم الحذف'); }
                      catch (e) { toast.error(errorMessage(e)); }
                    }}
                  />
                )}
                {/* السلف المدفوعة تُغلق فقط عبر مسار التسوية أعلاه (لا حذف) */}
              </div>
            </Card>
          );
        })}
      </div>
    )}
    </div>
  );
}
