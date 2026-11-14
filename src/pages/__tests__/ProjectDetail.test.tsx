/**
 * Page tests for the project detail shell, written before it is split. The
 * sections are covered by their own tests; what is pinned here is the
 * shell: the not-found state, which section each group and tab shows, the
 * deep link and the URL it keeps, the read-only flag passed down, the
 * admin-only audit tab, the mobile action per group, and the header's
 * archive, delete and export.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { exportToExcel, exportToPDF } from '@/lib/export-lazy';
import { useProjectDetailData } from '@/hooks/useProjectDetailData';

const h = vi.hoisted(() => {
  const section = (name: string) => (props: Record<string, unknown>) => (
    <div data-testid={name}>{name}{'readOnly' in props ? ` ro=${String(props.readOnly)}` : ''}{'projectId' in props ? ` pid=${String(props.projectId)}` : ''}</div>
  );
  return { section };
});
const sections = [
  'ResourcesSection', 'BudgetSection', 'BaselineSection', 'ExpensesSection', 'CustodySection', 'RevenueSection', 'ChartsSection',
  'AuditLogSection', 'MilestonesSection', 'ChangeOrdersSection', 'RisksSection', 'WhatIfSection', 'CommitmentsSection',
  'SmartBudgetAlerts', 'FundsSection', 'CashLedgerSection', 'ExpenseSpendExplorer',
  'CashFlowSankey', 'ResourcePayablesSection', 'VendorPayablesPanel', 'ExecutiveSummary',
  'PerformanceComparisonSection', 'AIExecutiveInsights', 'ProjectStatsGrid', 'ProjectEditDialog', 'ledger/ChargedCostsCard', 'ledger/CompanyFundingCard', 'ledger/ProjectCompanyLink', 'funds/PendingCarryCard',
];
for (const path of sections) {
  const name = path.split('/').pop()!;
  vi.doMock(`@/components/project/${path}`, () => ({ [name]: h.section(name) }));
}
// The section stand-ins are registered at run time, so the page is loaded after them.
let ProjectDetail: React.ComponentType;
beforeAll(async () => {
  ProjectDetail = (await import('../ProjectDetail')).default;
});
vi.mock('@/components/project/ProjectDetailHeader', () => ({
  ProjectDetailHeader: (p: { isReadOnly: boolean; onArchive: () => void; onDelete: () => void; onExportExcel: () => void; onExportPDF: () => void }) => (
    <div data-testid="header">header ro={String(p.isReadOnly)}
      <button onClick={p.onArchive}>archive</button><button onClick={p.onDelete}>delete</button>
      <button onClick={p.onExportExcel}>excel</button><button onClick={p.onExportPDF}>pdf</button>
    </div>
  ),
}));
vi.mock('@/components/MobileFAB', () => ({ MobileFAB: (p: { label: string; onClick: () => void }) => <button data-testid="fab" onClick={p.onClick}>{p.label}</button> }));
vi.mock('@/components/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/hooks/useProjectDetailData', () => ({ useProjectDetailData: vi.fn() }));
vi.mock('@/hooks/useTabBadges', () => ({
  useTabBadges: () => ({
    planning: { count: 0, level: 'info' }, finance: { count: 3, level: 'critical', hint: 'ثلاثة بانتظار الاعتماد' },
    tracking: { count: 0, level: 'info' }, management: { count: 1, level: 'warning' },
  }),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }) }));
vi.mock('@/lib/export-lazy', () => ({ exportToExcel: vi.fn().mockResolvedValue(undefined), exportToPDF: vi.fn().mockResolvedValue(undefined) }));
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

const actions = { updateProject: vi.fn(), archiveProject: vi.fn(async () => {}), deleteProject: vi.fn(async () => {}) };
const project = {
  id: 'p1', companyId: 'c1', name: 'مشروع الجسر', status: 'active', percentComplete: 40, durationMonths: 12, currency: 'SAR',
  contractValue: 100000, taxPercent: 15, managementReserve: 0, startDate: '2026-01-01',
};
const summary = {
  contractValue: 100000, effectiveContractValue: 100000, totalPlanned: 80000, totalActual: 30000, collectedRevenue: 20000,
  invoicedRevenue: 25000, spendRate: 37.5, plannedProfit: 20000, contractValueInclVAT: 115000, totalVATOnExpenses: 0,
  totalVATOnRevenues: 0, netVATPayable: 0,
};
function data(over: Record<string, unknown> = {}) {
  return {
    project, company: { id: 'c1', name: 'شركة' }, portfolio: null,
    isAdmin: true, isSystemAdmin: true, isReadOnly: false, canEditRole: () => true, ...actions,
    pBudget: [], pExpenses: [], pRevenues: [], pResources: [], pCustodies: [], pMilestones: [], pChangeOrders: [], pRisks: [], pCommitments: [],
    projectFunds: [], fundSettlements: [], paymentRequests: [], cashTransfers: [],
    summary, pieData: [], barData: [], getActualForItem: () => 0, projectBaselines: [], evm: null, currentMonth: 5,
    totalCommitted: 0, availableBudget: 50000, daysRemaining: 200, monthsRemaining: 7, vatRate: 15, healthScore: { label: 'سليم', color: '', bg: '' },
    openRisksCount: 0, pendingExpensesCount: 3, totalAllRevenue: 25000, pendingChangeOrders: 0, openHighRisks: 0, baselineLocked: false,
    ...over,
  } as unknown as ReturnType<typeof useProjectDetailData>;
}

function Probe() {
  const l = useLocation();
  return <p data-testid="path">{l.pathname + l.search}</p>;
}
function renderPage(url = '/project/p1') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <TooltipProvider>
        <Routes>
          <Route path="/project/:id" element={<><ProjectDetail /><Probe /></>} />
          <Route path="/" element={<Probe />} />
        </Routes>
      </TooltipProvider>
    </MemoryRouter>,
  );
}
const shown = () => sections.filter((s) => screen.queryByTestId(s) !== null);
const groupTab = (label: string) => screen.getByRole('tab', { name: new RegExp(label) });
const openGroup = (label: string) => fireEvent.mouseDown(groupTab(label), { button: 0 });

describe('ProjectDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useProjectDetailData).mockReturnValue(data());
  });

  it('says when the project is missing and offers the way back', () => {
    vi.mocked(useProjectDetailData).mockReturnValue(data({ project: undefined }));
    renderPage();
    expect(screen.getByText('المشروع غير موجود')).toBeInTheDocument();
    fireEvent.click(screen.getByText('العودة'));
    expect(screen.getByTestId('path')).toHaveTextContent('/');
  });

  it('opens on the business summary with the financial position, stats and overview alone, and hides operator diagnostics', () => {
    renderPage();
    expect(screen.getByTestId('header')).toHaveTextContent('ro=false');
    expect(screen.getByRole('region', { name: 'الوضع المالي المختصر' })).toBeInTheDocument();
    expect(shown()).toEqual(['ExecutiveSummary', 'AIExecutiveInsights', 'ProjectStatsGrid', 'ProjectEditDialog']);
    expect(screen.getByTestId('ProjectCompanyLink')).toBeInTheDocument(); // the project's link to its company
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['الملخص', 'التخطيط', 'المالية3', 'المتابعة', 'الإدارة1']);
    expect(within(groupTab('المالية')).getByText('3')).toHaveClass('bg-destructive');
    expect(screen.queryByTestId('fab')).not.toBeInTheDocument();
  });

  it('switches to a group, keeps it and its first section in the URL, and opens that section with the read-only flag passed down', async () => {
    vi.mocked(useProjectDetailData).mockReturnValue(data({ isReadOnly: true }));
    renderPage();
    openGroup('المالية');
    await screen.findByTestId('ExpensesSection');
    expect(screen.getByTestId('path')).toHaveTextContent('/project/p1?group=finance&tab=expenses');
    expect(screen.getByTestId('ExpensesSection')).toHaveTextContent('ro=true pid=p1');
    expect(screen.getByTestId('ExpenseSpendExplorer')).toBeInTheDocument();
    expect(screen.getByTestId('ChargedCostsCard')).toBeInTheDocument();
    expect(screen.queryByTestId('FundsSection')).not.toBeInTheDocument();
    expect(screen.getByTestId('header')).toHaveTextContent('ro=true');
    expect(screen.queryByTestId('fab')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('الدفعات'));
    await screen.findByTestId('FundsSection');
    expect(screen.getByTestId('path')).toHaveTextContent('tab=funds');
    expect(screen.getByTestId('CashLedgerSection')).toBeInTheDocument();
    expect(screen.getByTestId('CashFlowSankey')).toBeInTheDocument();
  });

  it('honours a deep link to a group and a section', async () => {
    renderPage('/project/p1?group=tracking&tab=whatif');
    await screen.findByTestId('WhatIfSection');
    expect(screen.queryByTestId('PerformanceComparisonSection')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ChartsSection')).not.toBeInTheDocument();
    expect(screen.getByTestId('fab')).toHaveTextContent('تحليل ما-إذا');
  });

  it('offers the audit log only to an admin of the project', async () => {
    const { unmount } = renderPage('/project/p1?group=management');
    await screen.findByTestId('ChangeOrdersSection');
    expect(screen.getByText('السجل')).toBeInTheDocument();
    unmount();
    vi.mocked(useProjectDetailData).mockReturnValue(data({ isAdmin: false }));
    renderPage('/project/p1?group=management');
    await screen.findByTestId('ChangeOrdersSection');
    expect(screen.queryByText('السجل')).not.toBeInTheDocument();
  });

  it('gives an editor the mobile action of the group, which lands on its section', async () => {
    renderPage('/project/p1?group=management&tab=changeorders');
    await screen.findByTestId('ChangeOrdersSection');
    expect(screen.getByTestId('fab')).toHaveTextContent('إضافة خطر');
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    fireEvent.click(screen.getByTestId('fab'));
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('group=management&tab=risks'));
    // The action scrolls to the top a beat later; wait for it so no timer outlives the test.
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' }));
  });

  it('archives and goes home, reports a refused delete, and exports with the VAT figures', async () => {
    actions.deleteProject.mockRejectedValueOnce(new Error('أرشف المشروع أولاً'));
    renderPage();
    fireEvent.click(screen.getByText('delete'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('أرشف المشروع أولاً'));

    fireEvent.click(screen.getByText('excel'));
    expect(exportToExcel).toHaveBeenCalledWith(expect.objectContaining({ projectName: 'مشروع الجسر', contractValue: 100000, vatRate: 15, contractValueInclVAT: 115000, totalRevenue: 25000 }));
    expect(toast.success).toHaveBeenCalledWith('تم تصدير التقرير إلى Excel');
    fireEvent.click(screen.getByText('pdf'));
    expect(exportToPDF).toHaveBeenCalledWith(expect.objectContaining({ plannedProfit: 20000 }));

    fireEvent.click(screen.getByText('archive'));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('تم أرشفة المشروع'));
    expect(actions.archiveProject).toHaveBeenCalledWith('p1');
    expect(screen.getByTestId('path')).toHaveTextContent('/');
  });
});
