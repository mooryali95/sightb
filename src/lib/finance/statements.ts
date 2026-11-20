/**
 * The three statements, for any scope (a project, a portfolio, the company)
 * and any period, built only on the single-source rules in summary.ts:
 *
 *   - incomeStatement: accrual basis. Revenue is what was billed in the
 *     period (by invoice date), direct cost the counted expenses dated in it.
 *     At company scope the company's own spend counts less the shares a
 *     project already paid from its own spend (companyOwnCost): those are in
 *     the projects' direct cost. companyNet counts the expense whole, so this
 *     line can be lower than the company page's «مصاريف المنظومة».
 *   - cashFlowStatement: cash basis, direct method (IAS 7). What was collected
 *     (on its collection date, or the revenue's date when none was recorded,
 *     as the dashboard does) and what was paid, advances still outstanding
 *     included, month by month, with the running balance.
 *   - receivablesAging: billed and not collected, by how long it has waited.
 *
 * A period is inclusive ISO dates. Revenue and direct cost add up across
 * projects: the reconciliation test pins it.
 */
import { getBilledRevenue, getCashExpenses, getCollectedRevenue, getCountedExpenses, getOutstandingInvoiced } from './summary';
import type { CompanyExpense, ExpenseAllocation, IntercompanyEntry } from './company-ledger';
import type { Commitment, Expense, Revenue } from '@/types/project';

export interface Period { from: string; to: string }
const r2 = (n: number) => Math.round(n * 100) / 100;
const within = (d: string | undefined, p: Period) => !!d && d >= p.from && d <= p.to;
const billedOn = (r: Revenue) => r.invoiceDate || r.date;

export interface Dated { date: string; amount: number }

export interface IncomeStatement {
  revenue: number;
  directCost: number;
  grossProfit: number;
  /** % of revenue, null without revenue. */
  grossMargin: number | null;
  /** The company's own spend in the period (company scope only; 0 for a project). */
  companyCost: number;
  indirectCost: number;
  netProfit: number;
  netMargin: number | null;
}

export function incomeStatement(input: {
  revenues: Revenue[]; expenses: Expense[];
  companyExpenses?: Dated[];
  indirect?: Dated[];
}, period: Period): IncomeStatement {
  const revenue = r2(getBilledRevenue(input.revenues.filter((r) => within(billedOn(r), period))));
  const directCost = r2(getCountedExpenses(input.expenses).filter((e) => within(e.date, period)).reduce((s, e) => s + e.amount, 0));
  const companyCost = r2((input.companyExpenses ?? []).filter((e) => within(e.date, period)).reduce((s, e) => s + e.amount, 0));
  const indirectCost = r2((input.indirect ?? []).filter((e) => within(e.date, period)).reduce((s, e) => s + e.amount, 0));
  const grossProfit = r2(revenue - directCost);
  const netProfit = r2(grossProfit - companyCost - indirectCost);
  const pct = (n: number) => (revenue > 0 ? r2((n / revenue) * 100) : null);
  return { revenue, directCost, grossProfit, grossMargin: pct(grossProfit), companyCost, indirectCost, netProfit, netMargin: pct(netProfit) };
}

export interface CashMonth { month: string; inflow: number; outflow: number; net: number; balance: number }

