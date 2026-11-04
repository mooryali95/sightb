/**
 * Component tests for the portfolio page, written before it is split.
 *
 * The page rolls its projects up three ways (stat cards, a comparison
 * table, three charts) and they must agree. Then the edit form, the two
 * exports, and the admin-only delete.
 *
 * Two tests were red when written. The cumulative cash-flow chart counted
 * rejected expenses in its "actual" line while the stat card and the
 * table excluded them, because the monthly breakdown in the finance
 * library skipped outstanding advances but not rejections. And clearing
 * the description or the fiscal year sent `undefined`, which the store
 * reads as unchanged. The fix commits that follow turn them green without
 * editing a test.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { toast } from 'sonner';
import { useStore, type AppState } from '@/store/useStore';
import { exportPortfolioToExcel, exportPortfolioToPDF } from '@/lib/export-lazy';
import PortfolioDetail from '../PortfolioDetail';
import { PORTFOLIO_ID, company, expenses, portfolio, projects, revenues, risks } from './portfolio-fixtures';

const roleState = { isAdmin: true, canEdit: true };

vi.mock('@/hooks/useRole', () => ({
  useRole: () => ({
    roles: [], isAdmin: roleState.isAdmin, isOwner: false, isScopedAdmin: roleState.isAdmin,
    isAdminFor: () => roleState.isAdmin, canEdit: () => roleState.canEdit, hasAccess: () => true, loading: false,
  }),
}));
vi.mock('@/hooks/useAppData', () => ({ useCoreData: () => undefined }));
vi.mock('@/components/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/project/RisksSection', () => ({
  RisksSection: ({ risks }: { risks: { title: string }[] }) => <p>مخاطر في النطاق: {risks.length}</p>,
}));
vi.mock('@/components/portfolio/PortfolioPayablesSection', () => ({
  PortfolioPayablesSection: ({ projects }: { projects: { id: string }[] }) => <p>مستحقات لـ {projects.length} مشروع</p>,
}));
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));
vi.mock('@/lib/export-lazy', () => ({
  exportPortfolioToExcel: vi.fn().mockResolvedValue(undefined),
  exportPortfolioToPDF: vi.fn().mockResolvedValue(undefined),
}));
// The chart library measures its container, which jsdom cannot do. The
// stand-ins print the series they were given, so the figures stay testable.
vi.mock('recharts', () => {
  const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const Nothing = () => null;
  return {
    ResponsiveContainer: Box, PieChart: Box, Cell: Nothing, Tooltip: Nothing, Legend: Nothing,
    CartesianGrid: Nothing, XAxis: Nothing, YAxis: Nothing, Bar: Nothing, Line: Nothing,
    Pie: ({ data }: { data: { name: string; value: number }[] }) => (
      <ul data-testid="pie">{data.map((d) => <li key={d.name}>{`${d.name}: ${d.value}`}</li>)}</ul>
    ),
    BarChart: ({ data }: { data: Record<string, string | number>[] }) => (
      <ul data-testid="bars">{data.map((d) => <li key={String(d.name)}>{`${d.name}: ${d['الربح المخطط']}`}</li>)}</ul>
    ),
    LineChart: ({ data }: { data: { month: number; مخطط: number; فعلي: number }[] }) => (
      <ul data-testid="cashflow">{data.map((d) => <li key={d.month}>{`${d.month}: ${d.مخطط} / ${d.فعلي}`}</li>)}</ul>
    ),
  };
});

const actions = {
  loadAll: vi.fn().mockResolvedValue(undefined),
  loadProjectData: vi.fn().mockResolvedValue(undefined),
  updatePortfolio: vi.fn().mockResolvedValue(undefined),
  deletePortfolio: vi.fn().mockResolvedValue(undefined),
};

function seedStore(over: Partial<AppState> = {}) {
  useStore.setState({
    companies: [company], portfolios: [portfolio], projects, expenses, revenues, risks,
    budgetItems: [], changeOrders: [], milestones: [],
    loading: false,
    ...actions,
    ...over,
  } satisfies Partial<AppState>);
}

function renderPage(id = PORTFOLIO_ID) {
  return render(
    <MemoryRouter initialEntries={[`/portfolio/${id}`]}>
      <Routes>
        <Route path="/portfolio/:id" element={<PortfolioDetail />} />
        <Route path="/" element={<p>لوحة التحكم الرئيسية</p>} />
        <Route path="/project/:id" element={<p>صفحة المشروع</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** The figure on a stat card, by its title. */
