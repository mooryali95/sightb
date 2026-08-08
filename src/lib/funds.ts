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
  CashTransfer,
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
 * مجموع التحويلات النقدية الصادرة من دفعة (مدير → عهدة).
 * هذه التحويلات تُنقص "النقد بيد المدير" المرتبط بالدفعة وتزيد رصيد العهدة.
 */
export function getFundCashTransfersOut(
  fundId: string,
  cashTransfers: CashTransfer[] = [],
): number {
  return cashTransfers
    .filter((t) => t.fromFundId === fundId)
    .reduce((s, t) => s + t.amount, 0);
}

/**
 * مجموع التحويلات النقدية الواردة لعهدة محددة (إضافة لرصيدها بعد إنشائها).
 */
export function getCustodyCashTransfersIn(
  custodyId: string,
  cashTransfers: CashTransfer[] = [],
): number {
  return cashTransfers
    .filter((t) => t.toCustodyId === custodyId)
    .reduce((s, t) => s + t.amount, 0);
}

/**
 * SSOT: التفصيل الوحيد المعتمد لرصيد العهدة.
 * كل شاشة تعرض "متبقي العهدة" أو "نسبة الصرف" يجب أن تستهلك هذه الدالة.
 *
 *   المتاح  = المبلغ الأساسي + التحويلات النقدية الواردة
 *   المتبقي = المتاح − المصروف المعتمد − السلف القائمة من العهدة
 */
export interface CustodyBreakdown {
  custodyId: string;
  baseAmount: number;        // مبلغ العهدة عند الإنشاء
  transfersIn: number;       // نقد وارد لاحقاً من دفعات
  availableAmount: number;   // الإجمالي المتاح
  spent: number;             // مصروفات مرتبطة (غير المرفوضة)
  outstandingAdvances: number; // سلف مدفوعة من العهدة ولم تُسوَّ
  remaining: number;
  spendPercent: number;      // على أساس المتاح
}

export function getCustodyBreakdown(
  custody: Custody,
  expenses: Expense[] = [],
  cashTransfers: CashTransfer[] = [],
  paymentRequests: PaymentRequest[] = [],
): CustodyBreakdown {
  const transfersIn = getCustodyCashTransfersIn(custody.id, cashTransfers);
  const availableAmount = custody.amount + transfersIn;
  const spent = expenses
    .filter((e) => e.custodyId === custody.id && e.approvalStatus !== 'rejected')
    .reduce((s, e) => s + e.amount, 0);
  const outstandingAdvances = getCustodyOutstandingAdvances(custody.id, paymentRequests);
  const remaining = availableAmount - spent - outstandingAdvances;
  return {
    custodyId: custody.id,
    baseAmount: custody.amount,
    transfersIn,
    availableAmount,
    spent,
    outstandingAdvances,
    remaining,
    spendPercent: availableAmount > 0 ? ((spent + outstandingAdvances) / availableAmount) * 100 : 0,
  };
}

export function getCustodyRemaining(
  custody: Custody,
  expenses: Expense[] = [],
  cashTransfers: CashTransfer[] = [],
  paymentRequests: PaymentRequest[] = [],
): number {
  return getCustodyBreakdown(custody, expenses, cashTransfers, paymentRequests).remaining;
}



/**
 * إجمالي ما "خرج" من الدفعة = مصروف مباشر + عهد مسحوبة منها + سلف قائمة عليها + تحويلات نقدية صادرة.
 */
export function getFundSpent(
  fundId: string,
  expenses: Expense[],
  custodies: Custody[] = [],
  paymentRequests: PaymentRequest[] = [],
  cashTransfers: CashTransfer[] = [],
): number {
  return (
    getFundDirectSpent(fundId, expenses, custodies)
    + getFundCustodyDraw(fundId, custodies)
    + getFundOutstandingAdvances(fundId, paymentRequests)
    + getFundCashTransfersOut(fundId, cashTransfers)
  );
}

/**
 * SSOT: تفصيل الرصيد المتبقي للدفعة — يطابق بالضبط منطق DB trigger `check_fund_balance`.
 * كل جهة تعرض "متبقي" يجب أن تستهلك هذا الكائن (لا حسابات محلية).
 */
export interface FundRemainingBreakdown {
  amount: number;
  direct: number;
  custodyDraw: number;
  outstandingAdvances: number;
  cashTransfersOut: number;
  spent: number;
  remaining: number;
}

export function getFundRemainingBreakdown(
  fund: ProjectFund,
  expenses: Expense[],
  custodies: Custody[] = [],
  paymentRequests: PaymentRequest[] = [],
  cashTransfers: CashTransfer[] = [],
): FundRemainingBreakdown {
  const direct = getFundDirectSpent(fund.id, expenses, custodies);
  const custodyDraw = getFundCustodyDraw(fund.id, custodies);
  const outstandingAdvances = getFundOutstandingAdvances(fund.id, paymentRequests);
  const cashTransfersOut = getFundCashTransfersOut(fund.id, cashTransfers);
  const spent = direct + custodyDraw + outstandingAdvances + cashTransfersOut;
  return {
    amount: fund.amount,
    direct,
    custodyDraw,
    outstandingAdvances,
    cashTransfersOut,
    spent,
    remaining: fund.amount - spent,
  };
}

