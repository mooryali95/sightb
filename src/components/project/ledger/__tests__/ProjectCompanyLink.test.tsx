import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProjectCompanyLink } from '../ProjectCompanyLink';
import type { IntercompanyEntry } from '@/lib/finance/company-ledger';

const ledger = vi.hoisted(() => ({ value: { data: undefined as unknown } }));
vi.mock('@/hooks/useCompanyLedger', () => ({ useCompanyLedger: () => ledger.value }));

const move = (id: string, from: IntercompanyEntry['from'], to: IntercompanyEntry['to'], amount: number, type: IntercompanyEntry['type'] = 'advance'): IntercompanyEntry => ({
  id, companyId: 'c', date: '2026-10-01', amount, type, from, to, note: '', dueDate: null, salaryExpenseId: null,
});
const C = { kind: 'company' as const, id: null };
const P = { kind: 'project' as const, id: 'p1' };
const project = { id: 'p1', name: 'برج الأفق', group: '', status: 'active' as const, contract: 100000, planned: 80000, actual: 20000, collected: 0 };
const renderCard = (companyId: string | undefined = 'c') => render(<MemoryRouter><ProjectCompanyLink project={project} companyId={companyId} companyName="الأفق" /></MemoryRouter>);

beforeEach(() => { ledger.value = { data: undefined }; });

describe('ProjectCompanyLink', () => {
  it('shows what reached the project from the company, what went back, and what it owes', () => {
    ledger.value = { data: {
      entries: [move('f', C, P, 40000), move('r', P, C, 15000, 'repayment')],
      expenses: [{ id: 'e', companyId: 'c', date: '2026-10-01', amount: 10000, description: '', kind: 'salary', partyId: null, paidByPartyId: null }],
      allocations: [{ id: 'a', expenseId: 'e', projectId: 'p1', amount: 6000 }],
      parties: [],
    } };
    renderCard();
    const card = screen.getByRole('region', { name: 'علاقة المشروع بالمنظومة' });
    expect(screen.getByText('من دفعاته (للمشروع وحده)').parentElement).toHaveTextContent('20,000.00');
    expect(screen.getByText('وصله من المنظومة').parentElement).toHaveTextContent('46,000.00');
    expect(screen.getByText('عاد منه إليها').parentElement).toHaveTextContent('15,000.00');
    expect(card).toHaveTextContent('عليه للمنظومة 25,000.00');
    expect(screen.getByRole('link', { name: /خريطة المنظومة/ })).toHaveAttribute('href', '/company/c');
  });

  it('says plainly when the company neither funded nor charged the project', () => {
    ledger.value = { data: { entries: [], expenses: [], allocations: [], parties: [] } };
    renderCard();
    expect(screen.getByText(/لم تموّله المنظومة ولم تحمّل عليه شيئاً/)).toBeInTheDocument();
  });

  it('draws nothing without a company, or for a reader who cannot open its books', () => {
    const { container, unmount } = renderCard(undefined);
    expect(container).toBeEmptyDOMElement();
    unmount();
    expect(renderCard().container).toBeEmptyDOMElement();
  });
});
