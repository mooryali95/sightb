/**
 * «الكشف المالي الموحّد»: the owner's monthly statement, produced by the
 * system instead of assembled by hand.
 *
 * Every total comes from the same rules the screens use: the contract is the
 * effective contract (with change orders), the collected sum is
 * getCollectedRevenue, and the actual spend is getCountedExpenses (rejected
 * expenses and advances not yet settled are left out). So the statement and
 * the project, company and finance pages give one number for one question.
 * Advances still open are listed beside the figures, not inside them; a paid
 * advance writes no expense, so they are read from the payment requests with
 * the same rule as the payables card (getProjectOutstandingAdvances).
 */
import type { ChangeOrder, Expense, ExpenseCategory, PaymentRequest, Project, Resource, Revenue } from '@/types/project';
import { EXPENSE_CATEGORY_LABELS } from '@/types/project';
import { getCollectedRevenue, getCountedExpenses } from './summary';
import { getEffectiveContractValue } from './contract';
import { attributeExpense, indexResources } from '@/lib/resource-spend';
import { getProjectOutstandingAdvances } from '@/lib/funds';

export interface StatementParty { id: string; name: string }

export interface StatementInput {
  companyName: string;
  projects: Project[];
  expenses: Expense[];
  revenues: Revenue[];
  changeOrders: ChangeOrder[];
  resources: Resource[];
  parties: StatementParty[];
  /** The projects' payment requests, for the advances still open. */
  paymentRequests?: PaymentRequest[];
}

export interface StatementLine {
  projectId: string;
  project: string;
  party: string;
  nature: string;
  category: string;
  description: string;
  amount: number;
  month: number;
  date: string;
  status: string;
}

export interface Figures {
  contract: number;
  collected: number;
  actual: number;
  /** What is left of what was collected: collected less actual. */
  net: number;
  /** net / collected, as a fraction; 0 when nothing was collected. */
  margin: number;
  movements: number;
  /** Advances paid out and not yet settled, outside the actual spend. */
  openAdvances: number;
}

export interface Share { label: string; amount: number; share: number; count: number }

export interface ProjectStatement {
  id: string;
  name: string;
  figures: Figures;
  byParty: Share[];
  byNature: Share[];
  lines: StatementLine[];
}

export interface UnifiedStatement {
  companyName: string;
  figures: Figures;
  projects: ProjectStatement[];
  byParty: Share[];
  byNature: Share[];
  byMonth: Share[];
  lines: StatementLine[];
  collections: { project: string; description: string; amount: number; month: number; date: string }[];
}

const NATURE_BY_CATEGORY: Record<ExpenseCategory, string> = {
  salary: 'رواتب وحوافز',
  travel: 'سفر وإقامة', hotel: 'سفر وإقامة',
  food: 'قاعات وضيافة', hospitality: 'قاعات وضيافة', training: 'قاعات وضيافة',
  software: 'تقنيات وبرمجيات',
  media: 'تصاميم وإعلام', photography: 'تصاميم وإعلام', printing: 'تصاميم وإعلام',
  consulting: 'موردون وجهات', import: 'موردون وجهات', equipment: 'موردون وجهات',
  contingency: 'احتياطي وطوارئ', other: 'أخرى',
};

/** The nature of a movement: how it arose first, then what it bought. */
export function natureOf(e: Pick<Expense, 'category' | 'sourcePaymentRequestId' | 'reimbursesPayableId' | 'isOutstandingAdvance'>): string {
  if (e.isOutstandingAdvance) return 'سلفة قائمة';
  if (e.sourcePaymentRequestId) return 'تسوية سلفة';
  if (e.reimbursesPayableId) return 'سداد ذمة';
  return NATURE_BY_CATEGORY[e.category] ?? 'أخرى';
}

const STATUS_LABEL: Record<string, string> = { approved: 'معتمد', pending: 'معلّق', rejected: 'مرفوض' };
const UNNAMED = 'غير مسمّى';

const round2 = (n: number) => Math.round(n * 100) / 100;

