/**
 * lib/funds.ts — حسابات وحدة إدارة الصرفيات (Revolving Fund)
 * كل الدوال خالصة (pure) لتسهيل الاختبار وإعادة الاستخدام.
 */
import type {
  ProjectFund,
  FundSettlement,
  Expense,
} from '@/types/project';

export interface ProjectFundsSummary {
  totalTransferred: number;        // إجمالي المحوّل لهذا المشروع
  totalDocumentedSpend: number;    // إجمالي المصروف الموثق (من التسويات المعتمدة + المصروفات على دفعات نشطة)
  totalSettled: number;            // إجمالي ما تمّت تسويته (approved settlements)
  remainingInManagerHand: number;  // المتبقي في يد المدير
  activeFund: ProjectFund | null;  // الدفعة النشطة حالياً (acknowledged)
  unsettledFunds: ProjectFund[];   // دفعات غير مسوّاة
  fundCount: number;
}

/**
 * يحسب إجمالي ما صُرف من دفعة معيّنة بناءً على المصروفات المرتبطة بها.
 */
export function getFundSpent(fundId: string, expenses: Expense[]): number {
  return expenses
    .filter((e) => e.fundId === fundId && e.approvalStatus !== 'rejected')
    .reduce((s, e) => s + e.amount, 0);
}

/**
 * يحسب المتبقي من دفعة (بعد خصم المصروف الفعلي).
 */
export function getFundRemaining(fund: ProjectFund, expenses: Expense[]): number {
  return fund.amount - getFundSpent(fund.id, expenses);
}

/**
 * يبحث عن الدفعة النشطة (acknowledged) لمشروع — هذه الدفعة هي المتاحة للصرف منها.
 */
export function getActiveFund(
  projectId: string,
  funds: ProjectFund[],
): ProjectFund | null {
  const acknowledged = funds.filter(
    (f) => f.projectId === projectId && f.status === 'acknowledged',
  );
  if (acknowledged.length === 0) return null;
  // الأحدث (آخر رقم)
  return acknowledged.reduce((latest, f) =>
    f.fundNumber > latest.fundNumber ? f : latest,
  );
}

/**
 * يحسب ملخصاً لجميع دفعات المشروع.
 */
export function getProjectFundsSummary(
  projectId: string,
  funds: ProjectFund[],
  settlements: FundSettlement[],
  expenses: Expense[],
): ProjectFundsSummary {
  const projectFunds = funds.filter((f) => f.projectId === projectId);

  const totalTransferred = projectFunds.reduce((s, f) => s + f.amount, 0);

  // إجمالي ما صُرف فعلياً من جميع الدفعات (من المصروفات المرتبطة)
  const totalDocumentedSpend = expenses
    .filter((e) => e.projectId === projectId && e.fundId && e.approvalStatus !== 'rejected')
    .reduce((s, e) => s + e.amount, 0);

  const approvedSettlements = settlements.filter(
    (st) => st.projectId === projectId && st.status === 'approved',
  );
  const totalSettled = approvedSettlements.reduce((s, st) => s + st.totalSpent, 0);

  const remainingInManagerHand = totalTransferred - totalDocumentedSpend - totalSettled
    // اطرح المتبقي المسوّى من الحساب (لأنه أُعيد فعلياً)
    + approvedSettlements.reduce((s, st) => s + st.totalSpent, 0)
    - approvedSettlements.reduce((s, st) => s + st.remainingCash, 0)
    // إعادة بناء صحيحة:
    ;

  // إعادة الحساب بمنطق أوضح:
  // remaining = totalTransferred - sum(spent_on_active_funds) - sum(approved_settlements_total_spent + approved_settlements_remaining_returned)
  // المتبقي في يد المدير = ما تحوّل - ما صُرف من دفعات لم تُسوَّ بعد
  const activeOrAckFunds = projectFunds.filter(
    (f) => f.status === 'transferred' || f.status === 'acknowledged',
  );
  const cashStillWithManager = activeOrAckFunds.reduce(
    (s, f) => s + getFundRemaining(f, expenses),
    0,
  );

  const unsettledFunds = projectFunds.filter((f) => f.status !== 'settled');
  const activeFund = getActiveFund(projectId, funds);

  return {
    totalTransferred,
    totalDocumentedSpend,
    totalSettled,
    remainingInManagerHand: cashStillWithManager,
    activeFund,
    unsettledFunds,
    fundCount: projectFunds.length,
  };
}

/**
 * حالة لون الرصيد المتبقي مقارنة بآخر دفعة.
 */
export function getRemainingStatus(
  remaining: number,
  lastFundAmount: number,
): 'healthy' | 'watch' | 'critical' {
  if (lastFundAmount <= 0) return 'healthy';
  const ratio = remaining / lastFundAmount;
  if (ratio < 0.1) return 'critical';
  if (ratio < 0.3) return 'watch';
  return 'healthy';
}

/**
 * يحسب الفرق المتوقع للتسوية قبل الإرسال.
 */
export function calculateSettlementDifference(
  totalReceived: number,
  totalSpent: number,
  remainingCash: number,
): number {
  return totalReceived - totalSpent - remainingCash;
}

/**
 * عدد الأيام بين تاريخين (لحساب المدة).
 */
export function daysBetween(from: string, to: Date = new Date()): number {
  const start = new Date(from).getTime();
  const end = to.getTime();
  return Math.floor((end - start) / (1000 * 60 * 60 * 24));
}

/**
 * يُرجع التسوية المرتبطة بدفعة (إن وجدت).
 */
export function getSettlementForFund(
  fundId: string,
  settlements: FundSettlement[],
): FundSettlement | null {
  return settlements.find((st) => st.fundId === fundId) || null;
}
