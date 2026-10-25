/**
 * The company ledger: spend that belongs to the company, the part of it
 * charged to projects, and what the company, its projects and people owe
 * one another. Design: docs/company-ledger-design.md.
 *
 * One rule for every balance: money that moves from A to B makes B owe A
 * that amount. An advance and a repayment are the same movement in
 * opposite directions, so they net without special cases. An expense a
 * person paid from their own pocket counts as money from them to the
 * company.
 */

export type CompanyExpenseKind =
  | 'salary' | 'incentive' | 'owner_salary' | 'owner_incentive'
  | 'rent' | 'government' | 'subscription' | 'other';

export const COMPANY_EXPENSE_KIND_LABELS: Record<CompanyExpenseKind, string> = {
  salary: 'رواتب',
  incentive: 'حوافز',
  owner_salary: 'رواتب الملاك',
  owner_incentive: 'حوافز الملاك',
  rent: 'إيجار',
  government: 'رسوم حكومية',
  subscription: 'اشتراكات',
  other: 'أخرى',
};

export type PartyKind = 'person' | 'owner' | 'vendor';
export const PARTY_KIND_LABELS: Record<PartyKind, string> = { person: 'شخص', owner: 'مالك', vendor: 'مورد' };

export interface Party { id: string; companyId: string; name: string; kind: PartyKind; archived: boolean }

export interface CompanyExpense {
  id: string; companyId: string; date: string; amount: number; description: string;
  kind: CompanyExpenseKind; partyId: string | null; paidByPartyId: string | null;
}

export interface ExpenseAllocation {
  id: string; expenseId: string; projectId: string; amount: number;
  /** The project already paid this share from its own spend (e.g. it repaid
   *  the person who paid the company's bill), so it shows as charged but is
   *  not added to the project's cost again. */
  settledInProject?: boolean;
}

/**
 * What the company charged a project, split by whether the project already
 * paid it itself: the full cost adds only the part it has not.
 */
export function chargedCostTotals(rows: { amount: number; settledInProject?: boolean }[], directActual: number) {
  const charged = rows.reduce((s, r) => s + r.amount, 0);
  const settledInProject = rows.filter((r) => r.settledInProject).reduce((s, r) => s + r.amount, 0);
  const onTop = charged - settledInProject;
  return { charged, settledInProject, onTop, fullCost: Math.round((directActual + onTop) * 100) / 100 };
}

export type NodeKind = 'company' | 'project' | 'party';
/** A side of a movement. The company has no id. */
export interface LedgerNode { kind: NodeKind; id: string | null }

export interface IntercompanyEntry {
  id: string; companyId: string; date: string; amount: number; type: 'advance' | 'repayment';
  from: LedgerNode; to: LedgerNode; note: string; dueDate: string | null; salaryExpenseId: string | null;
}

export const COMPANY: LedgerNode = { kind: 'company', id: null };

const cents = (n: number) => Math.round(n * 100) / 100;
export const nodeKey = (n: LedgerNode) => (n.kind === 'company' ? 'company' : `${n.kind}:${n.id}`);

/* ─────────────── Company expenses and their allocation ─────────────── */

export interface ExpenseSplit { allocated: number; retained: number; rows: ExpenseAllocation[] }

export function splitOf(expense: CompanyExpense, allocations: ExpenseAllocation[]): ExpenseSplit {
  const rows = allocations.filter((a) => a.expenseId === expense.id);
  const allocated = cents(rows.reduce((s, a) => s + a.amount, 0));
  return { allocated, retained: cents(expense.amount - allocated), rows };
}

export interface CompanyExpenseSummary {
  total: number;
  /** Charged to projects: part of their cost, not the company's overhead. */
  allocated: number;
  /** Stays on the company: overhead under the projects' profit. */
  retained: number;
  byKind: { kind: CompanyExpenseKind; total: number; allocated: number }[];
  byProject: Map<string, number>;
}

export function summarizeCompanyExpenses(expenses: CompanyExpense[], allocations: ExpenseAllocation[]): CompanyExpenseSummary {
  const ids = new Set(expenses.map((e) => e.id));
  const own = allocations.filter((a) => ids.has(a.expenseId));
  const byProject = new Map<string, number>();
  for (const a of own) byProject.set(a.projectId, cents((byProject.get(a.projectId) ?? 0) + a.amount));
  const kinds = new Map<CompanyExpenseKind, { kind: CompanyExpenseKind; total: number; allocated: number }>();
  for (const e of expenses) {
    const k = kinds.get(e.kind) ?? { kind: e.kind, total: 0, allocated: 0 };
    k.total = cents(k.total + e.amount);
    k.allocated = cents(k.allocated + splitOf(e, own).allocated);
    kinds.set(e.kind, k);
  }
  const total = cents(expenses.reduce((s, e) => s + e.amount, 0));
  const allocated = cents(own.reduce((s, a) => s + a.amount, 0));
  return { total, allocated, retained: cents(total - allocated), byKind: [...kinds.values()].sort((a, b) => b.total - a.total), byProject };
}

/**
 * A split of `amount` across projects in proportion to their weight (the
 * effective contract value), in cents, summing exactly to the amount: the
 * rounding remainder goes to the heaviest project. Zero weights share
 * equally.
 */