function figuresOf(contract: number, revenues: Revenue[], expenses: Expense[], openAdvances: number): Figures {
  const counted = getCountedExpenses(expenses);
  const collected = getCollectedRevenue(revenues);
  const actual = counted.reduce((s, e) => s + e.amount, 0);
  const net = collected - actual;
  return {
    contract: round2(contract), collected: round2(collected), actual: round2(actual), net: round2(net),
    margin: collected > 0 ? net / collected : 0, movements: counted.length, openAdvances: round2(openAdvances),
  };
}

function shares(lines: StatementLine[], key: (l: StatementLine) => string, order?: (a: Share, b: Share) => number): Share[] {
  const total = lines.reduce((s, l) => s + l.amount, 0);
  const buckets = new Map<string, Share>();
  for (const l of lines) {
    const k = key(l);
    const b = buckets.get(k) ?? { label: k, amount: 0, share: 0, count: 0 };
    b.amount += l.amount;
    b.count += 1;
    buckets.set(k, b);
  }
  return [...buckets.values()]
    .map((b) => ({ ...b, amount: round2(b.amount), share: total > 0 ? b.amount / total : 0 }))
    .sort(order ?? ((a, b) => b.amount - a.amount));
}

export function buildUnifiedStatement(input: StatementInput): UnifiedStatement {
  const idx = indexResources(input.resources);
  const partyName = new Map(input.parties.map((p) => [p.id, p.name]));
  const ids = new Set(input.projects.map((p) => p.id));
  const expenses = input.expenses.filter((e) => ids.has(e.projectId));
  const revenues = input.revenues.filter((r) => ids.has(r.projectId));
  const nameOf = new Map(input.projects.map((p) => [p.id, p.name]));

  const toLine = (e: Expense): StatementLine => ({
    projectId: e.projectId,
    project: nameOf.get(e.projectId) ?? '',
    party: (e.partyId && partyName.get(e.partyId)) || attributeExpense(e, idx).resource?.name || e.vendor?.trim() || UNNAMED,
    nature: natureOf(e),
    category: EXPENSE_CATEGORY_LABELS[e.category] ?? e.category,
    description: e.description,
    amount: e.amount,
    month: e.month,
    date: e.date,
    status: STATUS_LABEL[e.approvalStatus] ?? e.approvalStatus,
  });

  const byDate = (a: StatementLine, b: StatementLine) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
  const lines = getCountedExpenses(expenses).map(toLine).sort(byDate);

  const projects: ProjectStatement[] = input.projects.map((p) => {
    const own = lines.filter((l) => l.projectId === p.id);
    const contract = getEffectiveContractValue(p.contractValue, input.changeOrders.filter((o) => o.projectId === p.id));
    return {
      id: p.id,
      name: p.name,
      figures: figuresOf(
        contract, revenues.filter((r) => r.projectId === p.id), expenses.filter((e) => e.projectId === p.id),
        getProjectOutstandingAdvances(p.id, input.paymentRequests).total,
      ),
      byParty: shares(own, (l) => l.party),
      byNature: shares(own, (l) => l.nature),
      lines: own,
    };
  });

  const contract = projects.reduce((s, p) => s + p.figures.contract, 0);
  return {
    companyName: input.companyName,
    figures: figuresOf(contract, revenues, expenses, projects.reduce((s, p) => s + p.figures.openAdvances, 0)),
    projects,
    byParty: shares(lines, (l) => l.party),
    byNature: shares(lines, (l) => l.nature),
    byMonth: shares(lines, (l) => `شهر ${l.month}`, (a, b) => Number(a.label.slice(4)) - Number(b.label.slice(4))),
    lines,
    collections: revenues
      .filter((r) => getCollectedRevenue([r]) > 0)
      .map((r) => ({ project: nameOf.get(r.projectId) ?? '', description: r.description, amount: r.amount, month: r.month, date: r.collectionDate || r.date }))
      .sort((a, b) => (a.date < b.date ? -1 : 1)),
  };
}
