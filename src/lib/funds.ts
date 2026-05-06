/**
 * lib/funds.ts — حسابات وحدة إدارة الصرفيات (Revolving Fund)
 * كل الدوال خالصة (pure) لتسهيل الاختبار وإعادة الاستخدام.
 */
import type {
  ProjectFund,
  FundSettlement,
  Expense,
  Custody,
} from '@/types/project';

export interface ProjectFundsSummary {
  totalTransferred: number;
  totalDocumentedSpend: number;
  totalSettled: number;
  totalCustodyDraw: number;       // مجموع العهد المسحوبة من دفعات
  remainingInManagerHand: number;
  activeFund: ProjectFund | null;
  unsettledFunds: ProjectFund[];
  fundCount: number;
}

/**
 * المصروف المباشر على دفعة (مستثنياً المصروفات داخل عهدة مسحوبة من نفس الدفعة،
 * لأن العهدة تُحتسب كاملةً كاستنزاف للدفعة).
 */
export function getFundDirectSpent(
  fundId: string,
  expenses: Expense[],
  custodies: Custody[] = [],
): number {
  return expenses
    .filter((e) => {
      if (e.fundId !== fundId || e.approvalStatus === 'rejected') return false;
      if (e.custodyId) {
        const cu = custodies.find((c) => c.id === e.custodyId);
        if (cu?.sourceFundId === fundId) return false; // مُحاسب على العهدة
      }
      return true;
    })
    .reduce((s, e) => s + e.amount, 0);
}

/**
 * مجموع مبالغ العهد المسحوبة من دفعة معيّنة.
 */
export function getFundCustodyDraw(fundId: string, custodies: Custody[]): number {
  return custodies.filter((c) => c.sourceFundId === fundId).reduce((s, c) => s + c.amount, 0);
}

/**
 * إجمالي ما "خرج" من الدفعة = مصروف مباشر + عهد مسحوبة منها.
 */
export function getFundSpent(
  fundId: string,
  expenses: Expense[],
  custodies: Custody[] = [],
): number {
  return getFundDirectSpent(fundId, expenses, custodies) + getFundCustodyDraw(fundId, custodies);
}

export function getFundRemaining(
  fund: ProjectFund,
  expenses: Expense[],
  custodies: Custody[] = [],
): number {
  return fund.amount - getFundSpent(fund.id, expenses, custodies);
}

/**
 * يبحث عن الدفعة النشطة (acknowledged) لمشروع — هذه الدفعة هي المتاحة للصرف منها.
 */
export function getActiveFund(
  projectId: string,
  funds: ProjectFund[],
): ProjectFund | null {
  // متطابق مع DB trigger enforce_expense_fund_link:
  // الدفعة "نشطة" (تتطلب الربط بها) إذا كانت transferred أو acknowledged
  const active = funds.filter(
    (f) => f.projectId === projectId && (f.status === 'acknowledged' || f.status === 'transferred'),
  );
  if (active.length === 0) return null;
  // فضّل acknowledged على transferred، ثم الأحدث
  const acknowledged = active.filter((f) => f.status === 'acknowledged');
  const pool = acknowledged.length > 0 ? acknowledged : active;
  return pool.reduce((latest, f) =>
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
export function getProjectFundsSummary(
  projectId: string,
  funds: ProjectFund[],
  settlements: FundSettlement[],
  expenses: Expense[],
  custodies: Custody[] = [],
): ProjectFundsSummary {
  const projectFunds = funds.filter((f) => f.projectId === projectId);
  const projectCustodies = custodies.filter((c) => c.projectId === projectId);

  const totalTransferred = projectFunds.reduce((s, f) => s + f.amount, 0);

  // المصروفات المربوطة بدفعة (مباشرة، غير المنطوية تحت عهدة من نفس الدفعة)
  const totalDocumentedSpend = projectFunds.reduce(
    (s, f) => s + getFundDirectSpent(f.id, expenses, projectCustodies),
    0,
  );

  const totalCustodyDraw = projectFunds.reduce(
    (s, f) => s + getFundCustodyDraw(f.id, projectCustodies),
    0,
  );

  const approvedSettlements = settlements.filter(
    (st) => st.projectId === projectId && st.status === 'approved',
  );
  const totalSettled = approvedSettlements.reduce((s, st) => s + st.totalSpent, 0);

  // المتبقي بيد المدير = مجموع المتبقي من الدفعات النشطة (بعد خصم المصروف المباشر والعهد المسحوبة)
  const activeOrAckFunds = projectFunds.filter(
    (f) => f.status === 'transferred' || f.status === 'acknowledged',
  );
  const cashStillWithManager = activeOrAckFunds.reduce(
    (s, f) => s + getFundRemaining(f, expenses, projectCustodies),
    0,
  );

  const unsettledFunds = projectFunds.filter((f) => f.status !== 'settled');
  const activeFund = getActiveFund(projectId, funds);

  return {
    totalTransferred,
    totalDocumentedSpend,
    totalSettled,
    totalCustodyDraw,
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
