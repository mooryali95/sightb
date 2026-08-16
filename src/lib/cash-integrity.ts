/**
 * cash-integrity.ts — تدقيق سلامة الترابط النقدي (SSOT).
 *
 * قاعدتان لا يجوز كسرهما:
 *   1) كل تحويل نقدي وارد لعهدة يجب أن يكون له دفعة أصل موجودة.
 *   2) أرقام العهدة (المتاح/المصروف/المتبقي) يجب أن تُشتق حصراً من:
 *        المتاح  = المبلغ الأساسي + التحويلات الواردة (ذات الأصل الصحيح)
 *        المتبقي = المتاح − المصروف المعتمد − السلف القائمة
 *
 * تُستخدم هذه الدوال في الاختبارات التلقائية وفي شاشة سجل الإصلاحات.
 */
import type {
  Custody, CashTransfer, ProjectFund, Expense, PaymentRequest,
} from '@/types/project';
import { getCustodyBreakdown } from './funds';

export interface OrphanTransfer {
  transferId: string;
  projectId: string;
  custodyId: string;
  amount: number;
  transferDate: string;
  missingFundId: string;
}

export interface CustodyMismatch {
  custodyId: string;
  field: 'available' | 'remaining';
  expected: number;
  actual: number;
  diff: number;
}

export interface CashIntegrityReport {
  orphanTransfers: OrphanTransfer[];
  custodyMismatches: CustodyMismatch[];
  /** مجموع مبالغ التحويلات اليتيمة — يمثل التضخّم الوهمي في أرصدة العهد. */
  inflatedAmount: number;
  clean: boolean;
}

export interface CashIntegrityInput {
  custodies: Custody[];
  cashTransfers: CashTransfer[];
  funds: ProjectFund[];
  expenses: Expense[];
  paymentRequests?: PaymentRequest[];
  /** فرق مسموح لتفادي ضجيج الفاصلة العائمة. */
  tolerance?: number;
}

export function findOrphanTransfers(
  cashTransfers: CashTransfer[],
  funds: ProjectFund[],
): OrphanTransfer[] {
  const fundIds = new Set(funds.map((f) => f.id));
  return cashTransfers
    .filter((t) => !fundIds.has(t.fromFundId))
    .map((t) => ({
      transferId: t.id,
      projectId: t.projectId,
      custodyId: t.toCustodyId,
      amount: t.amount,
      transferDate: t.transferDate,
      missingFundId: t.fromFundId,
    }));
}

/**
 * يتحقق أن أرقام كل عهدة مطابقة تماماً لقاعدة الربط، مع استبعاد التحويلات
 * اليتيمة من «المتاح» — أي بعد أي عملية تصحيح يجب أن يعود التقرير نظيفاً.
 */
export function auditCashIntegrity(input: CashIntegrityInput): CashIntegrityReport {
  const {
    custodies, cashTransfers, funds, expenses,
    paymentRequests = [], tolerance = 0.01,
  } = input;

  const orphanTransfers = findOrphanTransfers(cashTransfers, funds);
  const orphanIds = new Set(orphanTransfers.map((o) => o.transferId));
  const validTransfers = cashTransfers.filter((t) => !orphanIds.has(t.id));

  const custodyMismatches: CustodyMismatch[] = [];
  for (const c of custodies) {
    // الحقيقة: تُحسب من التحويلات ذات الأصل الصحيح فقط.
    const truth = getCustodyBreakdown(c, expenses, validTransfers, paymentRequests);
    // الواقع المعروض: يشمل كل التحويلات كما هي مخزّنة.
    const shown = getCustodyBreakdown(c, expenses, cashTransfers, paymentRequests);

    if (Math.abs(truth.availableAmount - shown.availableAmount) > tolerance) {
      custodyMismatches.push({
        custodyId: c.id, field: 'available',
        expected: truth.availableAmount, actual: shown.availableAmount,
        diff: shown.availableAmount - truth.availableAmount,
      });
    }
    if (Math.abs(truth.remaining - shown.remaining) > tolerance) {
      custodyMismatches.push({
        custodyId: c.id, field: 'remaining',
        expected: truth.remaining, actual: shown.remaining,
        diff: shown.remaining - truth.remaining,
      });
    }
  }

  const inflatedAmount = orphanTransfers.reduce((s, o) => s + o.amount, 0);

  return {
    orphanTransfers,
    custodyMismatches,
    inflatedAmount,
    clean: orphanTransfers.length === 0 && custodyMismatches.length === 0,
  };
}

/** يحاكي نتيجة حذف تحويل يتيم — يُستخدم لعرض «قبل/بعد» قبل تنفيذ الإصلاح. */
export function simulateRepair(
  input: CashIntegrityInput,
  transferId: string,
): { before: CashIntegrityReport; after: CashIntegrityReport } {
  const before = auditCashIntegrity(input);
  const after = auditCashIntegrity({
    ...input,
    cashTransfers: input.cashTransfers.filter((t) => t.id !== transferId),
  });
  return { before, after };
}
