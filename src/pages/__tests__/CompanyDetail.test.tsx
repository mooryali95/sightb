/**
 * Component tests for the company page, written before it is split.
 *
 * The page rolls three projects up into one set of figures, so what costs
 * money here is agreement: the stat card, the pie chart and the project
 * cards must count the same expenses. Then the indirect-cost form, the
 * company edit, the two exports and the admin-only archive and delete.
 *
 * Two tests were red when written. The pie chart and the per-project spend
 * summed every expense, rejected ones and outstanding advances included,
 * while the stat card above them (from the summary library) excludes both,
 * so one screen gave two answers to "what did this project spend". And
 * clearing the company description sent `undefined`, which the store reads
 * as unchanged. The fix commit that follows turns them green without
 * editing a test.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { toast } from 'sonner';
import { useStore, type AppState } from '@/store/useStore';
import { exportCompanyToExcel, exportCompanyToPDF } from '@/lib/export-lazy';
import CompanyDetail from '../CompanyDetail';
import { COMPANY_ID, company, expenses, indirectCosts, portfolio, projects } from './company-fixtures';

const roleState = { isAdmin: true, canEdit: true };

vi.mock('@/hooks/useRole', () => ({
  useRole: () => ({
    roles: [], isAdmin: roleState.isAdmin, isOwner: false, isScopedAdmin: roleState.isAdmin,
    isAdminFor: () => roleState.isAdmin, canEdit: () => roleState.canEdit, hasAccess: () => true, loading: false,
  }),
}));
// One company expense of 20,000, 5,000 of it charged to a project: the net takes off all 20,000.
vi.mock('@/hooks/useCompanyLedger', () => ({
  useCompanyLedger: () => ({ data: {
    expenses: [{ id: 'ce1', companyId: 'c', date: '2026-01-01', amount: 20000, description: 'رواتب', kind: 'salary', partyId: null, paidByPartyId: null }],
    allocations: [{ id: 'a1', expenseId: 'ce1', projectId: 'p', amount: 5000 }], entries: [], parties: [],
  } }),
}));
vi.mock('@/hooks/useAppData', () => ({ useCoreData: () => undefined, useCompanyData: () => undefined }));
// The company ledger has its own tests (CompanyLedgerSection.test.tsx); here it only has to be placed.
// The map has its own tests (CompanyMap.test.tsx); here it only has to receive the company's projects.
vi.mock('../company/map/CompanyMap', () => ({
  CompanyMap: ({ projects }: { projects: { id: string }[] }) => <div data-testid="company-map">{projects.map((p) => p.id).join(',')}</div>,
}));
vi.mock('../company/ledger/CompanyLedgerSection', () => ({
  CompanyLedgerSection: ({ projects }: { projects: { name: string }[] }) => <div data-testid="ledger">{projects.map((p) => p.name).join('،')}</div>,
}));
// The registry has its own path (e2e/resource-registry.spec.ts); here it only has to be placed, with the company's projects.
vi.mock('../company/registry/RegistrySection', () => ({
  RegistrySection: ({ projects }: { projects: { name: string }[] }) => <div data-testid="registry">{projects.map((p) => p.name).join('،')}</div>,
}));
vi.mock('@/components/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));
vi.mock('@/lib/export-lazy', () => ({
  exportCompanyToExcel: vi.fn().mockResolvedValue(undefined),
  exportCompanyToPDF: vi.fn().mockResolvedValue(undefined),
  exportUnifiedStatement: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/hooks/useParties', () => ({ useParties: () => ({ data: [] }) }));
// The chart library measures its container, which jsdom cannot do. The
// stand-in prints the series it was given, so the figures stay testable.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PieChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Pie: ({ data }: { data: { name: string; value: number }[] }) => (
    <ul data-testid="pie">{data.map((d) => <li key={d.name}>{`${d.name}: ${d.value}`}</li>)}</ul>
  ),
  Cell: () => null, Tooltip: () => null, Legend: () => null,
}));

const actions = {
  loadAll: vi.fn().mockResolvedValue(undefined),
  loadCompanyData: vi.fn().mockResolvedValue(undefined),
  addIndirectCost: vi.fn().mockResolvedValue('new-ic'),
  deleteIndirectCost: vi.fn().mockResolvedValue(undefined),
  updateCompany: vi.fn().mockResolvedValue(undefined),
  deleteCompany: vi.fn().mockResolvedValue(undefined),
  archiveCompany: vi.fn().mockResolvedValue(undefined),
};

function seedStore(over: Partial<AppState> = {}) {
  useStore.setState({
    companies: [company], portfolios: [portfolio], projects, expenses, indirectCosts,
    budgetItems: [], revenues: [], changeOrders: [], milestones: [], risks: [],
    loading: false, detailsLoaded: true,
    ...actions,
    ...over,
  } satisfies Partial<AppState>);
}

function renderPage(id = COMPANY_ID) {
  return render(
    <MemoryRouter initialEntries={[`/company/${id}`]}>
      <Routes>
        <Route path="/company/:id" element={<CompanyDetail />} />
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

/** The card for a project, by name. */
function projectCard(name: string): HTMLElement {
  const el = screen.getByText(name).closest('div.cursor-pointer');
  if (!el) throw new Error(`no card for ${name}`);
  return el as HTMLElement;
}

