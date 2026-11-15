/**
 * The three statements, for any scope (a project, a portfolio, the company)
 * and any period, built only on the single-source rules in summary.ts:
 *
 *   - incomeStatement: accrual basis. Revenue is what was billed in the
 *     period (by invoice date), direct cost the counted expenses dated in it.
 *     At company scope the company's own spend counts whole, as companyNet
 *     counts it: charging a share to a project moves it, it does not remove it.
 *   - cashFlowStatement: cash basis, direct method (IAS 7). What was collected
 *     and what was paid, month by month, with the running balance.
 *   - receivablesAging: billed and not collected, by how long it has waited.
 *
 * A period is inclusive ISO dates. A sum across scopes equals the scopes'
 * sums: the reconciliation test pins it.
 */
import { getBilledRevenue, getCollectedRevenue, getCountedExpenses, getOutstandingInvoiced } from './summary';
import type { Expense, Revenue } from '@/types/project';

export interface Period { from: string; to: string }
const r2 = (n: number) => Math.round(n * 100) / 100;
const within = (d: string | undefined, p: Period) => !!d && d >= p.from && d <= p.to;
const billedOn = (r: Revenue) => r.invoiceDate || r.date;

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
  companyExpenses?: { date: string; amount: number }[];
  indirect?: number;
}, period: Period): IncomeStatement {
  const revenue = r2(getBilledRevenue(input.revenues.filter((r) => within(billedOn(r), period))));
  const directCost = r2(getCountedExpenses(input.expenses).filter((e) => within(e.date, period)).reduce((s, e) => s + e.amount, 0));
  const companyCost = r2((input.companyExpenses ?? []).filter((e) => within(e.date, period)).reduce((s, e) => s + e.amount, 0));
  const indirectCost = r2(input.indirect ?? 0);
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
  otherIn?: { date: string; amount: number }[];
  otherOut?: { date: string; amount: number }[];
  opening?: number;
}, period: Period): CashMonth[] {
  let balance = input.opening ?? 0;
  const counted = getCountedExpenses(input.expenses);
  return monthsOf(period).map((month) => {
    const inMonth = (d: string | undefined) => !!d && d.slice(0, 7) === month && within(d, period);
    const collected = getCollectedRevenue(input.revenues.filter((r) => inMonth(r.collectionDate)));
    const inflow = r2(collected + (input.otherIn ?? []).filter((x) => inMonth(x.date)).reduce((s, x) => s + x.amount, 0));
    const outflow = r2(counted.filter((e) => inMonth(e.date)).reduce((s, e) => s + e.amount, 0)
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
