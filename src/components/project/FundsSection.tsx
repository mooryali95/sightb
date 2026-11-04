import { useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { useRole } from '@/hooks/useRole';
import { formatCurrency } from '@/lib/finance';
import {
  getFundSpent,
  getFundRemaining,
  daysBetween,
  getSettlementForFund,
} from '@/lib/funds';
import { generateFundAlerts, canCreateNewFund } from '@/lib/fund-alerts';
import {
  FUND_STATUS_LABELS,
  FUND_STATUS_COLORS,
  SETTLEMENT_STATUS_LABELS,
  SETTLEMENT_STATUS_COLORS,
  type ProjectFund,
  type Expense,
} from '@/types/project';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import {
  CheckCircle2, AlertTriangle, Send, ThumbsUp, ThumbsDown, Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn, errorMessage } from '@/lib/utils';
import { CashRepairDiffCard } from '@/components/project/CashRepairDiffCard';
import { useDialogSession } from '@/hooks/useDialogSession';
import { CreateFundDialog } from './funds/CreateFundDialog';
import { EmergencyFundDialog } from './funds/EmergencyFundDialog';
import { FundSettlementDialog } from './funds/FundSettlementDialog';
import { RejectSettlementDialog } from './funds/RejectSettlementDialog';
import { FundInspector } from './funds/FundInspector';
import { TableDensityToggle } from '@/components/ui/table-density-toggle';
import { useTableDensity } from '@/hooks/useTableDensity';
import { useResponsiveTableLabels } from '@/hooks/useResponsiveTableLabels';

interface FundsSectionProps {
  projectId: string;
  expenses: Expense[];
  readOnly?: boolean;
}

export function FundsSection({ projectId, expenses, readOnly = false }: FundsSectionProps) {
  const { isAdminFor, isOwner } = useRole();
  const isAdmin = isAdminFor('project', projectId);
  const {
    projectFunds, fundSettlements, custodies, paymentRequests, cashTransfers,
    acknowledgeFund, approveSettlement, deleteFund,
  } = useStore();
  const projPRs = useMemo(
    () => paymentRequests.filter((p) => p.projectId === projectId),
    [paymentRequests, projectId],
  );
  const projTransfers = useMemo(
    () => (cashTransfers || []).filter((t) => t.projectId === projectId),
    [cashTransfers, projectId],
  );

  const projectExpenses = useMemo(
    () => expenses.filter((e) => e.projectId === projectId),
    [expenses, projectId],
  );

  const projectCustodies = useMemo(
    () => (custodies || []).filter((c) => c.projectId === projectId),
    [custodies, projectId],
  );

  const projectFundsList = useMemo(
    () => projectFunds.filter((f) => f.projectId === projectId)
      .sort((a, b) => b.fundNumber - a.fundNumber),
    [projectFunds, projectId],
  );

  const alerts = useMemo(
    () => generateFundAlerts(projectId, projectFunds, fundSettlements, projectExpenses, projectCustodies, projPRs, projTransfers),
    [projectId, projectFunds, fundSettlements, projectExpenses, projectCustodies, projPRs, projTransfers],
  );

  const canCreate = canCreateNewFund(projectId, projectFunds);
  const showCreate = isAdmin && !readOnly;

  // ───── Dialogs ─────
  // Each dialog owns its form and is remounted (via `key`) on every open, so
  // it starts from the fund as it stands at that moment. See useDialogSession.
  const settleDialog = useDialogSession<ProjectFund>();
  const rejectDialog = useDialogSession<string>();
  const inspector = useDialogSession<string>();
  const [density] = useTableDensity();
  const mobileTableRef = useResponsiveTableLabels<HTMLTableElement>();

  const handleApprove = async (settlementId: string) => {
    try {
      await approveSettlement(settlementId);
      toast.success('تم اعتماد التسوية');
    } catch (e) {
      toast.error(errorMessage(e, 'تعذّر الاعتماد'));
    }
  };

  return (
    <div className="space-y-4">
      {/* أثر آخر إصلاح لتحويل يتيم على الأرصدة */}
      <CashRepairDiffCard projectId={projectId} />

      {/* Alerts */}

      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.slice(0, 3).map((a) => (
            <div
              key={a.id}
              className={cn(
                'flex items-start gap-2 p-3 rounded-lg border text-sm',
                a.severity === 'high' || a.severity === 'critical'
                  ? 'border-destructive/30 bg-destructive/5 text-destructive'
                  : 'border-amber-300/40 bg-amber-50 text-amber-800 dark:bg-amber-900/10 dark:text-amber-300',
              )}
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">{a.title}</p>
                <p className="text-xs opacity-90">{a.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* بطاقات الملخّص أُزيلت من هنا — الملخّص الموحّد يُعرض في CashLedgerSection بأعلى نفس التبويب */}

      {/* Header + Create */}
      <div className="stat-card">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="text-sm font-semibold">سجل الدفعات</h3>
          {showCreate && <CreateFundDialog projectId={projectId} disabled={!canCreate.allowed} />}
        </div>

        {!canCreate.allowed && showCreate && (
          <div className="mb-3 p-3 rounded-md bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700/40 text-xs text-amber-800 dark:text-amber-300 space-y-2">
            <p>⚠️ {canCreate.reason}</p>
            {isAdmin && (
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-amber-200/60 dark:border-amber-700/30">
                <span className="text-xs opacity-80">للحالات الاضطرارية فقط — يُسجَّل في سجل التدقيق</span>
                <EmergencyFundDialog projectId={projectId} blockingFundNumber={canCreate.blockingFundNumber} />
              </div>
            )}
          </div>
        )}

        {projectFundsList.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            لا توجد دفعات بعد. {showCreate ? 'ابدأ بإنشاء الدفعة الأولى.' : ''}
          </p>
        ) : (
          <>
          <div className="flex justify-end mb-2"><TableDensityToggle /></div>
          <div className="data-table-wrapper data-table-wrapper--scroll">
            <table ref={mobileTableRef} className="data-table data-table--mobile-cards" data-density={density}>
              <thead>
                <tr>
                  <th className="w-12">#</th>
                  <th>المبلغ</th>
                  <th>تاريخ التحويل</th>
                  <th>الحالة</th>
                  <th>المصروف</th>
                  <th>المتبقي</th>
                  <th className="hidden md:table-cell">العمر</th>
                  <th>التسوية</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {projectFundsList.map((f) => {
                  const spent = getFundSpent(f.id, projectExpenses, projectCustodies, projPRs, projTransfers);
                  const calcRemaining = getFundRemaining(f, projectExpenses, projectCustodies, projPRs, projTransfers);
                  const settlement = getSettlementForFund(f.id, fundSettlements);
                  // إذا تمت تسوية الدفعة واعتمدت → اعرض المتبقي وفق التسوية الفعلية (لا المحسوب)
                  // هذا يمنع ظهور رصيد وهمي بيد المدير لدفعة مغلقة بسبب سلفة قائمة لم تُسوَّ بعد
                  const isClosed = f.status === 'settled' || (settlement && settlement.status === 'approved');
                  const remaining = isClosed ? 0 : calcRemaining;
                  const days = daysBetween(f.acknowledgedAt || f.transferDate);
                  const overdue = (f.status === 'transferred' || f.status === 'acknowledged') && days >= 30;
                  return (
                    <tr key={f.id}>
                      <td className="font-mono">#{f.fundNumber}</td>
                      <td className="font-mono text-sm">{formatCurrency(f.amount)}</td>
                      <td className="text-xs">{f.transferDate}</td>
                      <td>
                        <Badge className={cn('text-xs', FUND_STATUS_COLORS[f.status])}>
                          {FUND_STATUS_LABELS[f.status]}
                        </Badge>
                      </td>
                      <td className="font-mono text-xs">{formatCurrency(spent)}</td>
                      <td className={cn(
                        'font-mono text-xs',
                        remaining < 0 && 'text-destructive font-semibold',
                        isClosed && 'text-muted-foreground',
                      )}>
                        {formatCurrency(remaining)}
                      </td>

                      <td className={cn(
                        'hidden md:table-cell text-xs',
                        overdue && 'text-destructive font-semibold',
                      )}>
                        {days} يوم
                      </td>
                      <td>
                        {settlement ? (
                          <Badge className={cn('text-xs', SETTLEMENT_STATUS_COLORS[settlement.status])}>
                            {SETTLEMENT_STATUS_LABELS[settlement.status]}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => inspector.open(f.id)}
                            title="عرض التفاصيل"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          {f.status === 'transferred' && !readOnly && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1"
                              onClick={async () => {
                                try { await acknowledgeFund(f.id); toast.success('تم الإقرار بالاستلام'); }
                                catch (e) { toast.error(errorMessage(e)); }
                              }}
                            >
                              <CheckCircle2 className="w-3 h-3" /> إقرار استلام
                            </Button>
                          )}
                          {(f.status === 'acknowledged' && settlement && (settlement.status === 'draft' || settlement.status === 'rejected')) && !readOnly && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1"
                              onClick={() => settleDialog.open(f)}
                            >
                              <Send className="w-3 h-3" /> تسوية
                            </Button>
                          )}
                          {settlement && settlement.status === 'submitted' && isAdmin && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1 text-emerald-700 border-emerald-300"
                                onClick={() => handleApprove(settlement.id)}
                              >
                                <ThumbsUp className="w-3 h-3" /> اعتماد
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1 text-destructive border-destructive/30"
                                onClick={() => rejectDialog.open(settlement.id)}
                              >
                                <ThumbsDown className="w-3 h-3" /> رفض
                              </Button>
                            </>
                          )}
                          {settlement && settlement.status !== 'draft' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() => settleDialog.open(f)}
                            >
                              عرض
                            </Button>
                          )}
                          {(isOwner || isAdmin) && f.status !== 'settled' && !readOnly && (
                            <ConfirmDeleteDialog
                              title="حذف الدفعة"
                              description={(() => {
                                const linked = projectExpenses.filter((e) => e.fundId === f.id);
                                const linkedTotal = linked.reduce((s, e) => s + e.amount, 0);
                                const linkedCust = projectCustodies.filter((c) => c.sourceFundId === f.id);
                                const custTotal = linkedCust.reduce((s, c) => s + c.amount, 0);
                                const parts: string[] = [];
                                if (linked.length > 0) parts.push(`${linked.length} مصروف (${formatCurrency(linkedTotal)})`);
                                if (linkedCust.length > 0) parts.push(`${linkedCust.length} عهدة (${formatCurrency(custTotal)})`);
                                if (parts.length === 0) return `حذف الدفعة #${f.fundNumber}؟`;
                                return `حذف الدفعة #${f.fundNumber}؟ سيتم فك ربط ${parts.join(' و')} — البنود نفسها لن تُحذف.`;
                              })()}
                              onConfirm={async () => {
                                try { await deleteFund(f.id); toast.success('تم الحذف'); }
                                catch (e) { toast.error(errorMessage(e)); }
                              }}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      <FundSettlementDialog
        key={settleDialog.session}
        fund={settleDialog.value ?? undefined}
        existing={settleDialog.value ? getSettlementForFund(settleDialog.value.id, fundSettlements) ?? undefined : undefined}
        projectExpenses={projectExpenses}
        projectCustodies={projectCustodies}
        projPRs={projPRs}
        projTransfers={projTransfers}
        readOnly={readOnly}
        onClose={settleDialog.close}
      />

      <RejectSettlementDialog
        key={rejectDialog.session}
        settlementId={rejectDialog.value}
        onClose={rejectDialog.close}
      />

      <FundInspector
        fund={projectFundsList.find((x) => x.id === inspector.value)}
        settlement={inspector.value ? getSettlementForFund(inspector.value, fundSettlements) ?? undefined : undefined}
        projectExpenses={projectExpenses}
        projectCustodies={projectCustodies}
        projPRs={projPRs}
        projTransfers={projTransfers}
        onClose={inspector.close}
      />
    </div>
  );
}
