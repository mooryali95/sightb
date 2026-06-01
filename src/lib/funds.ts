/**
 * lib/funds.ts — حسابات وحدة إدارة الصرفيات (Revolving Fund)
 * كل الدوال خالصة (pure) لتسهيل الاختبار وإعادة الاستخدام.
 */
import type {
  ProjectFund,
  FundSettlement,
  Expense,
  Custody,
  PaymentRequest,
} from '@/types/project';

export interface ProjectFundsSummary {
  totalTransferred: number;
  totalDocumentedSpend: number;
  totalSettled: number;
  totalCustodyDraw: number;       // مجموع العهد المسحوبة من دفعات
  totalOutstandingAdvances: number; // سلف قائمة على الموردين (محجوزة من الدفعات)
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
 * مجموع السلف القائمة (مدفوعة، لم تُسوَّ) المخصومة من دفعة معيّنة.
 * هذه السلف تُحجز من رصيد الدفعة كذمة مدينة على المورد.
 */
export function getFundOutstandingAdvances(
  fundId: string,
  paymentRequests: PaymentRequest[] = [],
): number {
  return paymentRequests
    .filter((p) =>
      p.paidFromFundId === fundId
      && p.requestType === 'advance'
      && p.status === 'paid'
      && p.isAdvanceOutstanding === true,
    )
    .reduce((s, p) => s + Math.max(p.amount - (p.refundedAmount ?? 0), 0), 0);
}

/**
 * مجموع السلف القائمة المخصومة من عهدة معيّنة (يطرح ما رُدّ منها جزئياً).
 */
export function getCustodyOutstandingAdvances(
  custodyId: string,
  paymentRequests: PaymentRequest[] = [],
): number {
  return paymentRequests
    .filter((p) =>
      p.paidFromCustodyId === custodyId
      && p.requestType === 'advance'
      && p.status === 'paid'
      && p.isAdvanceOutstanding === true,
    )
    .reduce((s, p) => s + Math.max(p.amount - (p.refundedAmount ?? 0), 0), 0);
}

/**
 * إجمالي ما "خرج" من الدفعة = مصروف مباشر + عهد مسحوبة منها + سلف قائمة عليها.
 */
export function getFundSpent(
  fundId: string,
  expenses: Expense[],
  custodies: Custody[] = [],
  paymentRequests: PaymentRequest[] = [],
): number {
  return (
    getFundDirectSpent(fundId, expenses, custodies)
    + getFundCustodyDraw(fundId, custodies)
    + getFundOutstandingAdvances(fundId, paymentRequests)
  );
}

export function getFundRemaining(
  fund: ProjectFund,
  expenses: Expense[],
  custodies: Custody[] = [],
  paymentRequests: PaymentRequest[] = [],
): number {
  return fund.amount - getFundSpent(fund.id, expenses, custodies, paymentRequests);
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

  // إعادة الحساب بمنطق أوضح:
  // remaining = totalTransferred - sum(spent_on_active_funds) - sum(approved_settlements_total_spent + approved_settlements_remaining_returned)
  // المتبقي في يد المدير = ما تحوّل - ما صُرف من دفعات لم تُسوَّ بعد
export function getProjectFundsSummary(
  projectId: string,
  funds: ProjectFund[],
  settlements: FundSettlement[],
  expenses: Expense[],
  custodies: Custody[] = [],
  paymentRequests: PaymentRequest[] = [],
): ProjectFundsSummary {
  const projectFunds = funds.filter((f) => f.projectId === projectId);
  const projectCustodies = custodies.filter((c) => c.projectId === projectId);
  const projectPRs = paymentRequests.filter((p) => p.projectId === projectId);

  const totalTransferred = projectFunds.reduce((s, f) => s + f.amount, 0);

  const totalDocumentedSpend = projectFunds.reduce(
    (s, f) => s + getFundDirectSpent(f.id, expenses, projectCustodies),
    0,
  );

  const totalCustodyDraw = projectFunds.reduce(
    (s, f) => s + getFundCustodyDraw(f.id, projectCustodies),
    0,
  );

  const totalOutstandingAdvances = projectFunds.reduce(
    (s, f) => s + getFundOutstandingAdvances(f.id, projectPRs),
    0,
  );

  const approvedSettlements = settlements.filter(
    (st) => st.projectId === projectId && st.status === 'approved',
  );
  const totalSettled = approvedSettlements.reduce((s, st) => s + st.totalSpent, 0);

  const activeOrAckFunds = projectFunds.filter(
    (f) => f.status === 'transferred' || f.status === 'acknowledged',
  );
  const activeFundIds = new Set(activeOrAckFunds.map((f) => f.id));
  const activeFundsTotal = activeOrAckFunds.reduce((s, f) => s + f.amount, 0);
  const directSpendOnActive = activeOrAckFunds.reduce(
    (s, f) => s + getFundDirectSpent(f.id, expenses, projectCustodies),
    0,
  );
  // F1 fix: only subtract custody draws sourced from currently-active funds.
  // Previously we subtracted ALL custody draws (including ones from settled funds),
  // which produced a falsely low "cash with manager" and triggered unnecessary fund issuance.
  const custodyDrawOnActive = projectCustodies
    .filter((c) => c.sourceFundId && activeFundIds.has(c.sourceFundId))
    .reduce((s, c) => s + c.amount, 0);
  const advancesOnActive = activeOrAckFunds.reduce(
    (s, f) => s + getFundOutstandingAdvances(f.id, projectPRs),
    0,
  );
  const cashStillWithManager = activeFundsTotal - directSpendOnActive - custodyDrawOnActive - advancesOnActive;

  const unsettledFunds = projectFunds.filter((f) => f.status !== 'settled');
  const activeFund = getActiveFund(projectId, funds);

  return {
    totalTransferred,
    totalDocumentedSpend,
    totalSettled,
    totalCustodyDraw,
    totalOutstandingAdvances,
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
