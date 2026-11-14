/**
 * Loans through the company: a lender (the owner or anyone) lends to the
 * company, the company funds a project with it, and the money flows back the
 * same way when the project collects. Each leg is an ordinary ledger
 * movement, so balances and statements need nothing new:
 *   lender → company  advance    (the loan)
 *   company → project advance    (the funding)
 *   project → company repayment  (recovered from what the project collected)
 *   company → lender  repayment  (the loan repaid)
 */
import type { IntercompanyEntry } from './company-ledger';

const cents = (n: number) => Math.round(n * 100) / 100;

export interface Loan {
  partyId: string;
  lent: number; repaid: number; outstanding: number;
  firstDate: string;
  /** The earliest due date among the advances still open, if any. */
  dueDate: string | null;
  /** What is still owed on the advances due that day. */
  dueAmount: number;
  overdue: boolean;
}

/**
 * Repayments settle a lender's advances oldest first, so a loan with no due
 * date does not make a later, dated one look larger than it is.
 */
export function loansByLender(entries: IntercompanyEntry[], today: string): Loan[] {
  const lenders = new Map<string, { firstDate: string; open: { left: number; due: string | null }[]; lent: number; repaid: number }>();
  for (const e of [...entries].sort((a, b) => a.date.localeCompare(b.date))) {
    if (e.from.kind === 'party' && e.to.kind === 'company' && e.type === 'advance') {
      const l = lenders.get(e.from.id!) ?? { firstDate: e.date, open: [], lent: 0, repaid: 0 };
      l.lent = cents(l.lent + e.amount);
      l.open.push({ left: e.amount, due: e.dueDate });
      lenders.set(e.from.id!, l);
    } else if (e.from.kind === 'company' && e.to.kind === 'party' && lenders.has(e.to.id!)) {
      const l = lenders.get(e.to.id!)!;
      l.repaid = cents(l.repaid + e.amount);
      let pay = e.amount;
      for (const a of l.open) {
        const take = Math.min(a.left, pay);
        a.left = cents(a.left - take); pay = cents(pay - take);
        if (pay <= 0) break;
      }
    }
  }
  return [...lenders.entries()].map(([partyId, l]) => {
    const open = l.open.filter((a) => a.left > 0);
    const dated = open.filter((a) => a.due).map((a) => a.due!).sort();
    const dueDate = dated[0] ?? null;
    const dueAmount = cents(open.filter((a) => a.due === dueDate && dueDate).reduce((s, a) => s + a.left, 0));
    return {
      partyId, lent: l.lent, repaid: l.repaid, outstanding: cents(l.lent - l.repaid), firstDate: l.firstDate,
      dueDate, dueAmount, overdue: !!dueDate && dueDate < today,
    };
  }).sort((a, b) => b.outstanding - a.outstanding);
}

export interface Funding {
  projectId: string;
  funded: number; returned: number; outstanding: number;
  firstDate: string;
}

export function fundingByProject(entries: IntercompanyEntry[]): Funding[] {
  const map = new Map<string, Funding>();
  for (const e of [...entries].sort((a, b) => a.date.localeCompare(b.date))) {
    if (e.from.kind === 'company' && e.to.kind === 'project' && e.type === 'advance') {
      const f = map.get(e.to.id!) ?? { projectId: e.to.id!, funded: 0, returned: 0, outstanding: 0, firstDate: e.date };
      f.funded = cents(f.funded + e.amount);
      map.set(f.projectId, f);
    } else if (e.from.kind === 'project' && e.to.kind === 'company' && map.has(e.from.id!)) {
      const f = map.get(e.from.id!)!;
      f.returned = cents(f.returned + e.amount);
    }
  }
  return [...map.values()].map((f) => ({ ...f, outstanding: cents(f.funded - f.returned) }));
}

export interface Collected { projectId: string; amount: number; date: string }

