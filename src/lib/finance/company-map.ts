/**
 * «خريطة المنظومة»: the company and its projects in one picture, and the
 * money between them. Every figure comes from the functions that already
 * own it (fundingByProject, summarizeCompanyExpenses, needsAttention), so the
 * map can never disagree with the ledger or the project pages.
 *
 * What belongs where:
 *   - the company alone: its own spend that stayed on it (not charged), and
 *     what it owes people (loans, bills they paid);
 *   - between the two: funding the company sent a project, what it charged
 *     the project, and what the project sent back;
 *   - the project alone: its direct spend from its own funds.
 */
import { fundingByProject } from './loans';
import { summarizeCompanyExpenses, balancesWithCompany, type CompanyExpense, type ExpenseAllocation, type IntercompanyEntry } from './company-ledger';
import { needsAttention } from '@/pages/dashboard/dashboardFigures';
import type { ProjectStatus } from '@/types/project';

export interface MapProjectInput {
  id: string; name: string; group: string; status: ProjectStatus;
  contract: number; planned: number; actual: number; collected: number;
}

export type MapHealth = 'good' | 'warn' | 'bad' | 'idle';

export interface MapProject extends MapProjectInput {
  health: MapHealth;
  /** Spend against budget, 0–100+ (null without a budget). */
  spendPct: number | null;
  funded: number;
  charged: number;
  returned: number;
  /** What the project still owes the company (negative: the company owes it). */
  owes: number;
  /** Width of the company→project and project→company bars, 0–1 of the largest flow on the map. */
  outScale: number;
  backScale: number;
}

export interface CompanyMap {
  projects: MapProject[];
  groups: { name: string; projects: MapProject[] }[];
  company: {
    ownSpend: number; charged: number; retained: number;
    fundedOut: number; returned: number;
    owedToCompany: number; owedByCompany: number;
  };
  /** The three columns of «what belongs to whom». */
  split: { companyOnly: number; between: number; projectOnly: number };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const FINISHED: ProjectStatus[] = ['completed', 'archived', 'cancelled'];

export function healthOf(p: MapProjectInput): MapHealth {
  if (FINISHED.includes(p.status)) return 'idle';
  if (p.status === 'on-hold') return 'warn';            // before "no spend": a paused project needs a decision
  if (p.planned === 0 && p.actual === 0) return 'idle';
  if (p.planned > 0 && p.actual > p.planned) return 'bad';
  return needsAttention({ status: p.status }, p.actual, p.planned, p.contract - p.planned) ? 'warn' : 'good';
}

export function buildCompanyMap(
  projects: MapProjectInput[],
  ledger: { entries: IntercompanyEntry[]; allocations: ExpenseAllocation[]; expenses: CompanyExpense[] } | null,
): CompanyMap {
  const entries = ledger?.entries ?? [];
  const funding = new Map(fundingByProject(entries).map((f) => [f.projectId, f]));
  const balances = new Map(balancesWithCompany(entries, ledger?.expenses ?? []).map((b) => [b.node.kind === 'project' ? b.node.id : `x:${b.node.id}`, b.owesCompany]));
  const summary = summarizeCompanyExpenses(ledger?.expenses ?? [], ledger?.allocations ?? []);

  const base = projects.map((p) => {
    const f = funding.get(p.id);
    return {
      ...p,
      health: healthOf(p),
      spendPct: p.planned > 0 ? r2((p.actual / p.planned) * 100) : null,
      funded: f?.funded ?? 0,
      returned: f?.returned ?? 0,
      charged: summary.byProject.get(p.id) ?? 0,
      owes: balances.get(p.id) ?? 0,
    };
  });
  const maxFlow = Math.max(1, ...base.map((p) => Math.max(p.funded + p.charged, p.returned)));
  const mapped: MapProject[] = base.map((p) => ({ ...p, outScale: r2((p.funded + p.charged) / maxFlow), backScale: r2(p.returned / maxFlow) }));

  const groups = [...new Set(mapped.map((p) => p.group))].map((name) => ({ name, projects: mapped.filter((p) => p.group === name) }));
  const owedToCompany = r2([...balances.values()].filter((v) => v > 0).reduce((s, v) => s + v, 0));
  const owedByCompany = r2([...balances.values()].filter((v) => v < 0).reduce((s, v) => s - v, 0));
  const fundedOut = r2(mapped.reduce((s, p) => s + p.funded, 0));
  const returned = r2(mapped.reduce((s, p) => s + p.returned, 0));

  return {
    projects: mapped,
    groups,
    company: { ownSpend: summary.total, charged: summary.allocated, retained: summary.retained, fundedOut, returned, owedToCompany, owedByCompany },
    split: {
      companyOnly: summary.retained,
      between: r2(fundedOut + summary.allocated),
      projectOnly: r2(mapped.reduce((s, p) => s + p.actual, 0)),
    },
  };
}

// The label is in the body colour so it always reads; the colour rides on
// the symbol and the border, and the symbol alone carries the meaning.
export const HEALTH: Record<MapHealth, { symbol: string; label: string; tone: string; mark: string }> = {
  good: { symbol: '✓', label: 'على المسار', tone: 'border-success/40', mark: 'text-success' },
  warn: { symbol: '▲', label: 'يحتاج انتباه', tone: 'border-warning/50', mark: 'text-warning' },
  bad: { symbol: '✕', label: 'تجاوز الموازنة', tone: 'border-destructive/50', mark: 'text-destructive' },
  idle: { symbol: '○', label: 'لا صرف جارٍ', tone: 'border-border', mark: 'text-muted-foreground' },
};
