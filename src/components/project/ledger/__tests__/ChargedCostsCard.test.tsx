import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChargedCostsCard } from '../ChargedCostsCard';

const svc = vi.hoisted(() => ({ listProjectChargedCosts: vi.fn() }));
vi.mock('@/services/companyLedgerService', async () => {
  const real = await vi.importActual<typeof import('@/services/companyLedgerService')>('@/services/companyLedgerService');
  return { ...svc, LedgerNotReady: real.LedgerNotReady };
});

const renderCard = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <div data-testid="host"><ChargedCostsCard projectId="p1" directActual={12000} /></div>
  </QueryClientProvider>,
);

beforeEach(() => vi.clearAllMocks());

describe('ChargedCostsCard', () => {
  it('shows the company\'s charges beside the direct spend, never inside it, and their sum as the full cost', async () => {
    svc.listProjectChargedCosts.mockResolvedValue([
      { allocationId: 'a1', expenseId: 'e1', date: '2026-10-01', kind: 'salary', description: 'راتب أكتوبر', amount: 6000, expenseAmount: 10000 },
      { allocationId: 'a2', expenseId: 'e2', date: '2026-10-02', kind: 'owner_salary', description: '', amount: 1500, expenseAmount: 5000 },
    ]);
    renderCard();
    const card = await screen.findByRole('region', { name: 'محمَّل من المنظومة' });
    expect(screen.getByText('المصروف المباشر').parentElement).toHaveTextContent('12,000.00');
    expect(screen.getAllByText('محمَّل من المنظومة')[1].parentElement).toHaveTextContent('7,500.00');
    expect(screen.getByText('التكلفة الشاملة').parentElement).toHaveTextContent('19,500.00');
    expect(screen.getByText('راتب أكتوبر').closest('tr')).toHaveTextContent('6,000.00 ر.س10,000.00 ر.س · 60%');
    expect(card).toHaveTextContent('رواتب الملاك');
  });

  it('lists a share the project already paid, marked, and does not add it to the full cost again', async () => {
    // Manzouma's insurance, paid by Dr Saleh, charged to the project, repaid from its own spend.
    svc.listProjectChargedCosts.mockResolvedValue([
      { allocationId: 'a1', expenseId: 'e1', date: '2026-08-06', kind: 'government', description: 'التأمينات الاجتماعية', amount: 1400, expenseAmount: 1400, settledInProject: true },
      { allocationId: 'a2', expenseId: 'e2', date: '2026-10-01', kind: 'rent', description: 'إيجار المكتب', amount: 1000, expenseAmount: 4000, settledInProject: false },
    ]);
    renderCard();
    const card = await screen.findByRole('region', { name: 'محمَّل من المنظومة' });
    expect(screen.getAllByText('محمَّل من المنظومة')[1].parentElement).toHaveTextContent('2,400.00');
    // 12,000 direct + only the 1,000 not already paid.
    expect(screen.getByText('التكلفة الشاملة').parentElement).toHaveTextContent('13,000.00');
    expect(screen.getByText('التأمينات الاجتماعية').closest('tr')).toHaveTextContent('مسدَّد ضمن مصروف المشروع');
    expect(screen.getByText('إيجار المكتب').closest('tr')).not.toHaveTextContent('مسدَّد ضمن مصروف المشروع');
    expect(card).toHaveTextContent('منها 1,400.00 ر.س سدّدها المشروع من مصروفه');
  });

  it('renders nothing while the ledger is not live, or when nothing was charged', async () => {
    const { LedgerNotReady } = await import('@/services/companyLedgerService');
    svc.listProjectChargedCosts.mockRejectedValue(new LedgerNotReady());
    const { unmount } = renderCard();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId('host')).toBeEmptyDOMElement();
    unmount();
    svc.listProjectChargedCosts.mockResolvedValue([]);
    renderCard();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId('host')).toBeEmptyDOMElement();
  });
});
