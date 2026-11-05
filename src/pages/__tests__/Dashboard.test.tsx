/**
 * Page tests for the dashboard's figures, written before the page's
 * derivations are split out. The cards, charts and tables are stood in
 * by components that print what they are handed, so what is tested is
 * the numbers the page computes from the store under each filter.
 *
 * One test was red when written: with a period selected, the total
 * expenses card counted the period only while the "expenses by company"
 * chart beside it counted every expense ever, so the two disagreed on the
 * same screen. The fix commit that follows turns it green without editing
 * a test.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { format, subMonths } from 'date-fns';
import { useStore, type AppState } from '@/store/useStore';
import { PROJECT_STATUS_LABELS, type BudgetItem, type ChangeOrder, type Company, type Expense, type Project, type Revenue } from '@/types/project';
import Dashboard from '../Dashboard';

vi.mock('@/hooks/useRole', () => ({ useRole: () => ({ isAdmin: true, canEdit: () => true, isAdminFor: () => true, hasAccess: () => true, loading: false }) }));
vi.mock('@/hooks/useAppData', () => ({ useCoreData: () => ({ isError: false }), useDetailsData: () => undefined }));
// One company expense of 5,000 on c1 and one on a company not on screen.
vi.mock('@/hooks/useCompanyLedger', () => ({
  useCompanyExpenseAmounts: () => ({ data: [{ companyId: 'c1', amount: 5000 }, { companyId: 'elsewhere', amount: 999 }] }),
}));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/components/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));

// The filter bar is stood in by buttons that drive the same setters; the
// stats and charts print what they receive; everything else renders nothing.
vi.mock('@/components/dashboard/DashboardFilters', () => ({
  DashboardFilters: (p: { setTimePeriod: (v: string) => void; setShowInactive: (v: boolean) => void; setFilterCompany: (v: string) => void; setSearchQuery: (v: string) => void; filteredCount: number; totalCount: number }) => (
    <div>
      <span data-testid="counts">{`${p.filteredCount}/${p.totalCount}`}</span>
      <button type="button" onClick={() => p.setTimePeriod('month')}>period:month</button>
      <button type="button" onClick={() => p.setShowInactive(true)}>inactive:on</button>
      <button type="button" onClick={() => p.setFilterCompany('c2')}>company:c2</button>
      <button type="button" onClick={() => p.setSearchQuery('البلدية')}>search:البلدية</button>
    </div>
  ),
}));
vi.mock('@/components/dashboard/DashboardStats', () => ({
  DashboardStats: (p: Record<string, unknown>) => <pre data-testid="stats">{JSON.stringify(p)}</pre>,
}));
vi.mock('@/components/dashboard/DashboardCharts', () => ({
  DashboardCharts: (p: { companyData: { name: string; value: number }[]; statusData: { name: string; value: number }[] }) => (
    <pre data-testid="charts">{JSON.stringify(p)}</pre>
  ),
}));
vi.mock('@/components/dashboard/PortfolioPerformance', () => ({ PortfolioPerformance: () => null }));
vi.mock('@/components/dashboard/HealthMatrix', () => ({ HealthMatrix: () => null }));
vi.mock('@/components/dashboard/AttentionProjects', () => ({ AttentionProjects: () => null }));
vi.mock('@/components/dashboard/ProjectCards', () => ({ ProjectCards: () => null }));
vi.mock('@/components/dashboard/ProjectsTable', () => ({ ProjectsTable: () => null }));
vi.mock('@/components/dashboard/CompanyManagement', () => ({ CompanyManagement: () => null }));
vi.mock('@/components/dashboard/SnapshotControls', () => ({ SnapshotControls: () => null }));

const thisMonth = format(new Date(), 'yyyy-MM-15');
const lastMonth = format(subMonths(new Date(), 1), 'yyyy-MM-15');
const threeMonthsAgo = format(subMonths(new Date(), 3), 'yyyy-MM-15');

const companies: Company[] = [
  { id: 'c1', name: 'شركة نشطة', status: 'active', createdAt: '' },
  { id: 'c2', name: 'شركة مؤرشفة', status: 'archived', createdAt: '' },
];
function project(over: Partial<Project>): Project {
  return {
    id: 'p', companyId: 'c1', name: 'مشروع', contractValue: 0, currency: 'SAR', startDate: '2026-01-01', endDate: '2026-12-31',
    durationMonths: 12, resourceCount: 1, status: 'active', createdAt: '', percentComplete: 0, contractType: 'lump_sum',
    retentionPercent: 0, managementReserve: 0, taxPercent: 15, vatInclusive: false, ...over,
  };
}
const projects: Project[] = [
  project({ id: 'p1', name: 'مشروع الوزارة', contractValue: 100000 }),
  project({ id: 'p2', name: 'مشروع البلدية', contractValue: 40000, status: 'completed' }),
  project({ id: 'p3', name: 'مشروع مؤرشف', companyId: 'c2', contractValue: 30000 }),
];
const budgetItems: BudgetItem[] = [
  { id: 'b1', projectId: 'p1', category: 'salary', description: 'رواتب', plannedAmount: 30000, costType: 'fixed', costClass: 'direct' } as BudgetItem,
  { id: 'b2', projectId: 'p2', category: 'salary', description: 'رواتب', plannedAmount: 35000, costType: 'fixed', costClass: 'direct' } as BudgetItem,
];
function expense(over: Partial<Expense>): Expense {
  return { id: 'e', projectId: 'p1', category: 'salary', description: 'مصروف', amount: 0, date: thisMonth, month: 1, approvalStatus: 'approved', isVatExempt: false, ...over };
}
const expenses: Expense[] = [
  expense({ id: 'e1', amount: 10000 }),
  expense({ id: 'e2', amount: 4000, date: threeMonthsAgo }),
  expense({ id: 'e3', amount: 2000, approvalStatus: 'rejected' }),
  expense({ id: 'e4', amount: 5000, projectId: 'p2' }),
  expense({ id: 'e5', amount: 7000, projectId: 'p3' }),
];
const revenues: Revenue[] = [
  { id: 'r1', projectId: 'p1', description: 'دفعة', amount: 20000, date: thisMonth, month: 1, revenueType: 'milestone', status: 'collected' },
  { id: 'r2', projectId: 'p1', description: 'دفعة سابقة', amount: 6000, date: lastMonth, month: 1, revenueType: 'milestone', status: 'collected' },
  { id: 'r3', projectId: 'p1', description: 'مفوترة', amount: 9000, date: thisMonth, month: 1, revenueType: 'milestone', status: 'invoiced' },
];
const changeOrders: ChangeOrder[] = [
  { id: 'co1', projectId: 'p1', description: 'توسعة', changeType: 'scope_addition', amountImpact: 10000, durationImpact: 0, status: 'approved', createdAt: '' },
  { id: 'co2', projectId: 'p1', description: 'مقترح', changeType: 'other', amountImpact: 5000, durationImpact: 0, status: 'proposed', createdAt: '' },
];

function Where() { const l = useLocation(); return <span data-testid="where">{l.search}</span>; }
function renderDashboard(at = '/') {
  return render(<MemoryRouter initialEntries={[at]}><Dashboard /><Where /></MemoryRouter>);
}
const stats = () => JSON.parse(screen.getByTestId('stats').textContent || '{}') as Record<string, unknown>;
// The charts load lazily, so they arrive a tick after the page.
const charts = async () => JSON.parse((await screen.findByTestId('charts')).textContent || '{}') as { companyData: { name: string; value: number }[]; statusData: { name: string; value: number }[] };

beforeEach(() => {
  useStore.setState({
    companies, portfolios: [], projects, budgetItems, expenses, revenues, changeOrders, milestones: [], risks: [], indirectCosts: [],
    loading: false,
  } satisfies Partial<AppState>);
});

describe('the default view', () => {
  it('shows the live projects of live companies only, and their figures', async () => {
    renderDashboard();
    // p2 is completed and p3 belongs to an archived company; both hidden by default.
    expect(screen.getByTestId('counts')).toHaveTextContent('1/1');
    const s = stats();
    expect(s.totalContractValue).toBe(100000);
    expect(s.approvedChangeImpact).toBe(10000);
    expect(s.effectiveTotalContract).toBe(110000);
    // 10,000 + 4,000; the rejected 2,000 and the hidden projects' spend do not count.
    expect(s.totalExpenses).toBe(14000);
    expect(s.plannedProfit).toBe(80000);
    expect(s.plannedProfitMargin).toBeCloseTo(72.73, 1);
    expect(s.collectedRevenue).toBe(26000);
    expect(s.expenseChange).toBeNull();
    expect((await charts()).companyData).toEqual([{ name: 'شركة نشطة', value: 14000 }]);
    expect((await charts()).statusData).toEqual([{ name: PROJECT_STATUS_LABELS.active, value: 1 }]);
  });

  it('brings the inactive projects in on request', async () => {
    renderDashboard();
    fireEvent.click(screen.getByRole('button', { name: 'inactive:on' }));
    expect(screen.getByTestId('counts')).toHaveTextContent('2/3');
    expect(stats().totalExpenses).toBe(19000);
    expect(stats().totalContractValue).toBe(140000);
    expect((await charts()).statusData).toEqual([
      { name: PROJECT_STATUS_LABELS.active, value: 1 }, { name: PROJECT_STATUS_LABELS.completed, value: 1 },
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'search:البلدية' }));
    expect(screen.getByTestId('counts')).toHaveTextContent('1/3');
    expect(stats().totalExpenses).toBe(5000);
  });

  it('shows an archived company\'s projects only when that company is chosen', async () => {
    renderDashboard();
    fireEvent.click(screen.getByRole('button', { name: 'company:c2' }));
    expect(screen.getByTestId('counts')).toHaveTextContent('1/1');
    expect(stats().totalExpenses).toBe(7000);
    expect((await charts()).companyData).toEqual([{ name: 'شركة مؤرشفة', value: 7000 }]);
  });
});

describe('a period', () => {
  it('narrows the expenses and the collected revenue to the period, compares with the one before, and keeps the chart on the same rows', async () => {
    renderDashboard();
    fireEvent.click(screen.getByRole('button', { name: 'period:month' }));
    const s = stats();
    expect(s.timePeriod).toBe('month');
    expect(s.totalExpenses).toBe(10000);
    // Nothing was spent last month, so there is no change to show; 20,000 collected against 6,000 the month before.
    expect(s.expenseChange).toBeNull();
    expect(s.collectedRevenue).toBe(20000);
    expect(s.revenueChange).toBeCloseTo(233.33, 1);
    // The planned figures are not dated: the contract and the budget stay whole.
    expect(s.effectiveTotalContract).toBe(110000);
    expect(s.plannedProfit).toBe(80000);
    expect((await charts()).companyData).toEqual([{ name: 'شركة نشطة', value: 10000 }]);
  });
});

describe('filters in the address bar', () => {
  it('opens on the filters a shared link carries', () => {
    renderDashboard('/?company=c2');
    // The archived company's live project only.
    expect(screen.getByTestId('counts')).toHaveTextContent('1/1');
    expect(stats().totalContractValue).toBe(30000);
  });

  it('writes a filter into the link and leaves defaults out', () => {
    renderDashboard();
    expect(screen.getByTestId('where')).toHaveTextContent(/^$/);
    fireEvent.click(screen.getByRole('button', { name: 'period:month' }));
    fireEvent.click(screen.getByRole('button', { name: 'search:البلدية' }));
    const search = new URLSearchParams(screen.getByTestId('where').textContent ?? '');
    expect(search.get('period')).toBe('month');
    expect(search.get('q')).toBe('البلدية');
    expect(search.has('company')).toBe(false);
  });
});

describe('the financial position', () => {
  it('nets the companies\' own spend and indirect costs off the projects\' planned profit, as the company page does', () => {
    useStore.setState({ indirectCosts: [{ id: 'ic', companyId: 'c1', amount: 20000, category: 'other', description: '', month: 1, date: '2026-01-01', allocationMethod: 'equal' }] } as Partial<AppState>);
    renderDashboard();
    const section = screen.getByRole('region', { name: 'المركز المالي' });
    expect(section).toHaveTextContent('ربح المشاريع80,000.00');
    // 20,000 indirect + 5,000 company expenses of c1; the other company's 999 stays out.
    expect(section).toHaveTextContent('مصاريف الشركات25,000.00');
    expect(screen.getByLabelText(/^صافي الشركة · 50\.0%: 55,000\.00/)).toBeInTheDocument();
  });
});