function statFigure(title: string): string | undefined {
  const card = screen.getByText(title).closest('div.stat-card') as HTMLElement;
  return card.querySelector('.stat-value')?.textContent ?? undefined;
}

/** The comparison-table row a project's name sits in. */
function rowFor(name: string): HTMLElement {
  const row = screen.getByText(name, { selector: 'td' }).closest('tr');
  if (!row) throw new Error(`"${name}" is not in the table`);
  return row;
}

beforeEach(() => {
  roleState.isAdmin = true; roleState.canEdit = true;
  Object.values(actions).forEach((fn) => fn.mockClear());
  vi.mocked(toast.error).mockClear();
  vi.mocked(exportPortfolioToExcel).mockClear();
  vi.mocked(exportPortfolioToPDF).mockClear();
  seedStore();
});

describe('the figures at the top', () => {
  it('rolls the two projects up, excluding rejected expenses and outstanding advances', () => {
    renderPage();
    // 100,000 + 50,000 contracts; 10,000 + 5,000 counted spend; no budget,
    // so planned profit is the whole contract value.
    expect(statFigure('قيمة العقود الفعّالة')).toBe('150,000.00 ر.س');
    expect(statFigure('المصروف الفعلي')).toBe('15,000.00 ر.س');
    expect(statFigure('الربح المخطط الإجمالي')).toBe('150,000.00 ر.س');
    // (40 × 100,000 + 20 × 50,000) / 150,000
    expect(statFigure('الإنجاز المرجّح')).toBe('33.3%');
    expect(screen.getByText(/مشروعان · السنة المالية 2026/)).toBeInTheDocument();
  });

  it('measures collected revenue against the target', () => {
    renderPage();
    expect(screen.getByText('30,000.00 ر.س / 100,000.00 ر.س')).toBeInTheDocument();
    expect(screen.getByText('30.0% من المستهدف')).toBeInTheDocument();
  });

  it('puts the project in trouble first in the table and names why', () => {
    renderPage();
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]).getByText('مشروع البلدية')).toBeInTheDocument();
    expect(within(rows[0]).getByText('حرج')).toBeInTheDocument();
    expect(within(rowFor('مشروع الوزارة')).getByText('سليم')).toBeInTheDocument();
    expect(within(rowFor('مشروع الوزارة')).getByText('10,000.00 ر.س')).toBeInTheDocument();
    expect(screen.queryByText('مشروع خارج المحفظة')).not.toBeInTheDocument();
  });

  it('charts the same spend and profit the table shows', () => {
    renderPage();
    const pie = screen.getByTestId('pie');
    expect(within(pie).getByText('مشروع الوزارة: 10000')).toBeInTheDocument();
    expect(within(pie).getByText('مشروع البلدية: 5000')).toBeInTheDocument();
    expect(within(screen.getByTestId('bars')).getByText('مشروع الوزارة: 100000')).toBeInTheDocument();
  });

  it('accumulates the cash flow from the same expenses as the stat card', () => {
    renderPage();
    const cashflow = screen.getByTestId('cashflow');
    // Month 1: the 5,000 on the held project. Month 2 adds the 10,000
    // approved on the active one; the rejected 3,000 and the outstanding
    // 2,000 advance are not spend above and cannot be spend here. Planned
    // revenue counts the 30,000 in month 2.
    expect(within(cashflow).getByText('1: 0 / -5000')).toBeInTheDocument();
    expect(within(cashflow).getByText('2: 30000 / 15000')).toBeInTheDocument();
  });

  it('hands the risks in scope to the risks section, and the projects to the payables one', () => {
    renderPage();
    // The project risk and the portfolio risk; not the one on a project elsewhere.
    expect(screen.getByText('مخاطر في النطاق: 2')).toBeInTheDocument();
    expect(screen.getByText('مستحقات لـ 2 مشروع')).toBeInTheDocument();
  });

  it('says so when the portfolio does not exist', () => {
    renderPage('no-such-portfolio');
    expect(screen.getByText('المحفظة غير موجودة')).toBeInTheDocument();
  });
});

