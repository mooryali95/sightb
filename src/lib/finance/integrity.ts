/**
 * Data integrity: the rules that keep the money closed. Every amount has a
 * source, nothing is entered twice, every custody and fund balances, every
 * gap has its reason, and a finished project holds no cash. Each problem is
 * said in plain words, with the amount and the project it is in.
 */
import type { CashTransfer, Custody, Expense, FundSettlement, PaymentRequest, Project, ProjectFund, ResourceReimbursement, Revenue } from '@/types/project';
import { getCustodyRemaining, getFundRemaining } from '@/lib/funds';

export type IntegritySeverity = 'error' | 'warning' | 'info';

export interface IntegrityIssue {
  severity: IntegritySeverity;
  rule: 'no_source' | 'duplicate' | 'custody_over' | 'fund_over' | 'gap_no_reason' | 'cash_left_finished' | 'revenue_over_contract' | 'owed';
  projectId: string;
  text: string;
  amount: number;
}

export interface IntegrityInput {
  projects: Project[];
  expenses: Expense[];
  custodies: Custody[];
  funds: ProjectFund[];
  settlements: FundSettlement[];
  revenues: Revenue[];
  reimbursements: ResourceReimbursement[];
  paymentRequests?: PaymentRequest[];
  cashTransfers?: CashTransfer[];
  /** Effective contract value by project (original plus approved changes). */
  contractOf: (projectId: string) => number;
}

const FINISHED = ['completed', 'archived', 'cancelled'];
const r2 = (n: number) => Math.round(n * 100) / 100;

export function checkIntegrity(i: IntegrityInput): IntegrityIssue[] {
  const out: IntegrityIssue[] = [];
  const prs = i.paymentRequests ?? [];
  const transfers = i.cashTransfers ?? [];
  for (const p of i.projects) {
    const exps = i.expenses.filter((e) => e.projectId === p.id && e.approvalStatus !== 'rejected');
    const funds = i.funds.filter((f) => f.projectId === p.id);
    const custodies = i.custodies.filter((c) => c.projectId === p.id);

    // 1. Every amount has a source, once the project works with funds.
    const firstFund = funds.map((f) => f.transferDate).sort()[0];
    if (firstFund) {
      for (const e of exps) {
        if (!e.fundId && !e.custodyId && e.date >= firstFund) {
          out.push({ severity: 'error', rule: 'no_source', projectId: p.id, amount: e.amount, text: `«${e.description}» بلا مصدر: لا دفعة ولا عهدة` });
        }
      }
    }

    // 2. Nothing entered twice: same amount, day and description.
    const seen = new Map<string, number>();
    for (const e of exps) {
      const key = `${e.amount}|${e.date}|${e.description.trim()}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    for (const [key, n] of seen) {
      if (n < 2) continue;
      const [amount, date, description] = key.split('|');
      out.push({ severity: 'warning', rule: 'duplicate', projectId: p.id, amount: Number(amount) * (n - 1), text: `«${description}» مسجّل ${n} مرات بالمبلغ نفسه يوم ${date}: تأكد أنها ليست تكراراً` });
    }

    // 3. Custodies and funds never spend more than they hold.
    for (const c of custodies) {
      const left = r2(getCustodyRemaining(c, exps, transfers, prs));
      if (left < -0.005) out.push({ severity: 'error', rule: 'custody_over', projectId: p.id, amount: -left, text: `عهدة «${c.resourceName}» صُرف منها أكثر من رصيدها` });
      if (FINISHED.includes(p.status) && left > 0.005) {
        out.push({ severity: 'warning', rule: 'cash_left_finished', projectId: p.id, amount: left, text: `المشروع منتهٍ وعهدة «${c.resourceName}» فيها ${left.toLocaleString('en-US')}: سجّل صرفها أو أعدها` });
      }
    }
    for (const f of funds) {
      const left = r2(getFundRemaining(f, exps, custodies, prs, transfers));
      if (left < -0.005) out.push({ severity: 'error', rule: 'fund_over', projectId: p.id, amount: -left, text: `الدفعة رقم ${f.fundNumber} صُرف منها أكثر من مبلغها` });
      if (FINISHED.includes(p.status) && f.status !== 'settled' && left > 0.005) {
        out.push({ severity: 'warning', rule: 'cash_left_finished', projectId: p.id, amount: left, text: `المشروع منتهٍ والدفعة رقم ${f.fundNumber} فيها ${left.toLocaleString('en-US')}: سجّل صرفها أو أعدها` });
      }
    }

    // 4. A settlement gap always has its reason.
    for (const s of i.settlements.filter((x) => x.projectId === p.id && x.status === 'approved')) {
      if (Math.abs(s.difference) > 1 && !s.differenceReason?.trim()) {
        const n = funds.find((f) => f.id === s.fundId)?.fundNumber;
        out.push({ severity: 'error', rule: 'gap_no_reason', projectId: p.id, amount: Math.abs(s.difference), text: `تسوية الدفعة رقم ${n} فيها فرق بلا سبب` });
      }
    }

    // 5. Never more collected than the contract.
    const collected = r2(i.revenues.filter((r) => r.projectId === p.id && r.status === 'collected').reduce((s, r) => s + r.amount, 0));
    const contract = i.contractOf(p.id);
    if (contract > 0 && collected - contract > 1) {
      // An archived project's figures are kept as its accounts were closed: noted, not to fix.
      out.push({ severity: p.status === 'archived' ? 'info' : 'warning', rule: 'revenue_over_contract', projectId: p.id, amount: r2(collected - contract), text: `المحصّل (${collected.toLocaleString('en-US')}) أكثر من قيمة العقد (${contract.toLocaleString('en-US')})` });
    }

    // 6. What the project owes people stays in view until paid.
    for (const rb of i.reimbursements.filter((x) => x.projectId === p.id && x.status === 'approved' && !x.paymentRequestId)) {
      out.push({ severity: 'info', rule: 'owed', projectId: p.id, amount: rb.amount, text: `مستحق لم يُسدَّد: ${rb.description}` });
    }
  }
  const rank = { error: 0, warning: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || b.amount - a.amount);
}