function indirectBlock(): HTMLElement {
  return screen.getByText('التكاليف غير المباشرة (سجل قديم)').closest('div.stat-card') as HTMLElement;
}

beforeEach(() => {
  roleState.isAdmin = true; roleState.canEdit = true;
  Object.values(actions).forEach((fn) => fn.mockClear());
  vi.mocked(toast.error).mockClear();
  vi.mocked(exportCompanyToExcel).mockClear();
  vi.mocked(exportCompanyToPDF).mockClear();
  seedStore();
});

describe('the figures at the top', () => {
  it('rolls the three projects up and nets the indirect costs off the planned profit', () => {
    renderPage();
    // 100,000 + 50,000 + 20,000 contracts; 10,000 + 5,000 counted spend;
    // planned profit 170,000 with no budget, less 5,000 indirect and the
    // company's own 20,000, allocated part included.
    expect(statFigure('قيمة العقود الفعّالة')).toBe('170,000.00 ر.س');
    expect(statFigure('المصروف الفعلي')).toBe('15,000.00 ر.س');
    expect(statFigure('صافي ربح الشركة')).toBe('145,000.00 ر.س');
    expect(screen.getByText(/هامش 85\.3% · بعد مصاريف المنظومة 20,000\.00 ر\.س وغير المباشرة 5,000\.00 ر\.س/)).toBeInTheDocument();
  });

  it('counts the same expenses in the pie chart as in the stat card', () => {
    renderPage();
    const pie = screen.getByTestId('pie');
    // The rejected 3,000 and the outstanding 2,000 advance are not spend
    // above; they cannot be spend here.
    expect(within(pie).getByText('محفظة الحكومة: 10000')).toBeInTheDocument();
    expect(within(pie).getByText('مشاريع مستقلة: 5000')).toBeInTheDocument();
  });

  it('shows each project the spend the summary counts', () => {
    renderPage();
    expect(within(projectCard('مشروع مستقل')).getByText('5,000.00 ر.س')).toBeInTheDocument();
    fireEvent.click(screen.getByText('محفظة الحكومة').closest('div.rounded-xl')!.querySelector('button')!);
    expect(within(projectCard('مشروع الوزارة')).getByText(/المصروف: 10,000\.00 ر\.س/)).toBeInTheDocument();
  });

  it('hides finished projects until asked, and counts them in the subtitle', () => {
    renderPage();
    expect(screen.getByText(/محفظة واحدة · مشروعان/)).toBeInTheDocument();
    expect(screen.getByText('(1 منتهي)')).toBeInTheDocument();
    expect(screen.queryByText('مشروع منتهي')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /عرض المنتهية/ }));

    expect(screen.getByText('مشروع منتهي')).toBeInTheDocument();
    expect(screen.getByText(/محفظة واحدة · 3 مشاريع/)).toBeInTheDocument();
  });

  it('says so when the company does not exist', () => {
    renderPage('no-such-company');
    expect(screen.getByText('الشركة غير موجودة')).toBeInTheDocument();
  });
});