describe('editing, exporting and deleting the portfolio', () => {
  it('opens the edit form on the portfolio and saves the targets', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /تعديل/ }));
    const dialog = screen.getByRole('dialog');
    const [name] = within(dialog).getAllByRole('textbox');
    expect((name as HTMLInputElement).value).toBe('محفظة الحكومة');
    const [targetRevenue, targetMargin] = within(dialog).getAllByRole('spinbutton');
    expect((targetRevenue as HTMLInputElement).value).toBe('100000');
    fireEvent.change(targetRevenue, { target: { value: '120000' } });
    fireEvent.change(targetMargin, { target: { value: '25' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ' }));

    await waitFor(() => expect(actions.updatePortfolio).toHaveBeenCalledWith(PORTFOLIO_ID, expect.objectContaining({
      name: 'محفظة الحكومة', description: 'عقود حكومية', targetRevenue: 120000, targetMargin: 25, fiscalYear: '2026',
    })));
  });

  it('clears the description and the fiscal year when they are emptied', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /تعديل/ }));
    const dialog = screen.getByRole('dialog');
    const [, description, fiscalYear] = within(dialog).getAllByRole('textbox');
    fireEvent.change(description, { target: { value: '' } });
    fireEvent.change(fiscalYear, { target: { value: '' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ' }));

    // `undefined` would mean "leave it", and the old values would survive.
    await waitFor(() => expect(actions.updatePortfolio).toHaveBeenCalledWith(PORTFOLIO_ID, expect.objectContaining({
      description: null, fiscalYear: null,
    })));
  });

  it('refuses an empty name', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /تعديل/ }));
    const dialog = screen.getByRole('dialog');
    const [name] = within(dialog).getAllByRole('textbox');
    fireEvent.change(name, { target: { value: '   ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('اسم المحفظة مطلوب'));
    expect(actions.updatePortfolio).not.toHaveBeenCalled();
  });

  it('exports the same payload to Excel and to PDF, naming each risk\'s project', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Excel/ }));
    fireEvent.click(screen.getByRole('button', { name: /PDF/ }));

    const [excel] = vi.mocked(exportPortfolioToExcel).mock.calls[0];
    expect(excel.portfolioName).toBe('محفظة الحكومة');
    expect(excel.summary.totalActual).toBe(15000);
    expect(excel.projectSummaries).toEqual([
      expect.objectContaining({ name: 'مشروع البلدية', actual: 5000, health: 'حرج' }),
      expect.objectContaining({ name: 'مشروع الوزارة', actual: 10000, health: 'سليم', percentComplete: 40 }),
    ]);
    expect(excel.risks).toEqual([
      expect.objectContaining({ title: 'تأخر التوريد', project: 'مشروع الوزارة', probability: 'مرتفع', status: 'مفتوح' }),
      expect.objectContaining({ title: 'تغير التشريعات', project: 'محفظة الحكومة', status: 'قيد المعالجة' }),
    ]);
    expect(vi.mocked(exportPortfolioToPDF).mock.calls[0][0]).toEqual(excel);
  });

  it('lets an admin delete after confirmation, then leaves the page', async () => {
    renderPage();
    const deleteTrigger = screen.getAllByRole('button').find((b) => b.querySelector('svg.lucide-trash2.w-4'));
    fireEvent.click(deleteTrigger!);
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'حذف' }));

    await waitFor(() => expect(actions.deletePortfolio).toHaveBeenCalledWith(PORTFOLIO_ID));
    await waitFor(() => expect(screen.getByText('لوحة التحكم الرئيسية')).toBeInTheDocument());
  });

  it('keeps delete from an editor, and the edit form from a viewer', () => {
    roleState.isAdmin = false; roleState.canEdit = true;
    const { unmount } = renderPage();
    expect(screen.getByRole('button', { name: /تعديل/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button').find((b) => b.querySelector('svg.lucide-trash2.w-4'))).toBeUndefined();
    unmount();

    roleState.canEdit = false;
    renderPage();
    expect(screen.queryByRole('button', { name: /تعديل/ })).not.toBeInTheDocument();
  });
});
