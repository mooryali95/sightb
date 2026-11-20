/**
 * One filter state drives the whole dashboard. The page is rendered with its
 * real sections (only the chart library and the filter bar are stood in), a
 * filter is put in the address bar, and every section is asked whether it
 * followed. The period is the one filter some sections do not follow by
 * decision (spend against budget is for the project's life, as on the
 * project page): those must say so in view.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { format } from 'date-fns';
import { useStore, type AppState } from '@/store/useStore';
import type { BudgetItem, Company, Expense, Portfolio, Project, Risk } from '@/types/project';
import Dashboard from '../Dashboard';

const C = { kind: 'company', id: null };
const fund = (id: string, companyId: string, projectId: string, amount: number) => ({
  id, companyId, date: '2026-05-01', amount, type: 'advance', from: C, to: { kind: 'project', id: projectId }, note: '', dueDate: null, salaryExpenseId: null,
});
const ledgers: Record<string, unknown> = {
  // 10,000 sent to a1; 7,000 sent to a2 and a 3,000 salary charged to it.
  ca: {
    expenses: [{ id: 'x1', companyId: 'ca', date: '2026-05-01', amount: 3000, description: '', kind: 'salary', partyId: null, paidByPartyId: null }],
    allocations: [{ id: 'x1a2', expenseId: 'x1', projectId: 'a2', amount: 3000 }],
    entries: [fund('f1', 'ca', 'a1', 10000), fund('f2', 'ca', 'a2', 7000)],
  },
  cb: { expenses: [], allocations: [], entries: [] },
};

vi.mock('@/hooks/useRole', () => ({ useRole: () => ({ isAdmin: true, canEdit: () => true, isAdminFor: () => true, hasAccess: () => true, loading: false }) }));
vi.mock('@/hooks/useAppData', () => ({ useCoreData: () => ({ isError: false }), useDetailsData: () => undefined }));
vi.mock('@/hooks/useCompanyLedger', () => ({
  useCompanyExpenseAmounts: () => ({ data: [] }),
  useCompanyLedger: (id: string) => ({ data: ledgers[id] }),
}));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/components/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }) }));
vi.mock('@/components/dashboard/DashboardFilters', () => ({ DashboardFilters: () => null }));
vi.mock('@/components/guide/GettingStarted', () => ({ GettingStarted: () => null }));
vi.mock('@/components/guide/ConceptGuide', () => ({ FirstRunGuide: () => null }));
vi.mock('@/components/dashboard/DashboardCharts', () => ({
  DashboardCharts: (p: { companyData: { name: string; value: number }[]; statusData: { name: string; value: number }[] }) => (
    <section aria-label="الرسوم"><pre data-testid="charts">{JSON.stringify(p)}</pre></section>
  ),
}));
vi.mock('recharts', () => {
  const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const Nothing = () => null;
  return {
    ResponsiveContainer: Box, ScatterChart: Box, CartesianGrid: Nothing, XAxis: Nothing, YAxis: Nothing, ZAxis: Nothing, Tooltip: Nothing, Cell: Nothing,
    Scatter: ({ data }: { data: { name: string }[] }) => <ul data-testid="points">{data.map((d) => <li key={d.name}>{d.name}</li>)}</ul>,
  };
});

const today = format(new Date(), 'yyyy-MM-dd');
const companies: Company[] = [
  { id: 'ca', name: 'شركة الواحة', status: 'active', createdAt: '' },
  { id: 'cb', name: 'شركة السدرة', status: 'active', createdAt: '' },
];
const portfolios: Portfolio[] = [
  { id: 'pfa1', companyId: 'ca', name: 'محفظة الطرق', targetRevenue: 0, targetMargin: 0, createdAt: '' },
  { id: 'pfa2', companyId: 'ca', name: 'محفظة المباني', targetRevenue: 0, targetMargin: 0, createdAt: '' },
  { id: 'pfb1', companyId: 'cb', name: 'محفظة الصيانة', targetRevenue: 0, targetMargin: 0, createdAt: '' },
];
function project(over: Partial<Project>): Project {
  return {
    id: 'p', companyId: 'ca', name: 'مشروع', contractValue: 100000, currency: 'SAR', startDate: '2026-01-01', endDate: '2026-12-31',
    durationMonths: 12, resourceCount: 1, status: 'active', createdAt: '', percentComplete: 40, contractType: 'lump_sum',
    retentionPercent: 0, managementReserve: 0, taxPercent: 0, vatInclusive: false, ...over,
  };
}
const projects: Project[] = [
  project({ id: 'a1', name: 'جسر الشمال', portfolioId: 'pfa1' }),
  project({ id: 'a2', name: 'برج المكاتب', portfolioId: 'pfa2' }),
  project({ id: 'a3', name: 'مستودع الميناء' }),
  project({ id: 'b1', name: 'جسر الجنوب', companyId: 'cb', portfolioId: 'pfb1' }),
];
const budget = (id: string, projectId: string, plannedAmount: number) => ({ id, projectId, category: 'salary', description: 'بند', plannedAmount, costType: 'fixed', costClass: 'direct' }) as BudgetItem;
const budgetItems = [budget('ba1', 'a1', 50000), budget('ba2', 'a2', 40000), budget('ba3', 'a3', 20000), budget('bb1', 'b1', 30000)];
const spend = (id: string, projectId: string, amount: number, date = '2026-02-10'): Expense => ({ id, projectId, category: 'salary', description: 'مصروف', amount, date, month: 1, approvalStatus: 'approved', isVatExempt: false });
// a1 and b1 are past 90% of their budgets; a2 and a3 are not. 1,000 of a1's spend is today's.
const expenses = [spend('ea1', 'a1', 47000), spend('ea1-now', 'a1', 1000, today), spend('ea2', 'a2', 5000), spend('ea3', 'a3', 2000), spend('eb1', 'b1', 29000)];
const risk = (over: Partial<Risk>): Risk => ({ id: 'k', title: 'خطر', probability: 'high', impact: 'high', financialImpact: 1000, category: 'financial', status: 'open', createdAt: '', ...over } as Risk);
const risks = [
  risk({ id: 'k1', projectId: 'a1', title: 'تأخر التوريد' }),
  risk({ id: 'k2', projectId: 'a2', title: 'تعثر المقاول' }),
  risk({ id: 'k3', portfolioId: 'pfa2', title: 'تغير الأسعار' }),
  risk({ id: 'k4', portfolioId: 'pfb1', title: 'نقص العمالة' }),
];

beforeEach(() => {
  useStore.setState({
    companies, portfolios, projects, budgetItems, expenses, revenues: [], changeOrders: [], milestones: [], risks, indirectCosts: [], loading: false,
  } satisfies Partial<AppState>);
});

const open = (search: string) => render(<MemoryRouter initialEntries={[`/${search}`]}><Dashboard /></MemoryRouter>);
const names = ['جسر الشمال', 'برج المكاتب', 'مستودع الميناء', 'جسر الجنوب'];
/** Which of the four project names a region shows. */
const shown = (el: HTMLElement) => names.filter((n) => within(el).queryAllByText(n).length > 0);
const table = () => screen.getByRole('heading', { name: /المشاريع المصفاة|جميع المشاريع/ }).closest('.stat-card') as HTMLElement;
const attention = () => screen.getByRole('heading', { name: /مشاريع تحتاج انتباه/ }).closest('.stat-card') as HTMLElement;
const topRisks = () => screen.getByRole('heading', { name: 'أعلى المخاطر المفتوحة' }).closest('.stat-card') as HTMLElement;
const portfoliosCard = () => screen.getByRole('heading', { name: 'أداء المحافظ' }).parentElement as HTMLElement;
const projectCount = () => screen.getByText('إجمالي المشاريع').closest('.stat-card') as HTMLElement;
const notes = () => document.querySelectorAll('[data-lifetime-note]').length;

