/**
 * Everything about one person or vendor across the company: what each
 * project paid them, by kind of spend, what they paid for the company from
 * their own pocket, and where their account with the company stands.
 * The page of a registry entry reads only this.
 */
import { balancesWithCompany, type CompanyExpense, type IntercompanyEntry } from '@/lib/finance/company-ledger';

interface ExpenseLike {
  id: string; projectId: string; amount: number; category: string; date: string; description: string;
  approvalStatus?: string; partyId?: string; isOutstandingAdvance?: boolean;
}

export interface PartyRow {
  id: string; date: string; amount: number; description: string; category: string;
  source: 'project' | 'company';
  projectId?: string; projectName?: string;
  /** A company expense they paid from their own pocket (so the company owes them). */
  paidByThem?: boolean;
}

export interface PartySummary {
  paidByProjects: number;
  byProject: { projectId: string; name: string; total: number; count: number }[];
  byCategory: { category: string; total: number }[];
  /** Company expenses paid to them (salary, incentive). */
  paidByCompany: number;
  /** Company expenses they paid from their own pocket. */
  paidForCompany: number;
  /** Positive: the company owes them. Negative: they owe the company. */
  companyOwesThem: number;
  rows: PartyRow[];
}

const cents = (n: number) => Math.round(n * 100) / 100;

export function summarizeParty(partyId: string, data: {
  expenses: ExpenseLike[]; projects: { id: string; name: string }[];
  companyExpenses: CompanyExpense[]; entries: IntercompanyEntry[];
}): PartySummary {
  const projectName = new Map(data.projects.map((p) => [p.id, p.name]));
  const mine = data.expenses.filter((e) => e.partyId === partyId && e.approvalStatus !== 'rejected' && !e.isOutstandingAdvance);

  const byProject = new Map<string, { projectId: string; name: string; total: number; count: number }>();
  const byCategory = new Map<string, number>();
  for (const e of mine) {
    const p = byProject.get(e.projectId) ?? { projectId: e.projectId, name: projectName.get(e.projectId) ?? '—', total: 0, count: 0 };
    p.total = cents(p.total + e.amount); p.count += 1;
    byProject.set(e.projectId, p);
    byCategory.set(e.category, cents((byCategory.get(e.category) ?? 0) + e.amount));
  }

  const toThem = data.companyExpenses.filter((x) => x.partyId === partyId);
  const byThem = data.companyExpenses.filter((x) => x.paidByPartyId === partyId);
  const balance = balancesWithCompany(data.entries, data.companyExpenses)
    .find((b) => b.node.kind === 'party' && b.node.id === partyId)?.owesCompany ?? 0;

  const rows: PartyRow[] = [
    ...mine.map((e) => ({ id: e.id, date: e.date, amount: e.amount, description: e.description, category: e.category,
      source: 'project' as const, projectId: e.projectId, projectName: projectName.get(e.projectId) })),
    ...toThem.map((x) => ({ id: x.id, date: x.date, amount: x.amount, description: x.description, category: x.kind, source: 'company' as const })),
    ...byThem.filter((x) => x.partyId !== partyId).map((x) => ({ id: x.id, date: x.date, amount: x.amount, description: x.description,
      category: x.kind, source: 'company' as const, paidByThem: true })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount);

  return {
    paidByProjects: cents(mine.reduce((s, e) => s + e.amount, 0)),
    byProject: [...byProject.values()].sort((a, b) => b.total - a.total),
    byCategory: [...byCategory.entries()].map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total),
    paidByCompany: cents(toThem.reduce((s, x) => s + x.amount, 0)),
    paidForCompany: cents(byThem.reduce((s, x) => s + x.amount, 0)),
    companyOwesThem: cents(-balance),
    rows,
  };
}
