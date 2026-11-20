/**
 * «المنظومات» on the dashboard: companies ranked by what needs a decision,
 * each project counted under the same health as on the company map, said in
 * symbols and words, not colour alone.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CompaniesOverview } from '../CompaniesOverview';
import { companiesOverview, type MapProjectInput } from '@/lib/finance/company-map';

const books = vi.hoisted(() => ({ byCompany: {} as Record<string, unknown> }));
vi.mock('@/hooks/useCompanyLedger', () => ({ useCompanyLedger: (id: string) => ({ data: books.byCompany[id] }) }));
beforeEach(() => { books.byCompany = {}; });

const p = (id: string, companyId: string, over: Partial<MapProjectInput> = {}) => ({
  id, name: id, group: '', status: 'active' as const, contract: 100000, planned: 80000, actual: 20000, collected: 0, companyId, ...over,
});
const companies = [{ id: 'a', name: 'الأفق' }, { id: 'b', name: 'النماء' }, { id: 'c', name: 'جديدة' }];
const projects = [
  p('a1', 'a'), p('a2', 'a', { status: 'completed' }),
  p('b1', 'b', { actual: 90000 }), p('b2', 'b', { status: 'on-hold' }), p('b3', 'b'),
];

describe('companiesOverview', () => {
  it('counts each company\'s projects by health and ranks the one needing a decision first', () => {
    const rows = companiesOverview(companies, projects);
    expect(rows.map((r) => r.companyId)).toEqual(['b', 'a', 'c']);
    expect(rows[0].counts).toEqual({ bad: 1, warn: 1, good: 1, idle: 0 });
    expect(rows[0].spendPct).toBe(54.17); // 130,000 of 240,000
    expect(rows[2]).toMatchObject({ total: 0, spendPct: null });
  });
});

describe('CompaniesOverview', () => {
  const show = (rows = companiesOverview(companies, projects)) => render(<MemoryRouter><CompaniesOverview rows={rows} projects={projects} /></MemoryRouter>);

  it('names each company with its health in words, and links to it', () => {
    show();
    const b = screen.getByRole('link', { name: /^النماء:/ });
    expect(b).toHaveAccessibleName('النماء: 3 مشروع، تجاوز الموازنة 1، يحتاج انتباه 1، على المسار 1');
    expect(b).toHaveAttribute('href', '/company/b');
    expect(b).toHaveTextContent('✕ 1');
    expect(screen.getByRole('link', { name: /^جديدة:/ })).toHaveTextContent('لا مشاريع بعد');
  });

  it('stays out of the way with a single company', () => {
    const { container } = show(companiesOverview([companies[0]], projects));
    expect(container).toBeEmptyDOMElement();
  });

  it('adds what the company sent its projects, what came back and what they still owe, from its own books', () => {
    const C = { kind: 'company', id: null };
    books.byCompany.b = { expenses: [], allocations: [], entries: [
      { id: 'f', companyId: 'b', date: '2026-05-01', amount: 30000, type: 'advance', from: C, to: { kind: 'project', id: 'b1' }, note: '', dueDate: null, salaryExpenseId: null },
      { id: 'r', companyId: 'b', date: '2026-05-02', amount: 10000, type: 'repayment', from: { kind: 'project', id: 'b1' }, to: C, note: '', dueDate: null, salaryExpenseId: null },
    ] };
    show();
    expect(screen.getByRole('link', { name: /^النماء:/ })).toHaveTextContent('أرسلت للمشاريع 30,000.00 ر.س · عاد 10,000.00 ر.س · لها على المشاريع 20,000.00 ر.س');
    expect(screen.getByRole('link', { name: /^الأفق:/ })).not.toHaveTextContent('أرسلت للمشاريع');
  });
});