export interface RecoveryAlert {
  projectId: string;
  /** Collected by the project since it was first funded, less what it already returned. */
  available: number;
  /** What to return now: the available cash, up to what it still owes. */
  suggested: number;
}

/**
 * A project that owes the company its funding and has collected since:
 * time to recover. The suggestion never exceeds what it owes or what it
 * collected.
 */
export function recoveryAlerts(funding: Funding[], collected: Collected[]): RecoveryAlert[] {
  const out: RecoveryAlert[] = [];
  for (const f of funding) {
    if (f.outstanding <= 0) continue;
    const since = collected.filter((c) => c.projectId === f.projectId && c.date >= f.firstDate).reduce((s, c) => s + c.amount, 0);
    const available = cents(since - f.returned);
    if (available > 0) out.push({ projectId: f.projectId, available, suggested: cents(Math.min(available, f.outstanding)) });
  }
  return out.sort((a, b) => b.suggested - a.suggested);
}

/**
 * What the company recovered from projects and has not yet passed on to its
 * lenders: offered as the repayment to the lender it owes most, first.
 */
export function lenderRepaymentDue(loans: Loan[], entries: IntercompanyEntry[]): { partyId: string; suggested: number } | null {
  const open = loans.filter((l) => l.outstanding > 0);
  if (open.length === 0) return null;
  const since = open.reduce((d, l) => (l.firstDate < d ? l.firstDate : d), open[0].firstDate);
  const lenders = new Set(loans.map((l) => l.partyId));
  let recovered = 0, passedOn = 0;
  for (const e of entries) {
    if (e.date < since) continue;
    if (e.from.kind === 'project' && e.to.kind === 'company') recovered += e.amount;
    if (e.from.kind === 'company' && e.to.kind === 'party' && lenders.has(e.to.id!)) passedOn += e.amount;
  }
  const free = cents(recovered - passedOn);
  if (free <= 0) return null;
  const first = open[0];
  return { partyId: first.partyId, suggested: cents(Math.min(free, first.outstanding)) };
}

/** A loan due within this many days is flagged before it is late. */
export const DUE_SOON_DAYS = 14;

/** Days from `today` to `date` (negative once it passed), both YYYY-MM-DD. */
export function daysUntil(date: string, today: string): number {
  return Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000);
}

/** Open loans that are late or due soon, the latest-to-pay first. */
export function dueLoans(loans: Loan[], today: string): (Loan & { days: number })[] {
  return loans
    .filter((l) => l.dueAmount > 0 && l.dueDate)
    .map((l) => ({ ...l, days: daysUntil(l.dueDate!, today) }))
    .filter((l) => l.days <= DUE_SOON_DAYS)
    .sort((a, b) => a.days - b.days);
}

/**
 * Who owes whom, in sentences anyone can read: «منظومة عليها لمحمود 80,000»,
 * «مشروع تبوك عليه لمنظومة 70,000». The largest first; the rest counted.
 */
export function plainSummary(
  balances: { name: string; owesCompany: number }[], fmt: (n: number) => string, max = 3,
): { lines: string[]; more: number } {
  const open = balances.filter((b) => Math.abs(b.owesCompany) >= 0.005)
    .sort((a, b) => Math.abs(b.owesCompany) - Math.abs(a.owesCompany));
  const lines = open.slice(0, max).map((b) => (b.owesCompany > 0
    ? `${b.name} عليه للمنظومة ${fmt(b.owesCompany)}`
    : `المنظومة عليها لـ${b.name} ${fmt(-b.owesCompany)}`));
  return { lines, more: Math.max(0, open.length - max) };
}

/** «يوم واحد», «يومين», «5 أيام», «12 يوماً». */
export function arabicDays(n: number): string {
  if (n === 1) return 'يوم واحد';
  if (n === 2) return 'يومين';
  if (n >= 3 && n <= 10) return `${n} أيام`;
  return `${n} يوماً`;
}