/** Months from period.from to period.to, inclusive, as YYYY-MM. */
export function monthsOf(p: Period): string[] {
  const out: string[] = [];
  let [y, m] = p.from.slice(0, 7).split('-').map(Number);
  const [ty, tm] = p.to.slice(0, 7).split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

export function cashFlowStatement(input: {
  revenues: Revenue[]; expenses: Expense[];
  /** Cash in from outside the scope's operations (funding, loans), dated. */
  otherIn?: Dated[];
  otherOut?: Dated[];
  opening?: number;
}, period: Period): CashMonth[] {
  let balance = input.opening ?? 0;
  const paid = getCashExpenses(input.expenses);
  return monthsOf(period).map((month) => {
    const inMonth = (d: string | undefined) => !!d && d.slice(0, 7) === month && within(d, period);
    const collected = getCollectedRevenue(input.revenues.filter((r) => inMonth(r.collectionDate || r.date)));
    const inflow = r2(collected + (input.otherIn ?? []).filter((x) => inMonth(x.date)).reduce((s, x) => s + x.amount, 0));
    const outflow = r2(paid.filter((e) => inMonth(e.date)).reduce((s, e) => s + e.amount, 0)
      + (input.otherOut ?? []).filter((x) => inMonth(x.date)).reduce((s, x) => s + x.amount, 0));
    const net = r2(inflow - outflow);
    balance = r2(balance + net);
    return { month, inflow, outflow, net, balance };
  });
}

export type AgingBucket = '0-30' | '31-60' | '61-90' | '90+';
export const AGING_BUCKETS: AgingBucket[] = ['0-30', '31-60', '61-90', '90+'];

export function receivablesAging(revenues: Revenue[], today: string): { bucket: AgingBucket; amount: number; count: number }[] {
  const open = revenues.filter((r) => r.status === 'invoiced');
  const days = (d: string) => Math.floor((Date.parse(today) - Date.parse(d)) / 86_400_000);
  const bucketOf = (d: number): AgingBucket => (d <= 30 ? '0-30' : d <= 60 ? '31-60' : d <= 90 ? '61-90' : '90+');
  return AGING_BUCKETS.map((bucket) => {
    const rows = open.filter((r) => bucketOf(days(billedOn(r))) === bucket);
    return { bucket, amount: r2(getOutstandingInvoiced(rows)), count: rows.length };
  });
}

/**
 * The company's own cost, dated: each company expense less the shares a
 * project already paid from its own spend (settledInProject). Those are in
 * the projects' direct cost, so counting them here too would count them twice.
 */
export function companyOwnCost(expenses: CompanyExpense[], allocations: ExpenseAllocation[]): Dated[] {
  return expenses.map((e) => ({
    date: e.date,
    // Never below zero: shares settled past the amount are a data fault the
    // integrity card names (allocation_over), not extra profit.
    amount: Math.max(0, r2(e.amount - allocations.filter((a) => a.expenseId === e.id && a.settledInProject).reduce((s, a) => s + a.amount, 0))),
  }));
}

/**
 * The company's own cost that left as cash on the expense's date. A bill
 * someone paid from their pocket (paidByPartyId) cost the company no cash
 * that day: the cash leaves when the company repays them, and that ledger
 * movement is already in partyCash. Counting both counted it twice.
 */
export function companyCashCost(expenses: CompanyExpense[], allocations: ExpenseAllocation[]): Dated[] {
  return companyOwnCost(expenses.filter((e) => !e.paidByPartyId), allocations);
}

/**
 * Cash that crossed the company's edge through its ledger: anything from a
 * party (a loan in, a repayment in) and anything to a party. Movements
 * between the company and its projects stay inside, so they are left out.
 */
export function partyCash(entries: IntercompanyEntry[]): { in: Dated[]; out: Dated[] } {
  return {
    in: entries.filter((e) => e.from.kind === 'party' && e.to.kind !== 'party').map((e) => ({ date: e.date, amount: e.amount })),
    out: entries.filter((e) => e.to.kind === 'party' && e.from.kind !== 'party').map((e) => ({ date: e.date, amount: e.amount })),
  };
}

/** What is still out or promised: advances not yet settled, and contracted work not yet paid. */
export function obligations(expenses: Expense[], commitments: Commitment[]): { advances: number; advanceCount: number; commitments: number; commitmentCount: number } {
  const adv = expenses.filter((e) => e.isOutstandingAdvance && e.approvalStatus !== 'rejected');
  const open = commitments.filter((c) => c.status === 'active' && c.totalAmount > c.spentAmount);
  return {
    advances: r2(adv.reduce((s, e) => s + e.amount, 0)), advanceCount: adv.length,
    commitments: r2(open.reduce((s, c) => s + (c.totalAmount - c.spentAmount), 0)), commitmentCount: open.length,
  };
}

/** The period presets of the statements screen, ending today. */
export type Span = 'ytd' | 'quarter' | 'month' | '12m';

export function periodOf(span: Span, today: string): Period {
  const [y, m] = today.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  if (span === 'month') return { from: `${y}-${pad(m)}-01`, to: today };
  if (span === 'quarter') return { from: `${y}-${pad(Math.floor((m - 1) / 3) * 3 + 1)}-01`, to: today };
  if (span === '12m') {
    const start = new Date(Date.UTC(y, m - 12, 1));
    return { from: `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}-01`, to: today };
  }
  return { from: `${y}-01-01`, to: today };
}

/**
 * For a set of projects (one project, a portfolio): what the company charged
 * them and they have not already paid themselves, dated as the expense. It
 * is cost on top of their direct spend, as chargedCostTotals counts it.
 */
export function chargedToProjects(expenses: CompanyExpense[], allocations: ExpenseAllocation[], projectIds: Set<string>): Dated[] {
  const dateOf = new Map(expenses.map((e) => [e.id, e.date]));
  return allocations
    .filter((a) => projectIds.has(a.projectId) && !a.settledInProject && dateOf.has(a.expenseId))
    .map((a) => ({ date: dateOf.get(a.expenseId)!, amount: a.amount }));
}

/** Ledger cash crossing the edge of a set of projects: funding in, repayments out. Moves inside the set are left out. */
export function projectsCash(entries: IntercompanyEntry[], projectIds: Set<string>): { in: Dated[]; out: Dated[] } {
  const inside = (n: IntercompanyEntry['from']) => n.kind === 'project' && !!n.id && projectIds.has(n.id);
  return {
    in: entries.filter((e) => inside(e.to) && !inside(e.from)).map((e) => ({ date: e.date, amount: e.amount })),
    out: entries.filter((e) => inside(e.from) && !inside(e.to)).map((e) => ({ date: e.date, amount: e.amount })),
  };
}
