/**
 * Every money event on a project, newest first, for the ledger's timeline.
 *
 * A paid request that produced its own expense is represented by that
 * expense and not listed a second time; a cash refund on an advance is an
 * inflow. The section's test pins the count so a double-count shows.
 */
import { formatCurrency } from '@/lib/finance';
import {
  FUND_STATUS_LABELS,
  SETTLEMENT_STATUS_LABELS,
  PAYMENT_REQUEST_TYPE_LABELS,
  type Custody,
  type Expense,
  type FundSettlement,
  type PaymentRequest,
  type ProjectFund,
  type Resource,
  type ResourceSettlement,
} from '@/types/project';

export type TimelineEvent = {
  id: string;
  date: string;
  type: 'fund' | 'custody' | 'expense' | 'payment_request' | 'settlement';
  title: string;
  subtitle?: string;
  amount: number;
  direction: 'in' | 'out' | 'neutral';
  badge?: { label: string; cls: string };
};

interface Input {
  projectId: string;
  funds: ProjectFund[];
  custodies: Custody[];
  expenses: Expense[];
  payReqs: PaymentRequest[];
  settlements: FundSettlement[];
  resourceSettlements: ResourceSettlement[];
  resources: Resource[];
  /** expense.id -> the paid request that produced it. */
  expenseToPayReq: Map<string, PaymentRequest>;
}

export function buildLedgerTimeline({
  projectId, funds, custodies, expenses, payReqs, settlements, resourceSettlements, resources, expenseToPayReq,
}: Input): TimelineEvent[] {
  const evs: TimelineEvent[] = [];
  funds.forEach((f) => evs.push({
    id: `f-${f.id}`, date: f.transferDate || f.createdAt,
    type: 'fund', title: `دفعة #${f.fundNumber} — ${FUND_STATUS_LABELS[f.status]}`,
    subtitle: f.notes, amount: f.amount, direction: 'in',
    badge: { label: 'دفعة', cls: 'bg-primary/15 text-primary' },
  }));
  custodies.forEach((c) => {
    const sf = funds.find((f) => f.id === c.sourceFundId);
    evs.push({
      id: `c-${c.id}`, date: c.receivedDate || c.createdAt,
      type: 'custody', title: `عهدة لـ ${c.resourceName}`,
      subtitle: sf ? `من دفعة #${sf.fundNumber}` : 'غير مربوطة بدفعة',
      amount: c.amount, direction: 'out',
      badge: { label: 'سحب عهدة', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
    });
  });
  expenses.forEach((e) => {
    const pr = expenseToPayReq.get(e.id);
    const r = resources.find((x) => x.id === e.resourceId);
    const cu = e.custodyId ? custodies.find((c) => c.id === e.custodyId) : null;
    const subtitle = pr
      ? `طلب صرف ${PAYMENT_REQUEST_TYPE_LABELS[pr.requestType]}${r ? ` — ${r.name}` : ''}`
      : cu ? `من عهدة ${cu.resourceName}` : e.fundId ? 'مباشر من الدفعة' : 'غير مربوط';
    evs.push({
      id: `e-${e.id}`, date: e.date,
      type: 'expense', title: e.description,
      subtitle, amount: e.amount, direction: 'out',
      badge: pr
        ? { label: 'من طلب صرف', cls: 'bg-violet-500/15 text-violet-700 dark:text-violet-400' }
        : cu
          ? { label: 'من عهدة', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' }
          : { label: 'مباشر', cls: 'bg-primary/15 text-primary' },
    });
  });
  payReqs.filter((p) => p.status === 'paid').forEach((p) => {
    // إن كان له expense تلقائي، فلا نُكرّره كحدث مالي (الـexpense يمثّله) — نضيفه فقط بدون مبلغ
    if (p.autoCreatedExpenseId) return;
    const r = resources.find((x) => x.id === p.resourceId);
    evs.push({
      id: `pr-${p.id}`, date: p.paidDate || p.updatedAt,
      type: 'payment_request',
      title: `صرف ${PAYMENT_REQUEST_TYPE_LABELS[p.requestType]}${r ? ` لـ ${r.name}` : ''}`,
      subtitle: p.description, amount: p.amount, direction: 'out',
      badge: { label: 'طلب صرف', cls: 'bg-violet-500/15 text-violet-700 dark:text-violet-400' },
    });
  });
  // ردود نقدية للسلف (cash_refund) — تظهر كحركة inflow في السجل
  payReqs
    .filter((p) => p.requestType === 'advance' && (p.refundedAmount ?? 0) > 0)
    .forEach((p) => {
      const r = resources.find((x) => x.id === p.resourceId);
      evs.push({
        id: `rf-${p.id}`,
        date: p.advanceSettledAt || p.updatedAt,
        type: 'payment_request',
        title: `رد سلفة نقدية${r ? ` من ${r.name}` : ''}`,
        subtitle: p.isAdvanceOutstanding
          ? `رد جزئي — متبقي ${formatCurrency(Math.max(p.amount - (p.refundedAmount ?? 0), 0))}`
          : 'رد كامل',
        amount: p.refundedAmount ?? 0,
        direction: 'in',
        badge: { label: 'رد سلفة', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
      });
    });
  settlements.filter((s) => s.projectId === projectId).forEach((st) => evs.push({
    id: `s-${st.id}`, date: st.settlementDate || st.createdAt,
    type: 'settlement',
    title: `تسوية دفعة — ${SETTLEMENT_STATUS_LABELS[st.status]}`,
    subtitle: `مصروف ${formatCurrency(st.totalSpent)} · متبقي ${formatCurrency(st.remainingCash)}`,
    amount: st.totalSpent, direction: 'neutral',
    badge: { label: 'تسوية', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  }));
  resourceSettlements.filter((s) => s.projectId === projectId && s.status === 'signed').forEach((s) => {
    const r = resources.find((x) => x.id === s.resourceId);
    evs.push({
      id: `rs-${s.id}`, date: s.signedAt || s.updatedAt,
      type: 'settlement', title: `مخالصة مورد${r ? ` — ${r.name}` : ''}`,
      subtitle: `إجمالي ${formatCurrency(s.totalOwed)}`,
      amount: s.totalOwed, direction: 'neutral',
      badge: { label: 'مخالصة', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
    });
  });
  return evs.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}
