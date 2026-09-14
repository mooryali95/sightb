import type { Company, Portfolio, Project, ProjectStatus } from '@/types/project';

export const INACTIVE_STATUSES: ProjectStatus[] = ['completed', 'archived', 'cancelled'];

export function isFinished(project: Project): boolean {
  return INACTIVE_STATUSES.includes(project.status as ProjectStatus);
}

export interface PortfolioNode {
  portfolio: Portfolio;
  open: boolean;
  active: Project[];
  inactive: Project[];
}

export interface CompanyNode {
  company: Company;
  open: boolean;
  /** Finished projects are drawn: the company's toggle is on, or a search is naming them. */
  showFinished: boolean;
  directActive: Project[];
  directInactive: Project[];
  portfolios: PortfolioNode[];
  /** Every finished project of the company, whatever the search. */
  finishedCount: number;
}

export interface SidebarTreeState {
  search: string;
  expandedCompanies: Set<string>;
  expandedPortfolios: Set<string>;
  showInactive: Set<string>;
}

export interface SidebarTree {
  /** The search, trimmed and case-folded; empty when none. */
  query: string;
  nodes: CompanyNode[];
}

const matches = (name: string, q: string) => name.toLowerCase().includes(q);

/**
 * The companies the sidebar draws, with their branches. Archived companies
 * are left out. Without a search a branch is open when the user opened it;
 * with one, only the branches holding a match are drawn, and they are open.
 */
export function buildSidebarTree(
  companies: Company[],
  portfolios: Portfolio[],
  projects: Project[],
  state: SidebarTreeState,
): SidebarTree {
  const q = state.search.trim().toLowerCase();

  const matchedCompanies = new Set<string>();
  const matchedPortfolios = new Set<string>();
  if (q) {
    companies.forEach((c) => { if (matches(c.name, q)) matchedCompanies.add(c.id); });
    portfolios.forEach((p) => { if (matches(p.name, q)) { matchedCompanies.add(p.companyId); matchedPortfolios.add(p.id); } });
    projects.forEach((p) => {
      if (!matches(p.name, q)) return;
      matchedCompanies.add(p.companyId);
      if (p.portfolioId) matchedPortfolios.add(p.portfolioId);
    });
  }
  const projectShown = (p: Project) => !q || matches(p.name, q);

  const nodes: CompanyNode[] = [];
  for (const company of companies) {
    if (company.status === 'archived') continue;
    if (q && !matchedCompanies.has(company.id)) continue;

    const companyProjects = projects.filter((p) => p.companyId === company.id);
    const active = companyProjects.filter((p) => !isFinished(p));
    const inactive = companyProjects.filter(isFinished);

    const portfolioNodes: PortfolioNode[] = [];
    for (const portfolio of portfolios) {
      if (portfolio.companyId !== company.id) continue;
      if (q && !matchedPortfolios.has(portfolio.id)) continue;
      portfolioNodes.push({
        portfolio,
        open: q ? true : state.expandedPortfolios.has(portfolio.id),
        active: active.filter((p) => p.portfolioId === portfolio.id && projectShown(p)),
        inactive: inactive.filter((p) => p.portfolioId === portfolio.id && projectShown(p)),
      });
    }

    nodes.push({
      company,
      open: q ? true : state.expandedCompanies.has(company.id),
      showFinished: !!q || state.showInactive.has(company.id),
      directActive: active.filter((p) => !p.portfolioId && projectShown(p)),
      directInactive: inactive.filter((p) => !p.portfolioId && projectShown(p)),
      portfolios: portfolioNodes,
      finishedCount: inactive.length,
    });
  }

  return { query: q, nodes };
}

/** A set with the id added or removed. */
export function toggled(prev: Set<string>, id: string): Set<string> {
  const next = new Set(prev);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