describe('search narrows every section to the same projects', () => {
  it('shows the two «جسر» projects, and only them, in each section', async () => {
    open('?q=جسر');
    const two = ['جسر الشمال', 'جسر الجنوب'];
    // The headline card and the strip beside it.
    expect(projectCount()).toHaveTextContent('2');
    expect(projectCount()).toHaveTextContent('شركتان · محفظتان');
    expect(screen.getByRole('region', { name: 'المركز المالي' })).toHaveTextContent('مشروعان بحاجة إلى تدخل');
    // «المنظومات»: one project each, and the books count the visible project only
    // (10,000 sent to «جسر الشمال»; not the 7,000 sent to the hidden «برج المكاتب»
    // nor the 3,000 charged to it, and it owes only its own 10,000).
    const systems = screen.getByRole('region', { name: 'المنظومات' });
    expect(within(systems).getByRole('link', { name: /^شركة الواحة:/ })).toHaveAccessibleName('شركة الواحة: 1 مشروع، يحتاج انتباه 1');
    expect(within(systems).getByRole('link', { name: /^شركة الواحة:/ })).toHaveTextContent('أرسلت للمشاريع 10,000.00 ر.س · عاد 0.00 ر.س · لها على المشاريع 10,000.00 ر.س');
    expect(within(systems).getByRole('link', { name: /^شركة السدرة:/ })).toHaveAccessibleName('شركة السدرة: 1 مشروع، يحتاج انتباه 1');
    // The attention list, the cards, the table, the matrix, the portfolios and the charts.
    expect(shown(attention())).toEqual(two);
    expect(shown(table())).toEqual(two);
    expect(shown(await screen.findByTestId('points'))).toEqual(two);
    expect(portfoliosCard()).toHaveTextContent('محفظة الطرق');
    expect(portfoliosCard()).toHaveTextContent('محفظة الصيانة');
    expect(portfoliosCard()).not.toHaveTextContent('محفظة المباني');
    const charts = JSON.parse((await screen.findByTestId('charts')).textContent || '{}') as { companyData: { name: string; value: number }[] };
    expect(charts.companyData).toEqual([{ name: 'شركة الواحة', value: 48000 }, { name: 'شركة السدرة', value: 29000 }]);
    // Each visible project appears as a card and as a table row, and the hidden two nowhere.
    for (const n of two) expect(screen.getAllByText(n).length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText('برج المكاتب')).toBeNull();
    expect(screen.queryByText('مستودع الميناء')).toBeNull();
    // A project's risk follows its project.
    expect(topRisks()).toHaveTextContent('تأخر التوريد');
    expect(topRisks()).not.toHaveTextContent('تعثر المقاول');
  });

  it('shows all four without a filter, with every company and portfolio counted', () => {
    open('');
    expect(shown(table())).toEqual(names);
    expect(projectCount()).toHaveTextContent('شركتان · 3 محافظ');
    expect(within(screen.getByRole('region', { name: 'المنظومات' })).getByRole('link', { name: /^شركة الواحة:/ })).toHaveTextContent('أرسلت للمشاريع 20,000.00 ر.س · عاد 0.00 ر.س · لها على المشاريع 17,000.00 ر.س');
    for (const t of ['تأخر التوريد', 'تعثر المقاول', 'تغير الأسعار', 'نقص العمالة']) expect(topRisks()).toHaveTextContent(t);
  });
});

