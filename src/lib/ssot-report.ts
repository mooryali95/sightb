/**
 * ssot-report
 * ---------------------------------------------------------------
 * مصدر واحد لبناء "تدقيق SSOT": يحسب أرقام الواجهة من البيانات الخام،
 * يفكك كل رقم إلى مكوّناته (مبالغ + تحويلات + مصروفات + سلف)،
 * ويقارنها بأرقام الخادم مع تفسير سبب أي فرق.
 *
 * تستهلكه: ServerTruthCard، شارة صحة SSOT في رأس المشروع، وملفات التصدير.
 */

import {
  getProjectFundsSummary,
  getCustodyBreakdown,
} from './funds';
import type {
  Expense, Custody, PaymentRequest, CashTransfer, ProjectFund, FundSettlement,
  ChangeOrder, Revenue,
} from '@/types/project';

/** فرق أقل من هللة واحدة ليس اختلافاً حقيقياً. */
export const SSOT_TOLERANCE = 0.01;

export type SsotKey =
  | 'totalActualExpenses'
  | 'totalTransferredFunds'
  | 'outstandingAdvances'
  | 'totalCustodyDraw'
  | 'custodyInHand'
  | 'remainingFunds'
  | 'profit';

export const SSOT_LABELS: Record<SsotKey, string> = {
  totalActualExpenses: 'إجمالي المصروفات الفعلية',
  totalTransferredFunds: 'إجمالي الدفعات المحوّلة',
  outstandingAdvances: 'السلف القائمة',
  totalCustodyDraw: 'المسحوب للعُهد',
  custodyInHand: 'النقد بيد مستلمي العُهد',
  remainingFunds: 'المتبقي من الدفعات',
  profit: 'الربح المتوقع',
};

export interface SsotComponent {
  label: string;
  value: number;
  /** مصدر الرقم: جدول أو دالة */
  source: string;
  /** إشارة الجمع في المعادلة */
  sign: '+' | '−' | '=';
}

export interface SsotFigure {
  key: SsotKey;
  label: string;
  value: number;
  formula: string;
  components: SsotComponent[];
}

export interface SsotAuditInput {
  projectId: string;
  contractValue: number;
  expenses: Expense[];
  custodies: Custody[];
  paymentRequests: PaymentRequest[];
  cashTransfers: CashTransfer[];
  funds: ProjectFund[];
  settlements: FundSettlement[];
  changeOrders: ChangeOrder[];
}

const sum = (arr: number[]) => arr.reduce((s, n) => s + n, 0);

/**
 * يبني أرقام الواجهة مع تفكيك كل رقم لمكوّناته.
 */