export function suggestAllocation(amount: number, projects: { id: string; weight: number }[]): { projectId: string; amount: number }[] {
  if (projects.length === 0 || amount <= 0) return [];
  const totalWeight = projects.reduce((s, p) => s + Math.max(0, p.weight), 0);
  const share = (p: { weight: number }) => (totalWeight > 0 ? Math.max(0, p.weight) / totalWeight : 1 / projects.length);
  const totalCents = Math.round(amount * 100);
  const rows = projects.map((p) => ({ projectId: p.id, c: Math.floor(totalCents * share(p)) }));
  const heaviest = projects.reduce((best, p, i) => (share(p) > share(projects[best]) ? i : best), 0);
  rows[heaviest].c += totalCents - rows.reduce((s, r) => s + r.c, 0);
  return rows.filter((r) => r.c > 0).map((r) => ({ projectId: r.projectId, amount: r.c / 100 }));
}

/* ─────────────── Balances between the company, projects and people ─────────────── */

interface Movement { date: string; amount: number; from: LedgerNode; to: LedgerNode; label: string; sourceId: string; source: 'entry' | 'expense' }

const KIND_VERB: Record<IntercompanyEntry['type'], string> = { advance: 'سلفة', repayment: 'سداد' };

function movements(entries: IntercompanyEntry[], expenses: CompanyExpense[]): Movement[] {
  const out: Movement[] = entries.map((e) => ({
    date: e.date, amount: e.amount, from: e.from, to: e.to, sourceId: e.id, source: 'entry' as const,
    label: e.note ? `${KIND_VERB[e.type]} — ${e.note}` : KIND_VERB[e.type],
  }));
  for (const x of expenses) {
    if (!x.paidByPartyId) continue;
    out.push({
      date: x.date, amount: x.amount, from: { kind: 'party', id: x.paidByPartyId }, to: COMPANY, sourceId: x.id, source: 'expense',
      label: `دفع من جيبه: ${x.description || COMPANY_EXPENSE_KIND_LABELS[x.kind]}`,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.sourceId.localeCompare(b.sourceId));
}

export interface Balance {
  node: LedgerNode;
  /** Positive: owes the company ("لنا"). Negative: the company owes it ("علينا"). */
  owesCompany: number;
}

/** Every project and person against the company. */
export function balancesWithCompany(entries: IntercompanyEntry[], expenses: CompanyExpense[]): Balance[] {
  const map = new Map<string, Balance>();
  const add = (node: LedgerNode, delta: number) => {
    const key = nodeKey(node);
    const b = map.get(key) ?? { node, owesCompany: 0 };
    b.owesCompany = cents(b.owesCompany + delta);
    map.set(key, b);
  };
  for (const m of movements(entries, expenses)) {
    if (m.from.kind === 'company' && m.to.kind !== 'company') add(m.to, m.amount);
    else if (m.to.kind === 'company' && m.from.kind !== 'company') add(m.from, -m.amount);
  }
  return [...map.values()].sort((a, b) => Math.abs(b.owesCompany) - Math.abs(a.owesCompany));
}

/** What `debtor` owes `creditor` from movements between just the two of them (negative: the other way). */
export function balanceBetween(debtor: LedgerNode, creditor: LedgerNode, entries: IntercompanyEntry[], expenses: CompanyExpense[]): number {
  const d = nodeKey(debtor), c = nodeKey(creditor);
  let owed = 0;
  for (const m of movements(entries, expenses)) {
    const f = nodeKey(m.from), t = nodeKey(m.to);
    if (f === c && t === d) owed += m.amount;
    else if (f === d && t === c) owed -= m.amount;
  }
  return cents(owed);
}

export interface StatementRow {
  date: string; label: string; counterparty: LedgerNode; inflow: number; outflow: number; balance: number;
  /** The movement or the out-of-pocket expense behind the row. */
  sourceId: string; source: 'entry' | 'expense';
}

/**
 * A node's statement against everyone it dealt with: money in, money out,
 * and the running balance, positive while the node owes others.
 */
export function statementOf(node: LedgerNode, entries: IntercompanyEntry[], expenses: CompanyExpense[]): StatementRow[] {
  const key = nodeKey(node);
  let balance = 0;
  const rows: StatementRow[] = [];
  for (const m of movements(entries, expenses)) {
    const isTo = nodeKey(m.to) === key, isFrom = nodeKey(m.from) === key;
    if (!isTo && !isFrom) continue;
    balance = cents(balance + (isTo ? m.amount : -m.amount));
    rows.push({ date: m.date, label: m.label, counterparty: isTo ? m.from : m.to, inflow: isTo ? m.amount : 0, outflow: isFrom ? m.amount : 0, balance, sourceId: m.sourceId, source: m.source });
  }
  return rows;
}

/**
 * The deduction proposed when a person's salary is recorded: their open
 * advance from the company, up to the salary. Zero when they owe nothing.
 */
export function suggestSalaryDeduction(partyId: string, salary: number, entries: IntercompanyEntry[], expenses: CompanyExpense[]): number {
  const owed = balanceBetween({ kind: 'party', id: partyId }, COMPANY, entries, expenses);
  return owed > 0 ? Math.min(owed, salary) : 0;
}