describe('indirect costs', () => {
  it('lists them with their total', () => {
    renderPage();
    const block = indirectBlock();
    expect(within(block).getByText('إيجار المكتب')).toBeInTheDocument();
    expect(within(block).getByText('إيجار')).toBeInTheDocument();
    expect(within(block).getByText('5,000.00 ر.س')).toBeInTheDocument();
  });

  it('takes no new ones: company spend is recorded once, as a company expense', () => {
    renderPage();
    const block = indirectBlock();
    expect(within(block).queryByRole('button', { name: /إضافة/ })).not.toBeInTheDocument();
    expect(within(block).getByText(/يُسجَّل من «مصروف منظومة» فقط/)).toBeInTheDocument();
  });

  it('deletes one after confirmation', async () => {
    renderPage();
    const row = within(indirectBlock()).getByText('حملة إعلانية').closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByRole('button'));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'حذف' }));

    await waitFor(() => expect(actions.deleteIndirectCost).toHaveBeenCalledWith('ic-marketing'));
  });

  it('offers a viewer neither the form nor the delete column', () => {
    roleState.isAdmin = false; roleState.canEdit = false;
    renderPage();
    const block = indirectBlock();
    expect(within(block).queryByRole('button', { name: /إضافة/ })).not.toBeInTheDocument();
    expect(within(within(block).getByText('حملة إعلانية').closest('tr') as HTMLElement).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /تعديل/ })).not.toBeInTheDocument();
  });
});

describe('editing, exporting, archiving and deleting the company', () => {
  it('opens the edit form on the company and saves the new name', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /تعديل/ }));
    const dialog = screen.getByRole('dialog');
    const [name] = within(dialog).getAllByRole('textbox');
    expect((name as HTMLInputElement).value).toBe('شركة الاختبار');
    fireEvent.change(name, { target: { value: 'شركة الاختبار المحدودة' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ' }));

    await waitFor(() => expect(actions.updateCompany).toHaveBeenCalledWith(COMPANY_ID, expect.objectContaining({
      name: 'شركة الاختبار المحدودة', description: 'شركة استشارية',
    })));
  });

  it('trims the name and the description before writing, and clears a blank description', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /تعديل/ }));
    const dialog = screen.getByRole('dialog');
    const [name, description] = within(dialog).getAllByRole('textbox');
    fireEvent.change(name, { target: { value: '  شركة الأفق  ' } });
    fireEvent.change(description, { target: { value: '   ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ' }));

    await waitFor(() => expect(actions.updateCompany).toHaveBeenCalledWith(COMPANY_ID, { name: 'شركة الأفق', description: null }));
  });

  it('clears the description when it is emptied', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /تعديل/ }));
    const dialog = screen.getByRole('dialog');
    const [, description] = within(dialog).getAllByRole('textbox');
    fireEvent.change(description, { target: { value: '' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ' }));

    // `undefined` would mean "leave it", and the old text would survive.
    await waitFor(() => expect(actions.updateCompany).toHaveBeenCalledWith(COMPANY_ID, expect.objectContaining({ description: null })));
  });

  it('exports the same payload to Excel and to PDF', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Excel/ }));
    fireEvent.click(screen.getByRole('button', { name: /PDF/ }));

    expect(exportCompanyToExcel).toHaveBeenCalledTimes(1);
    const [excel] = vi.mocked(exportCompanyToExcel).mock.calls[0];
    expect(excel.companyName).toBe('شركة الاختبار');
    expect(excel.portfolioSummaries).toEqual([expect.objectContaining({ name: 'محفظة الحكومة', projects: 1, contractValue: 100000, actual: 10000 })]);
    expect(excel.indirectCosts).toEqual([
      expect.objectContaining({ category: 'إيجار', amount: 4000 }),
      expect.objectContaining({ category: 'تسويق', amount: 1000 }),
    ]);
    // The report says what the page says.
    expect(excel.summary).toMatchObject({ companyExpenses: 20000, netProfitAfterIndirect: 145000 });
    expect(excel.companyExpenses).toEqual([expect.objectContaining({ kind: 'رواتب', amount: 20000, allocated: 5000 })]);
    expect(vi.mocked(exportCompanyToPDF).mock.calls[0][0]).toEqual(excel);
  });

  it('lets an admin archive, and delete after confirmation, then leaves the page', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /أرشفة/ }));
    await waitFor(() => expect(actions.archiveCompany).toHaveBeenCalledWith(COMPANY_ID));

    const deleteTrigger = screen.getAllByRole('button').find((b) => b.querySelector('svg.lucide-trash2.w-4'));
    fireEvent.click(deleteTrigger!);
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'حذف' }));

    await waitFor(() => expect(actions.deleteCompany).toHaveBeenCalledWith(COMPANY_ID));
    await waitFor(() => expect(screen.getByText('لوحة التحكم الرئيسية')).toBeInTheDocument());
  });

  it('keeps archive and delete from an editor who is not an admin', () => {
    roleState.isAdmin = false; roleState.canEdit = true;
    renderPage();
    expect(screen.getByRole('button', { name: /تعديل/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /أرشفة/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button').find((b) => b.querySelector('svg.lucide-trash2.w-4'))).toBeUndefined();
  });
});