export function buildSsotAudit(input: SsotAuditInput): Record<SsotKey, SsotFigure> {
  const {
    projectId, contractValue, expenses, custodies, paymentRequests,
    cashTransfers, funds, settlements, changeOrders,
  } = input;

  const pExpenses = expenses.filter((e) => e.projectId === projectId);
  const approved = pExpenses.filter((e) => e.approvalStatus !== 'rejected');
  const rejected = pExpenses.filter((e) => e.approvalStatus === 'rejected');
  const pFunds = funds.filter((f) => f.projectId === projectId);
  const activeFunds = pFunds.filter((f) => f.status === 'transferred' || f.status === 'acknowledged');
  const pTransfers = cashTransfers.filter((t) => t.projectId === projectId);
  const activeCustodies = custodies.filter((c) => c.projectId === projectId && c.status === 'active');

  const fundsSummary = getProjectFundsSummary(
    projectId, funds, settlements, expenses, custodies, paymentRequests, cashTransfers,
  );

  const approvedCO = changeOrders.filter((c) => c.projectId === projectId && c.status === 'approved');
  const approvedCOImpact = sum(approvedCO.map((c) => c.amountImpact));

  const totalActual = sum(approved.map((e) => e.amount));

  const allOutstandingAdvances = paymentRequests.filter(
    (p) => p.projectId === projectId && p.requestType === 'advance'
      && p.status === 'paid' && p.isAdvanceOutstanding === true,
  );


  const custodyRows = activeCustodies.map((c) =>
    getCustodyBreakdown(c, expenses, cashTransfers, paymentRequests));
  const custodyInHand = sum(custodyRows.map((r) => r.remaining));

  const activeFundIds = new Set(activeFunds.map((f) => f.id));
  const transfersOutOnActive = sum(
    pTransfers.filter((t) => activeFundIds.has(t.fromFundId)).map((t) => t.amount));

  const figures: Record<SsotKey, SsotFigure> = {
    totalActualExpenses: {
      key: 'totalActualExpenses',
      label: SSOT_LABELS.totalActualExpenses,
      value: totalActual,
      formula: "Σ expenses.amount WHERE approval_status <> 'rejected'",
      components: [
        { label: `مصروفات معتمدة/قيد المراجعة (${approved.length})`, value: totalActual, source: 'expenses', sign: '+' },
        { label: `مصروفات مرفوضة مستبعدة (${rejected.length})`, value: sum(rejected.map((e) => e.amount)), source: 'expenses', sign: '−' },
      ],
    },
    totalTransferredFunds: {
      key: 'totalTransferredFunds',
      label: SSOT_LABELS.totalTransferredFunds,
      value: fundsSummary.totalTransferred,
      formula: 'Σ project_funds.amount',
      components: pFunds.map((f) => ({
        label: `دفعة #${f.fundNumber} (${f.status})`,
        value: f.amount,
        source: 'project_funds',
        sign: '+' as const,
      })),
    },
    outstandingAdvances: {
      key: 'outstandingAdvances',
      label: SSOT_LABELS.outstandingAdvances,
      // نطاق المشروع بالكامل (مدفوعة من الدفعات أو من العهد) — مطابق لدالة الخادم
      value: sum(allOutstandingAdvances.map((p) => Math.max(p.amount - (p.refundedAmount ?? 0), 0))),
      formula: "Σ (amount − refunded_amount) WHERE request_type='advance' AND status='paid' AND is_advance_outstanding",
      components: allOutstandingAdvances.map((p) => ({
        label: `${p.description || 'سلفة'}${p.paidFromCustodyId ? ' (من عهدة)' : ''}`,
        value: Math.max(p.amount - (p.refundedAmount ?? 0), 0),
        source: 'payment_requests',
        sign: '+' as const,
      })),
    },

    totalCustodyDraw: {
      key: 'totalCustodyDraw',
      label: SSOT_LABELS.totalCustodyDraw,
      value: fundsSummary.totalCustodyDraw,
      formula: 'Σ custodies.amount WHERE source_fund_id IS NOT NULL',
      components: custodies
        .filter((c) => c.projectId === projectId && c.sourceFundId)
        .map((c) => ({ label: c.resourceName, value: c.amount, source: 'custodies', sign: '+' as const })),
    },
    custodyInHand: {
      key: 'custodyInHand',
      label: SSOT_LABELS.custodyInHand,
      value: custodyInHand,
      formula: 'Σ (custody.amount + cash_in − spent − outstanding_advances) WHERE status = active',
      components: activeCustodies.flatMap((c, i) => {
        const b = custodyRows[i];
        return [
          { label: `${c.resourceName} — المبلغ`, value: b.baseAmount, source: 'custodies', sign: '+' as const },
          { label: `${c.resourceName} — تحويلات واردة`, value: b.transfersIn, source: 'cash_transfers', sign: '+' as const },
          { label: `${c.resourceName} — مصروف`, value: b.spent, source: 'expenses', sign: '−' as const },
          { label: `${c.resourceName} — سلف قائمة`, value: b.outstandingAdvances, source: 'payment_requests', sign: '−' as const },
        ];
      }),
    },
    remainingFunds: {
      key: 'remainingFunds',
      label: SSOT_LABELS.remainingFunds,
      value: fundsSummary.remainingInManagerHand,
      formula: 'Σ active_funds − direct_spend − custody_draw − outstanding_advances − cash_transfers_out',
      components: [
        { label: 'دفعات نشطة (محوّلة/مستلمة)', value: sum(activeFunds.map((f) => f.amount)), source: 'project_funds', sign: '+' },
        { label: 'مصروف مباشر من الدفعات', value: fundsSummary.totalDocumentedSpend, source: 'expenses', sign: '−' },
        { label: 'مسحوب للعُهد', value: fundsSummary.totalCustodyDraw, source: 'custodies', sign: '−' },
        { label: 'سلف قائمة', value: fundsSummary.totalOutstandingAdvances, source: 'payment_requests', sign: '−' },
        { label: 'تحويلات نقدية صادرة', value: transfersOutOnActive, source: 'cash_transfers', sign: '−' },
      ],
    },
    profit: {
      key: 'profit',
      label: SSOT_LABELS.profit,
      value: contractValue + approvedCOImpact - totalActual,
      formula: 'contract_value + approved_change_orders − actual_expenses',
      components: [
        { label: 'قيمة العقد', value: contractValue, source: 'projects', sign: '+' },
        { label: `أوامر تغيير معتمدة (${approvedCO.length})`, value: approvedCOImpact, source: 'change_orders', sign: '+' },
        { label: 'المصروفات الفعلية', value: totalActual, source: 'expenses', sign: '−' },
      ],
    },
  };

  return figures;
}

