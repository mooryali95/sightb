import type { Company, Portfolio, Project } from '@/types/project';

export interface SearchSource {
  companies: Company[];
  portfolios: Portfolio[];
  projects: Project[];
}

export interface SearchResults {
  companies: Company[];
  portfolios: Portfolio[];
  projects: Project[];
  hasResults: boolean;
}

/** Companies the search offers: every one that is not archived. */
export function activeCompanies(companies: Company[]): Company[] {
  return companies.filter((c) => c.status !== 'archived');
}

function byName<T extends { name: string }>(rows: T[], q: string): T[] {
  return q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
}

/**
 * The three groups narrowed by a query on the name alone, trimmed and
 * case-folded; an empty query returns every row. Archived companies are
 * left out, their portfolios and projects are not.
 */
export function searchResults(source: SearchSource, query: string): SearchResults {
  const q = query.trim().toLowerCase();
  const companies = byName(activeCompanies(source.companies), q);
  const portfolios = byName(source.portfolios, q);
  const projects = byName(source.projects, q);
  return { companies, portfolios, projects, hasResults: companies.length + portfolios.length + projects.length > 0 };
}
