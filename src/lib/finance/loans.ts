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
  overdue: boolean;
}

export function loansByLender(entries: IntercompanyEntry[], today: string): Loan[] {
  const map = new Map<string, Loan>();
  const get = (id: string, date: string) => {
    const l = map.get(id) ?? { partyId: id, lent: 0, repaid: 0, outstanding: 0, firstDate: date, dueDate: null, overdue: false };
    map.set(id, l);
    return l;
  };
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  for (const e of sorted) {
    if (e.from.kind === 'party' && e.to.kind === 'company' && e.type === 'advance') {
      const l = get(e.from.id!, e.date);
      l.lent = cents(l.lent + e.amount);
      if (e.dueDate && (!l.dueDate || e.dueDate < l.dueDate)) l.dueDate = e.dueDate;
    } else if (e.from.kind === 'company' && e.to.kind === 'party' && map.has(e.to.id!)) {
      const l = get(e.to.id!, e.date);
      l.repaid = cents(l.repaid + e.amount);
    }
  }
  return [...map.values()].map((l) => {
    const outstanding = cents(l.lent - l.repaid);
    const dueDate = outstanding > 0 ? l.dueDate : null;
    return { ...l, outstanding, dueDate, overdue: !!dueDate && dueDate < today };
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
