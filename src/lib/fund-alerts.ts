/**
 * lib/fund-alerts.ts — نظام التنبيهات الذكية لإدارة الصرفيات
 */
import type {
  ProjectFund,
  FundSettlement,
  Expense,
  Custody,
  PaymentRequest,
  CashTransfer,
  FundAlert,
} from '@/types/project';
import {
  getFundRemaining,
  getFundSpent,
  getProjectFundsSummary,
  daysBetween,
  getSettlementForFund,
} from './funds';

const UNSETTLED_DAYS_THRESHOLD = 30;
const LOW_BALANCE_RATIO = 0.1;
const UNEXPLAINED_DIFF_TOLERANCE = 1; // ريال

/**
 * يولّد قائمة التنبيهات النشطة لمشروع.
 */
export function generateFundAlerts(
  projectId: string,
  funds: ProjectFund[],
  settlements: FundSettlement[],
  expenses: Expense[],
  custodies: Custody[] = [],
  paymentRequests: PaymentRequest[] = [],
  cashTransfers: CashTransfer[] = [],
): FundAlert[] {
  const alerts: FundAlert[] = [];
  const projectFunds = funds.filter((f) => f.projectId === projectId);
  const projectExpenses = expenses.filter((e) => e.projectId === projectId);
  const projectCustodies = custodies.filter((c) => c.projectId === projectId);
  const projectPRs = paymentRequests.filter((p) => p.projectId === projectId);
  const projectTransfers = cashTransfers.filter((t) => t.projectId === projectId);


  // التنبيه 1: دفعة بدون تسوية تجاوزت 30 يوماً
  for (const fund of projectFunds) {
    if (fund.status === 'acknowledged' || fund.status === 'transferred') {
      const refDate = fund.acknowledgedAt || fund.transferDate;
      const days = daysBetween(refDate);
      if (days >= UNSETTLED_DAYS_THRESHOLD) {
        alerts.push({
          id: `unsettled-${fund.id}`,
          type: 'unsettled_long',
          severity: 'high',
          title: 'دفعة بانتظار التسوية',
          message: `دفعة رقم ${fund.fundNumber} بمبلغ ${fund.amount.toLocaleString('en-US')} لم تُسوَّ منذ ${days} يوماً`,
          projectId,
          fundId: fund.id,
        });
      }
    }
  }

  // التنبيه 2: رصيد منخفض في يد المدير
  const summary = getProjectFundsSummary(projectId, funds, settlements, projectExpenses);
  const lastFund = projectFunds.reduce<ProjectFund | null>(
    (latest, f) => (!latest || f.fundNumber > latest.fundNumber ? f : latest),
    null,
  );
  if (lastFund && lastFund.amount > 0) {
    const ratio = summary.remainingInManagerHand / lastFund.amount;
    if (ratio < LOW_BALANCE_RATIO && ratio > 0) {
      alerts.push({
        id: `low-balance-${projectId}`,
        type: 'low_balance',
        severity: 'high',
        title: 'رصيد منخفض في يد المدير',
        message: `المتبقي ${Math.round(summary.remainingInManagerHand).toLocaleString('en-US')} ريال (أقل من 10% من آخر دفعة)`,
        projectId,
        actionLabel: 'إرسال دفعة',
      });
    }
  }

  // التنبيه 3: محاولة إنشاء دفعة قبل تسوية السابقة (سيتم إظهاره من واجهة الإنشاء — هنا نُرجع علامة)
  // (يُتعامل معها في UI من خلال createFund — لكن نضيف بطاقة تذكير إن وُجدت دفعة غير مسوّاة)
  if (summary.unsettledFunds.length > 0) {
    const f = summary.unsettledFunds[0];
    if (f.status === 'transferred') {
      // هذه الدفعة لم يُقَرّ بها بعد
      alerts.push({
        id: `awaiting-ack-${f.id}`,
        type: 'unsettled_block',
        severity: 'medium',
        title: 'دفعة بانتظار الإقرار',
        message: `الدفعة رقم ${f.fundNumber} لم يُقَرّ باستلامها بعد`,
        projectId,
        fundId: f.id,
      });
    }
  }

  // التنبيه 4: مصروفات بدون fund_id
  if (summary.activeFund) {
    const unlinked = projectExpenses.filter(
      (e) => !e.fundId && e.approvalStatus !== 'rejected',
    );
    if (unlinked.length > 0) {
      alerts.push({
        id: `unlinked-${projectId}`,
        type: 'expense_unlinked',
        severity: 'medium',
        title: 'مصروفات غير مرتبطة بدفعة',
        message: `${unlinked.length} مصروف غير مرتبط بأي دفعة — راجع المصروفات`,
        projectId,
      });
    }
  }

  // التنبيه 5: فرق غير مبرر في تسوية مُرسلة/معتمدة
  for (const st of settlements) {
    if (st.projectId !== projectId) continue;
    if (st.status === 'submitted' || st.status === 'approved') {
      if (
        Math.abs(st.difference) > UNEXPLAINED_DIFF_TOLERANCE &&
        !st.differenceReason
      ) {
        const fund = projectFunds.find((f) => f.id === st.fundId);
        alerts.push({
          id: `diff-${st.id}`,
          type: 'unexplained_diff',
          severity: 'high',
          title: 'فرق غير مبرر في التسوية',
          message: `تسوية الدفعة رقم ${fund?.fundNumber ?? '?'} تحتوي فرقاً: ${Math.round(st.difference).toLocaleString('en-US')} ريال`,
          projectId,
          settlementId: st.id,
          fundId: st.fundId,
        });
      }
    }
  }

  // ترتيب حسب الخطورة
  const order: Record<FundAlert['severity'], number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}

/**
 * تنبيه واحد فحص قبل إنشاء دفعة (يُستخدم في الـ UI لمنع الإنشاء).
 */
export function canCreateNewFund(
  projectId: string,
  funds: ProjectFund[],
): { allowed: boolean; reason?: string; blockingFundNumber?: number } {
  const projectFunds = funds.filter((f) => f.projectId === projectId);
  const unsettled = projectFunds.find((f) => f.status !== 'settled');
  if (unsettled) {
    return {
      allowed: false,
      reason: `لا يمكن اعتماد دفعة جديدة قبل تسوية الدفعة رقم ${unsettled.fundNumber}`,
      blockingFundNumber: unsettled.fundNumber,
    };
  }
  return { allowed: true };
}