export function getFundRemaining(
  fund: ProjectFund,
  expenses: Expense[],
  custodies: Custody[] = [],
  paymentRequests: PaymentRequest[] = [],
  cashTransfers: CashTransfer[] = [],
): number {
  return fund.amount - getFundSpent(fund.id, expenses, custodies, paymentRequests, cashTransfers);
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
  cashTransfers: CashTransfer[] = [],
): ProjectFundsSummary {
  const projectFunds = funds.filter((f) => f.projectId === projectId);
  const projectCustodies = custodies.filter((c) => c.projectId === projectId);
  const projectPRs = paymentRequests.filter((p) => p.projectId === projectId);
  const projectTransfers = cashTransfers.filter((t) => t.projectId === projectId);

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
  const custodyDrawOnActive = projectCustodies
    .filter((c) => c.sourceFundId && activeFundIds.has(c.sourceFundId))
    .reduce((s, c) => s + c.amount, 0);
  const advancesOnActive = activeOrAckFunds.reduce(
    (s, f) => s + getFundOutstandingAdvances(f.id, projectPRs),
    0,
  );
  // Cash transfers drain active funds (manager handed cash to a custody).
  const transfersOutOnActive = projectTransfers
    .filter((t) => activeFundIds.has(t.fromFundId))
    .reduce((s, t) => s + t.amount, 0);
  const cashStillWithManager =
    activeFundsTotal - directSpendOnActive - custodyDrawOnActive - advancesOnActive - transfersOutOnActive;

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
 * يجمع البنود غير المسوّاة لدفعة معيّنة (عهد مفتوحة، سلف قائمة، تحويلات نقدية صادرة).
 * تُستخدم لتفسير "المتبقي" في نافذة التسوية.
 */
export interface FundOpenItems {
  openCustodies: Array<{ id: string; resourceName: string; amount: number; remaining: number }>;
  outstandingAdvances: Array<{ id: string; description: string; amount: number; refunded: number; remaining: number }>;
  cashTransfersOut: Array<{ id: string; toCustodyId: string; amount: number }>;
  totalOpen: number;
}

export function getFundOpenItems(
  fundId: string,
  custodies: Custody[] = [],
  paymentRequests: PaymentRequest[] = [],
  cashTransfers: CashTransfer[] = [],
  expenses: Expense[] = [],
): FundOpenItems {
  const openCustodies = custodies
    .filter((c) => c.sourceFundId === fundId && c.status !== 'closed')
    .map((c) => {
      const bd = getCustodyBreakdown(c, expenses, cashTransfers, paymentRequests);
      return { id: c.id, resourceName: c.resourceName, amount: bd.availableAmount, remaining: bd.remaining };
    });


  const outstandingAdvances = paymentRequests
    .filter((p) =>
      p.paidFromFundId === fundId
      && p.requestType === 'advance'
      && p.status === 'paid'
      && p.isAdvanceOutstanding === true,
    )
    .map((p) => ({
      id: p.id,
      description: p.description,
      amount: p.amount,
      refunded: p.refundedAmount ?? 0,
      remaining: Math.max(p.amount - (p.refundedAmount ?? 0), 0),
    }));

  const cashTransfersOut = cashTransfers
    .filter((t) => t.fromFundId === fundId)
    .map((t) => ({ id: t.id, toCustodyId: t.toCustodyId, amount: t.amount }));

  const totalOpen =
    openCustodies.reduce((s, c) => s + c.remaining, 0)
    + outstandingAdvances.reduce((s, a) => s + a.remaining, 0);

  return { openCustodies, outstandingAdvances, cashTransfersOut, totalOpen };
}

/**
 * يدقق بنود دفعة قبل التسوية ويُرجع قائمة بالمخالفات (روابط مزدوجة).
 * عودة فارغة = الدفعة متسقة.
 */
export interface FundLinkViolation {
  kind: 'expense_double_link' | 'payment_request_double_link';
  id: string;
  description: string;
  amount: number;
}

export function auditFundFinancialLinks(
  fundId: string,
  expenses: Expense[],
  paymentRequests: PaymentRequest[],
): FundLinkViolation[] {
  const violations: FundLinkViolation[] = [];
  expenses
    .filter((e) => e.fundId === fundId && e.custodyId)
    .forEach((e) =>
      violations.push({
        kind: 'expense_double_link',
        id: e.id,
        description: e.description,
        amount: e.amount,
      }),
    );
  paymentRequests
    .filter((p) => p.paidFromFundId === fundId && p.paidFromCustodyId)
    .forEach((p) =>
      violations.push({
        kind: 'payment_request_double_link',
        id: p.id,
        description: p.description,
        amount: p.amount,
      }),
    );
  return violations;
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
