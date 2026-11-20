/**
 * «القوائم المالية»: the income statement, the monthly cash flow, the
 * receivables by age and what is still out, for one company and one period,
 * with the company's own cost taken from its ledger.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useStore, type AppState } from '@/store/useStore';
import type { Commitment, Company, Expense, Project, Revenue } from '@/types/project';
import { StatementsPanel } from '../StatementsPanel';
import { periodOf } from '@/lib/finance/statements';

const ledger = vi.hoisted(() => ({ value: { data: undefined as unknown } }));
vi.mock('@/hooks/useCompanyLedger', () => ({ useCompanyLedger: () => ledger.value }));

const rev = (id: string, amount: number, status: Revenue['status'], over: Partial<Revenue> = {}) =>
  ({ id, projectId: 'A', amount, status, description: id, date: '2026-01-15', month: 1, revenueType: 'milestone', ...over }) as Revenue;
const exp = (id: string, amount: number, date: string, over: Partial<Expense> = {}) =>
  ({ id, projectId: 'A', amount, date, description: id, approvalStatus: 'approved', category: 'other', month: 1, ...over }) as Expense;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-03-31T09:00:00'));
  ledger.value = { data: undefined };
  useStore.setState({
    companies: [{ id: 'c1', name: 'الأفق', status: 'active', createdAt: '' } as Company],
    projects: [{ id: 'A', companyId: 'c1', name: 'برج', currency: 'SAR', status: 'active' } as Project,
      { id: 'Z', companyId: 'other', name: 'غيره', currency: 'SAR', status: 'active' } as Project],
    revenues: [
      rev('r1', 100000, 'collected', { invoiceDate: '2026-01-10', collectionDate: '2026-02-05' }),
      rev('r2', 40000, 'invoiced', { invoiceDate: '2026-03-01' }),
      rev('old', 60000, 'invoiced', { invoiceDate: '2025-12-01' }),
      { ...rev('z', 999999, 'collected', { invoiceDate: '2026-01-10', collectionDate: '2026-01-10' }), projectId: 'Z' },
    ],
    expenses: [exp('e1', 30000, '2026-01-20'), exp('adv', 7000, '2026-02-12', { isOutstandingAdvance: true })],
    indirectCosts: [], commitments: [{ id: 'k', projectId: 'A', description: '', totalAmount: 10000, spentAmount: 4000, status: 'active', createdAt: '' } as Commitment],
  } as Partial<AppState>);
});
afterEach(() => vi.useRealTimers());

function Where() { return <span data-testid="where">{useLocation().search}</span>; }
const show = () => render(<MemoryRouter><StatementsPanel /><Where /></MemoryRouter>);
const card = (name: string) => within(screen.getByRole('article', { name }));
const line = (name: string, label: string) => card(name).getByText(label).closest('div')!;

describe('StatementsPanel', () => {
  it('states the income for the year so far, of this company only', () => {
    show();
    expect(line('قائمة الدخل', 'الإيراد المفوتر')).toHaveTextContent('140,000.00');
    expect(line('قائمة الدخل', '= مجمل الربح')).toHaveTextContent('110,000.00');
    expect(line('قائمة الدخل', '= مجمل الربح')).toHaveTextContent('78.6%');
    expect(card('قائمة الدخل').getByText(/دفتر المنظومة غير متاح/)).toBeInTheDocument();
  });

  it('takes the company\'s own cost from its ledger, and says a loss in words', () => {
    ledger.value = { data: { entries: [], allocations: [], expenses: [{ id: 'x', companyId: 'c1', date: '2026-02-01', amount: 120000, description: '', kind: 'salary', partyId: null, paidByPartyId: null }] } };
    show();
    expect(line('قائمة الدخل', '− مصاريف المنظومة')).toHaveTextContent('120,000.00');
    expect(line('قائمة الدخل', '= صافي الربح')).toHaveTextContent('▼ خسارة');
  });

  it('shows the cash month by month, when it moved', () => {
    show();
    const rows = card('التدفق النقدي').getAllByRole('row');
    expect(rows[1]).toHaveTextContent('يناير 2026');
    expect(rows[1]).toHaveTextContent('▼ -30,000.00');
    expect(rows[2]).toHaveTextContent('100,000.00');      // collected in February
    expect(rows[3]).toHaveTextContent('70,000.00');       // running total through March
  });

  it('ages what is billed and unpaid, and totals the advances and commitments still open', () => {
    show();
    expect(card('أعمار الذمم').getByText(/متأخر أكثر من 30 يوماً/)).toHaveTextContent('60,000.00');
    expect(card('السلف والالتزامات').getByText('سلف قائمة لم تُسوَّ').nextElementSibling).toHaveTextContent('7,000.00');
    expect(card('السلف والالتزامات').getByText('التزامات متعاقد عليها لم تُصرف').nextElementSibling).toHaveTextContent('6,000.00');
  });

  it('keeps the chosen period in the address, and narrows the statement to it', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'هذا الشهر' }));
    expect(screen.getByTestId('where')).toHaveTextContent('span=month');
    expect(line('قائمة الدخل', 'الإيراد المفوتر')).toHaveTextContent('40,000.00');
  });
});

describe('StatementsPanel for a set of projects', () => {
  it('charges what the company put on the project, counts its funding as cash in, and drops the company-only lines', () => {
    const C = { kind: 'company', id: null };
    ledger.value = { data: {
      expenses: [{ id: 'x', companyId: 'c1', date: '2026-02-01', amount: 9000, description: '', kind: 'salary', partyId: null, paidByPartyId: null }],
      allocations: [{ id: 'a', expenseId: 'x', projectId: 'A', amount: 5000 }],
      entries: [{ id: 'f', companyId: 'c1', date: '2026-01-05', amount: 20000, type: 'advance', from: C, to: { kind: 'project', id: 'A' }, note: '', dueDate: null, salaryExpenseId: null }],
    } };
    render(<MemoryRouter><StatementsPanel only={{ companyId: 'c1', projectIds: ['A'] }} /></MemoryRouter>);
    expect(line('قائمة الدخل', '− المحمَّل من المنظومة')).toHaveTextContent('5,000.00');
    expect(card('قائمة الدخل').queryByText('− تكاليف غير مباشرة')).not.toBeInTheDocument();
    expect(card('التدفق النقدي').getAllByRole('row')[1]).toHaveTextContent('▼ -10,000.00'); // 20,000 funding in, 30,000 spent
  });

  it('draws nothing when none of the projects is there', () => {
    const { container } = render(<MemoryRouter><StatementsPanel only={{ companyId: 'c1', projectIds: [] }} /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('periodOf', () => {
  it('starts each preset where it should and ends today', () => {
    expect(periodOf('ytd', '2026-11-20')).toEqual({ from: '2026-01-01', to: '2026-11-20' });
    expect(periodOf('quarter', '2026-11-20')).toEqual({ from: '2026-10-01', to: '2026-11-20' });
    expect(periodOf('month', '2026-11-20')).toEqual({ from: '2026-11-01', to: '2026-11-20' });
    expect(periodOf('12m', '2026-11-20')).toEqual({ from: '2025-12-01', to: '2026-11-20' });
    expect(periodOf('12m', '2026-01-05')).toEqual({ from: '2025-02-01', to: '2026-01-05' });
  });
});
