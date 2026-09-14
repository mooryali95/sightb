import { describe, expect, it } from 'vitest';
import type { Company, Portfolio, Project } from '@/types/project';
import { activeCompanies, searchResults } from '../searchResults';

const fixture = <T,>(rows: Partial<T>[]): T[] => rows as T[];
const source = {
  companies: fixture<Company>([
    { id: 'c1', name: 'شركة الأفق', status: 'active' },
    { id: 'c2', name: 'شركة قديمة', status: 'archived' },
    { id: 'c3', name: 'Horizon Ltd', status: 'active' },
  ]),
  portfolios: fixture<Portfolio>([{ id: 'pf1', companyId: 'c1', name: 'محفظة الرياض' }]),
  projects: fixture<Project>([
    { id: 'p1', companyId: 'c1', name: 'مشروع الجسر' },
    { id: 'p2', companyId: 'c2', name: 'مشروع النفق' },
    { id: 'p3', companyId: 'c3', name: 'Metro Line 3' },
  ]),
};

describe('activeCompanies', () => {
  it('leaves archived companies out', () => {
    expect(activeCompanies(source.companies).map((c) => c.id)).toEqual(['c1', 'c3']);
  });
});

describe('searchResults', () => {
  it('returns every row but the archived companies for an empty or blank query', () => {
    for (const q of ['', '   ']) {
      const r = searchResults(source, q);
      expect(r.companies.map((c) => c.id)).toEqual(['c1', 'c3']);
      expect(r.portfolios.map((p) => p.id)).toEqual(['pf1']);
      expect(r.projects.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
      expect(r.hasResults).toBe(true);
    }
  });

  it('narrows each group by name, trimmed and regardless of case, keeping the projects of archived companies', () => {
    const r = searchResults(source, '  النفق ');
    expect(r.companies).toEqual([]);
    expect(r.portfolios).toEqual([]);
    expect(r.projects.map((p) => p.id)).toEqual(['p2']);
    expect(searchResults(source, 'HORIZON').companies.map((c) => c.id)).toEqual(['c3']);
    expect(searchResults(source, 'metro').projects.map((p) => p.id)).toEqual(['p3']);
  });

  it('reports no results when nothing matches', () => {
    const r = searchResults(source, 'zzz');
    expect(r.hasResults).toBe(false);
    expect(r.companies.length + r.portfolios.length + r.projects.length).toBe(0);
  });
});