export interface SsotReconRow {
  key: SsotKey;
  label: string;
  serverValue: number;
  clientValue: number;
  diff: number;
  mismatch: boolean;
  formula: string;
  components: SsotComponent[];
  /** شرح مبسّط لسبب الفرق إن وجد */
  reason: string | null;
}

const REASONS: Record<SsotKey, string> = {
  totalActualExpenses: 'غالباً مصروف أُضيف/عُدّل بعد آخر حساب على الخادم، أو مصروف مرفوض احتُسب في أحد الجانبين.',
  totalTransferredFunds: 'قد تكون دفعة أُنشئت أو غُيّرت حالتها ولم تُحمّل بعد في المتصفح.',
  outstandingAdvances: 'سلفة سُوّيت (settlement_events) دون تحديث الحالة محلياً، أو مبلغ مُعاد جزئياً.',
  totalCustodyDraw: 'عهدة أُنشئت من دفعة أو حُذفت ولم تنعكس محلياً.',
  custodyInHand: 'تحويل نقدي وارد للعهدة أو مصروف عهدة غير محمّل في المتصفح.',
  remainingFunds: 'أحد مكوّنات المعادلة (مصروف/عهدة/سلفة/تحويل) مختلف — راجع البنود أعلاه لتحديد المكوّن.',
  profit: 'فرق ناتج عن اختلاف المصروفات الفعلية أو أوامر التغيير المعتمدة.',
};

export function buildReconciliation(
  server: Record<string, number> & Partial<Record<SsotKey, number>>,
  audit: Record<SsotKey, SsotFigure>,
): SsotReconRow[] {
  return (Object.keys(SSOT_LABELS) as SsotKey[]).map((key) => {
    const serverValue = Number(server[key] ?? 0);
    const clientValue = audit[key].value;
    const diff = clientValue - serverValue;
    const mismatch = Math.abs(diff) > SSOT_TOLERANCE;
    return {
      key,
      label: SSOT_LABELS[key],
      serverValue,
      clientValue,
      diff,
      mismatch,
      formula: audit[key].formula,
      components: audit[key].components,
      reason: mismatch ? REASONS[key] : null,
    };
  });
}

// ── تصدير CSV ──────────────────────────────────────────────────────────────

