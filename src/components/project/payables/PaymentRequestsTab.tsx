/**
 * The payment-requests tab: the request cards and their approval timeline.
 *
 * The five callbacks stay props deliberately. Confirming a payment, editing a
 * request's links, settling an advance and rejecting one each open a dialog
 * that belongs to the section — the pay dialog reads fund and custody
 * balances, and the rejection dialog is shared with the reimbursements tab.
 * The new-request seed is a prop for a blunter reason: Radix unmounts an
 * inactive `TabsContent`, and the balances table above the tabs pre-fills that
 * dialog, so the seed has to outlive this component. See
 * `NewPaymentRequestDialog`.
 */
import { useStore } from '@/store/useStore';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { CalendarClock, Send } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/finance';
import { buildTimeline } from '@/lib/resource-payables';
import {
  PAYMENT_PRIORITY_COLORS,
  PAYMENT_PRIORITY_LABELS,
  PAYMENT_REQUEST_STATUS_COLORS,
  PAYMENT_REQUEST_STATUS_LABELS,
  PAYMENT_REQUEST_TYPE_LABELS,
  type BudgetItem,
  type PaymentRequest,
  type Resource,
  type ResourceReimbursement,
} from '@/types/project';
import { advanceAgeDays, ageBadgeClasses } from './advanceAge';
import { NewPaymentRequestDialog } from './NewPaymentRequestDialog';
import { blankRequestSeed, type NewRequestSeed } from './newRequestSeed';

interface Props {
  projectId: string;
  projReqs: PaymentRequest[];
  projResources: Resource[];
  projReimbs: ResourceReimbursement[];
  projBudgetItems: BudgetItem[];
  canEdit: boolean;
  isAdmin: boolean;
  newRequestSeed: NewRequestSeed | null;
  onNewRequestSeedChange: (seed: NewRequestSeed | null) => void;
  onPay: (reqId: string, scheduledDate?: string) => void;
  onEditLinks: (reqId: string) => void;
  onSettleAdvance: (reqId: string) => void;
  onReject: (target: { id: string; kind: 'reimb' | 'req' }) => void;
}

export function PaymentRequestsTab({
  projectId, projReqs, projResources, projReimbs, projBudgetItems,
  canEdit, isAdmin, newRequestSeed, onNewRequestSeedChange,
  onPay, onEditLinks, onSettleAdvance, onReject,
}: Props) {
  const {
    reviewPaymentRequest, approvePaymentRequest, schedulePaymentRequest,
    cancelPaymentRequest, deletePaymentRequest,
  } = useStore();

  return (
    <>
      <div className="flex justify-between items-center">
        <h3 className="text-base font-semibold">طلبات صرف الدفعات</h3>
        {canEdit && projResources.length > 0 && (
          <Button size="sm" variant="default" onClick={() => onNewRequestSeedChange(blankRequestSeed())}>
            <Send className="h-4 w-4 ml-1" /> طلب صرف جديد
          </Button>
        )}
      </div>

      {canEdit && (
        <NewPaymentRequestDialog
          projectId={projectId}
          seed={newRequestSeed}
          projResources={projResources}
          projReimbs={projReimbs}
          projBudgetItems={projBudgetItems}
          onClose={() => onNewRequestSeedChange(null)}
        />
      )}

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
                        {step.date && <div className="text-[10px] text-muted-foreground">{step.date.split('T')[0]}</div>}
                      </div>
                      {i < timeline.length - 1 && <div className="text-muted-foreground">←</div>}
                    </div>
                  ))}
                </div>

                {req.justification && (
                  <div className="text-xs text-muted-foreground border-r-2 border-muted pr-2 mb-2">{req.justification}</div>
                )}
                {req.rejectionReason && (
                  <div className="text-xs text-red-600 mb-2">سبب الرفض: {req.rejectionReason}</div>
                )}

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2">
                  {isAdmin && req.status === 'submitted' && (
                    <>
                      <Button size="sm" variant="outline"
                        onClick={async () => {
                          try { await reviewPaymentRequest(req.id); toast.success('قيد المراجعة'); }
                          catch (e: any) { toast.error(e.message); }
                        }}>بدء المراجعة</Button>
                      <Button size="sm"
                        onClick={async () => {
                          try { await approvePaymentRequest(req.id); toast.success('تم الاعتماد'); }
                          catch (e: any) { toast.error(e.message); }
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
                          catch (e: any) { toast.error(e.message); }
                        }}>اعتماد</Button>
                      <Button size="sm" variant="outline"
                        onClick={() => onReject({ id: req.id, kind: 'req' })}>رفض</Button>
                    </>
                  )}
                  {(canEdit || isAdmin) && req.status === 'approved' && (
                    <>
                      <Button size="sm" variant="outline"
                        onClick={async () => {
                          const date = window.prompt('تاريخ الجدولة (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
                          if (!date) return;
                          try { await schedulePaymentRequest(req.id, date); toast.success('تمت الجدولة'); }
                          catch (e: any) { toast.error(e.message); }
                        }}>
                        <CalendarClock className="h-4 w-4 ml-1" /> جدولة
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
                    <Badge variant="outline" className="text-emerald-600 border-emerald-300">
                      {req.settlementType === 'cash_refund' ? 'رد نقدي' :
                       req.settlementType === 'payroll_deduction' ? 'خصم من راتب' :
                       req.settlementType === 'written_off' ? 'مشطوبة' :
                       'مسوّاة بمستندات'} — {String(req.advanceSettledAt).split('T')[0]}
                    </Badge>
                  )}
                  {canEdit && (req.status === 'draft' || req.status === 'submitted') && (
                    <Button size="sm" variant="ghost"
                      onClick={async () => {
                        try { await cancelPaymentRequest(req.id); toast.success('تم الإلغاء'); }
                        catch (e: any) { toast.error(e.message); }
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
                        catch (e: any) { toast.error(e.message); }
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
    </>
  );
}
