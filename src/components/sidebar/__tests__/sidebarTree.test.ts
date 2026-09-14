import { describe, expect, it } from 'vitest';
import type { Company, Portfolio, Project } from '@/types/project';
import { buildSidebarTree, isFinished, toggled, type SidebarTreeState } from '../sidebarTree';

const fixture = <T,>(rows: Partial<T>[]): T[] => rows as T[];
const companies = fixture<Company>([
  { id: 'c1', name: 'شركة الأفق', status: 'active' },
  { id: 'c2', name: 'شركة قديمة', status: 'archived' },
  { id: 'c3', name: 'Horizon', status: 'active' },
]);
const portfolios = fixture<Portfolio>([
  { id: 'pf1', companyId: 'c1', name: 'محفظة الرياض' },
  { id: 'pf3', companyId: 'c3', name: 'Ports' },
]);
const projects = fixture<Project>([
  { id: 'p1', companyId: 'c1', name: 'مشروع الجسر', status: 'active' },
  { id: 'p2', companyId: 'c1', portfolioId: 'pf1', name: 'مشروع النفق', status: 'planning' },
  { id: 'p3', companyId: 'c1', portfolioId: 'pf1', name: 'مشروع الميناء', status: 'completed' },
  { id: 'p4', companyId: 'c1', name: 'مشروع قديم', status: 'archived' },
  { id: 'p5', companyId: 'c2', name: 'مشروع مؤرشف', status: 'active' },
  { id: 'p6', companyId: 'c3', portfolioId: 'pf3', name: 'Metro', status: 'cancelled' },
]);
const closed: SidebarTreeState = { search: '', expandedCompanies: new Set(), expandedPortfolios: new Set(), showInactive: new Set() };
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe('isFinished', () => {
  it('counts completed, archived and cancelled as finished', () => {
    expect(projects.filter(isFinished).map((p) => p.id)).toEqual(['p3', 'p4', 'p6']);
  });
});

describe('buildSidebarTree without a search', () => {
  it('lists the active companies closed, with their projects split by portfolio and by state', () => {
    const t = buildSidebarTree(companies, portfolios, projects, closed);
    expect(t.query).toBe('');
    expect(t.nodes.map((n) => n.company.id)).toEqual(['c1', 'c3']);
    const c1 = t.nodes[0];
    expect(c1.open).toBe(false);
    expect(c1.showFinished).toBe(false);
    expect(ids(c1.directActive)).toEqual(['p1']);
    expect(ids(c1.directInactive)).toEqual(['p4']);
    expect(c1.finishedCount).toBe(2);
    expect(c1.portfolios.map((p) => p.portfolio.id)).toEqual(['pf1']);
    expect(ids(c1.portfolios[0].active)).toEqual(['p2']);
    expect(ids(c1.portfolios[0].inactive)).toEqual(['p3']);
    expect(c1.portfolios[0].open).toBe(false);
  });

  it('opens what the user opened and shows the finished ones where the toggle is on', () => {
    const t = buildSidebarTree(companies, portfolios, projects, {
      ...closed, expandedCompanies: new Set(['c1']), expandedPortfolios: new Set(['pf1']), showInactive: new Set(['c3']),
    });
    expect(t.nodes[0].open).toBe(true);
    expect(t.nodes[0].portfolios[0].open).toBe(true);
    expect(t.nodes[0].showFinished).toBe(false);
    expect(t.nodes[1].open).toBe(false);
    expect(t.nodes[1].showFinished).toBe(true);
  });
});

describe('buildSidebarTree with a search', () => {
  it('keeps only the branches holding a match, opens them, and narrows their projects to the match', () => {
    const t = buildSidebarTree(companies, portfolios, projects, { ...closed, search: ' النفق ' });
    expect(t.query).toBe('النفق');
    expect(t.nodes.map((n) => n.company.id)).toEqual(['c1']);
    const c1 = t.nodes[0];
    expect(c1.open).toBe(true);
    expect(c1.directActive).toEqual([]);
    expect(c1.portfolios.map((p) => p.portfolio.id)).toEqual(['pf1']);
    expect(c1.portfolios[0].open).toBe(true);
    expect(ids(c1.portfolios[0].active)).toEqual(['p2']);
    expect(c1.finishedCount).toBe(2);
  });

  it('shows the finished projects it names, whatever the toggle, and ignores case', () => {
    const t = buildSidebarTree(companies, portfolios, projects, { ...closed, search: 'METRO' });
    expect(t.nodes.map((n) => n.company.id)).toEqual(['c3']);
    expect(t.nodes[0].showFinished).toBe(true);
    expect(ids(t.nodes[0].portfolios[0].inactive)).toEqual(['p6']);
  });

  it('keeps a company matched by its own name, with none of its projects unless they match too', () => {
    const t = buildSidebarTree(companies, portfolios, projects, { ...closed, search: 'الأفق' });
    expect(t.nodes.map((n) => n.company.id)).toEqual(['c1']);
    expect(t.nodes[0].directActive).toEqual([]);
    expect(t.nodes[0].portfolios).toEqual([]);
  });

  it('returns no node when nothing matches, and never an archived company', () => {
    expect(buildSidebarTree(companies, portfolios, projects, { ...closed, search: 'zzz' }).nodes).toEqual([]);
    expect(buildSidebarTree(companies, portfolios, projects, { ...closed, search: 'مؤرشف' }).nodes).toEqual([]);
  });
});

describe('toggled', () => {
  it('adds a missing id and removes a present one without touching the input', () => {
    const base = new Set(['a']);
    expect([...toggled(base, 'b')]).toEqual(['a', 'b']);
    expect([...toggled(base, 'a')]).toEqual([]);
    expect([...base]).toEqual(['a']);
  });
});