function esc(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const line = (cells: unknown[]) => cells.map(esc).join(',');

export interface ProfitabilityInput {
  projectName: string;
  currency: string;
  contractValue: number;
  approvedChangeOrders: number;
  revenues: Revenue[];
  totalActualExpenses: number;
}

export interface SsotReportInput {
  profitability: ProfitabilityInput;
  reconciliation: SsotReconRow[];
  settlements: Array<{ label: string; status: string; totalReceived: number; totalSpent: number; remaining: number }>;
  computedAt: string | null;
}

/**
 * CSV يجمع: الربحية + التسويات + مطابقة الخادم (مع سبب كل فرق).
 */
export function buildSsotReportCSV(input: SsotReportInput): string {
  const { profitability: p } = input;
  const collected = sum(input.profitability.revenues.filter((r) => r.status === 'collected').map((r) => r.amount));
  const invoiced = sum(input.profitability.revenues
    .filter((r) => r.status === 'invoiced' || r.status === 'collected').map((r) => r.amount));
  const effectiveContract = p.contractValue + p.approvedChangeOrders;
  const profit = effectiveContract - p.totalActualExpenses;

  const rows: string[] = [];
  rows.push(line(['المشروع', p.projectName]));
  rows.push(line(['العملة', p.currency]));
  rows.push(line(['تاريخ التصدير', new Date().toISOString().split('T')[0]]));
  rows.push(line(['آخر حساب على الخادم', input.computedAt ? new Date(input.computedAt).toISOString() : 'غير متاح']));
  rows.push('');

  rows.push(line(['ملخص الربحية']));
  rows.push(line(['المؤشر', 'القيمة']));
  rows.push(line(['قيمة العقد', p.contractValue]));
  rows.push(line(['أوامر التغيير المعتمدة', p.approvedChangeOrders]));
  rows.push(line(['قيمة العقد الفعلية', effectiveContract]));
  rows.push(line(['إيراد محصّل', collected]));
  rows.push(line(['إيراد مفوتر', invoiced]));
  rows.push(line(['المصروفات الفعلية', p.totalActualExpenses]));
  rows.push(line(['الربح المتوقع', profit]));
  rows.push(line(['هامش الربح %', effectiveContract > 0 ? ((profit / effectiveContract) * 100).toFixed(2) : '0']));
  rows.push('');

  rows.push(line(['التسويات']));
  rows.push(line(['الدفعة', 'الحالة', 'المستلم', 'المصروف', 'المتبقي']));
  if (input.settlements.length === 0) rows.push(line(['—', 'لا توجد تسويات', 0, 0, 0]));
  for (const s of input.settlements) {
    rows.push(line([s.label, s.status, s.totalReceived, s.totalSpent, s.remaining]));
  }
  rows.push('');

  rows.push(line(['مطابقة الخادم']));
  rows.push(line(['البند', 'الخادم', 'الواجهة', 'الفرق', 'الحالة', 'المعادلة', 'سبب الفرق']));
  for (const r of input.reconciliation) {
    rows.push(line([
      r.label, r.serverValue, r.clientValue, r.diff,
      r.mismatch ? 'تعارض' : 'مطابق', r.formula, r.reason ?? '',
    ]));
  }
  rows.push('');

  rows.push(line(['تدقيق مصدر كل رقم']));
  rows.push(line(['البند', 'المكوّن', 'الإشارة', 'القيمة', 'المصدر']));
  for (const r of input.reconciliation) {
    for (const c of r.components) {
      rows.push(line([r.label, c.label, c.sign, c.value, c.source]));
    }
  }

  return rows.join('\n');
}

export function downloadTextFile(filename: string, content: string, mime = 'text/csv;charset=utf-8;') {
  const blob = new Blob(['\uFEFF' + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function safeFileName(name: string): string {
  return (name || 'project').replace(/[\\/:*?"<>|]/g, '_');
}