describe('a company or a portfolio narrows the risks and the counts too', () => {
  it('lists only the chosen company\'s risks, its portfolio risks included, and counts one company', () => {
    open('?company=cb');
    expect(shown(table())).toEqual(['جسر الجنوب']);
    expect(topRisks()).toHaveTextContent('نقص العمالة');
    for (const t of ['تأخر التوريد', 'تعثر المقاول', 'تغير الأسعار']) expect(topRisks()).not.toHaveTextContent(t);
    expect(projectCount()).toHaveTextContent('شركة واحدة · محفظة واحدة');
    // One company on screen: its own page says it better, so the strip steps aside.
    expect(screen.queryByRole('region', { name: 'المنظومات' })).toBeNull();
  });

  it('follows a chosen portfolio', () => {
    open('?portfolio=pfa2');
    expect(shown(table())).toEqual(['برج المكاتب']);
    expect(topRisks()).toHaveTextContent('تعثر المقاول');
    expect(topRisks()).toHaveTextContent('تغير الأسعار');
    expect(topRisks()).not.toHaveTextContent('نقص العمالة');
    expect(portfoliosCard()).toHaveTextContent('محفظة المباني');
    expect(portfoliosCard()).not.toHaveTextContent('محفظة الطرق');
  });
});

describe('the period', () => {
  it('narrows the dated figures, and every section that stays on the project\'s whole life says so', async () => {
    open('?period=month');
    await screen.findByTestId('points');
    // Dated: only today's 1,000 of spend is in the month.
    const spent = screen.getByText('إجمالي المصروفات').closest('.stat-card') as HTMLElement;
    expect(spent).toHaveTextContent('1,000.00');
    const charts = JSON.parse((await screen.findByTestId('charts')).textContent || '{}') as { companyData: unknown };
    expect(charts.companyData).toEqual([{ name: 'شركة الواحة', value: 1000 }]);
    // Whole-life sections: the systems strip, the attention list, the portfolios, the matrix, the cards and the table.
    for (const el of [screen.getByRole('region', { name: 'المنظومات' }), attention(), portfoliosCard(), (await screen.findByTestId('points')).closest('.stat-card') as HTMLElement, table()]) {
      expect(within(el).getByRole('note')).toHaveTextContent('لعمر المشروع كله، لا للفترة المحددة');
    }
    expect(notes()).toBe(6);
    // The table still shows the life-to-date spend, which is why it says so.
    expect(table()).toHaveTextContent('48,000.00');
    // The two undated headline cards and the receivable say it in their own line.
    expect(screen.getByText('قيمة العقود الفعّالة').closest('.stat-card')).toHaveTextContent('تراكمي، لا يتبع الفترة');
    expect(screen.getAllByText('الربح المخطط')[0].closest('.stat-card')).toHaveTextContent('تراكمي، لا يتبع الفترة');
    expect(screen.getByRole('region', { name: 'المركز المالي' })).toHaveTextContent('مستحق على العملاء (الآن، لا للفترة)');
    expect(screen.getByRole('region', { name: 'المركز المالي' })).toHaveTextContent('الربحية المخططة (تراكمية)');
  });

  it('says nothing of the kind when no period is chosen', async () => {
    open('');
    await screen.findByTestId('points');
    expect(notes()).toBe(0);
    expect(screen.queryByText(/لا يتبع الفترة/)).toBeNull();
    expect(screen.queryByText(/لا للفترة/)).toBeNull();
  });
});
