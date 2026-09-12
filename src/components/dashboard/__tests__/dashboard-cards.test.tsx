/**
 * Component tests for three dashboard cards: the portfolio performance
 * grid, the health matrix, and the snapshot button. Each one rolls the
 * store's lists up through the summary libraries; what is tested is which
 * entities each includes and what it hands on.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { toast } from 'sonner';
import type { Company, Expense, Portfolio, Project } from '@/types/project';
import { PortfolioPerformance } from '../PortfolioPerformance';
import { HealthMatrix } from '../HealthMatrix';
import { SnapshotControls } from '../SnapshotControls';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));
vi.mock('recharts', () => {
  const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const Nothing = () => null;
  return {
    ResponsiveContainer: Box, ScatterChart: Box, CartesianGrid: Nothing, XAxis: Nothing, YAxis: Nothing, ZAxis: Nothing,
    Tooltip: Nothing, Cell: Nothing,
    Scatter: ({ data }: { data: { name: string; x: number; y: number }[] }) => (
      <ul data-testid="points">{data.map((d) => <li key={d.name}>{`${d.name}: ${d.x}% / ${d.y}%`}</li>)}</ul>
    ),
  };
});

const companies: Company[] = [
  { id: 'co-live', name: 'شركة نشطة', status: 'active', createdAt: '' },
  { id: 'co-gone', name: 'شركة مؤرشفة', status: 'archived', createdAt: '' },
];
const portfolios: Portfolio[] = [
  { id: 'pf-1', companyId: 'co-live', name: 'محفظة الحكومة', targetRevenue: 0, targetMargin: 0, createdAt: '' },
  { id: 'pf-empty', companyId: 'co-live', name: 'محفظة فارغة', targetRevenue: 0, targetMargin: 0, createdAt: '' },
  { id: 'pf-archived', companyId: 'co-gone', name: 'محفظة شركة مؤرشفة', targetRevenue: 0, targetMargin: 0, createdAt: '' },
];
function project(over: Partial<Project>): Project {
  return {
    id: 'p', companyId: 'co-live', name: 'مشروع', contractValue: 100000, currency: 'SAR', startDate: '2026-01-01', endDate: '2026-12-31',
    durationMonths: 12, resourceCount: 1, status: 'active', createdAt: '', percentComplete: 0, contractType: 'lump_sum',
    retentionPercent: 0, managementReserve: 0, taxPercent: 15, vatInclusive: false, ...over,
  };
}
const projects: Project[] = [
  project({ id: 'p-a', portfolioId: 'pf-1', name: 'مشروع الوزارة', percentComplete: 40 }),
  project({ id: 'p-b', portfolioId: 'pf-1', name: 'مشروع البلدية', contractValue: 50000, percentComplete: 20 }),
  project({ id: 'p-c', portfolioId: 'pf-archived', name: 'مشروع مؤرشف', percentComplete: 10 }),
];
function expense(over: Partial<Expense>): Expense {
  return {
    id: 'e', projectId: 'p-a', category: 'other', description: '', amount: 0, date: '2026-02-01', month: 2,
    approvalStatus: 'approved', isVatExempt: false, ...over,
  };
}
const expenses: Expense[] = [
  expense({ id: 'a1', amount: 30000 }),
  expense({ id: 'a-rejected', amount: 50000, approvalStatus: 'rejected' }),
  expense({ id: 'b1', projectId: 'p-b', amount: 10000 }),
];

beforeEach(() => {
  vi.mocked(toast.success).mockClear();
});

describe('PortfolioPerformance', () => {
  it('shows only portfolios of live companies that hold a project, with the roll-up', () => {
    render(
      <MemoryRouter>
        <PortfolioPerformance
          portfolios={portfolios} companies={companies} projects={projects}
          budgetItems={[]} expenses={expenses} revenues={[]} changeOrders={[]} milestones={[]} risks={[]}
        />
      </MemoryRouter>,
    );
    const card = screen.getByText('محفظة الحكومة').closest('div.stat-card') as HTMLElement;
    expect(within(card).getByText('2')).toBeInTheDocument();
    expect(within(card).getByText('150,000.00 ر.س')).toBeInTheDocument();
    // (40 × 100,000 + 20 × 50,000) / 150,000
    expect(within(card).getByText('33%')).toBeInTheDocument();
    expect(screen.queryByText('محفظة فارغة')).not.toBeInTheDocument();
    expect(screen.queryByText('محفظة شركة مؤرشفة')).not.toBeInTheDocument();
  });

  it('opens the portfolio when its card is clicked', () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={
            <PortfolioPerformance
              portfolios={portfolios} companies={companies} projects={projects}
              budgetItems={[]} expenses={expenses} revenues={[]} changeOrders={[]} milestones={[]} risks={[]}
            />
          } />
          <Route path="/portfolio/:id" element={<p>صفحة المحفظة</p>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('محفظة الحكومة').closest('div.stat-card') as HTMLElement);
    expect(screen.getByText('صفحة المحفظة')).toBeInTheDocument();
  });
});

describe('HealthMatrix', () => {
  it('plots spend rate against completion from the summary, leaving rejected spend out', () => {
    render(
      <HealthMatrix
        filteredProjects={projects.slice(0, 2)} expenses={expenses}
        budgetItems={[{ id: 'b', projectId: 'p-a', category: 'other', description: '', plannedAmount: 60000, costType: 'fixed', costClass: 'direct' } as never]}
        revenues={[]} changeOrders={[]}
      />,
    );
    const points = screen.getByTestId('points');
    // 30,000 of a 60,000 plan is 50%; the rejected 50,000 would make it 133%.
    expect(within(points).getByText('مشروع الوزارة: 50% / 40%')).toBeInTheDocument();
    expect(within(points).getByText('مشروع البلدية: 0% / 20%')).toBeInTheDocument();
  });

  it('draws nothing for fewer than two projects with a figure', () => {
    const { container } = render(
      <HealthMatrix filteredProjects={[projects[0]]} expenses={[]} budgetItems={[]} revenues={[]} changeOrders={[]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('SnapshotControls', () => {
  it('saves one snapshot per project, portfolio and company for the current period', async () => {
    const saveSnapshot = vi.fn().mockResolvedValue('snap');
    render(
      <SnapshotControls
        projects={projects} portfolios={portfolios} companies={companies}
        budgetItems={[]} expenses={expenses} revenues={[]} changeOrders={[]} milestones={[]} risks={[]} indirectCosts={[]}
        saveSnapshot={saveSnapshot}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /حفظ لقطة الشهر الحالي/ }));

    await waitFor(() => expect(saveSnapshot).toHaveBeenCalledTimes(3 + 3 + 2));
    const period = new Date().toISOString().slice(0, 7);
    expect(saveSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'project', entityId: 'p-a', period, metrics: expect.objectContaining({ totalActual: 30000 }),
    }));
    expect(saveSnapshot).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'portfolio', entityId: 'pf-1', period }));
    expect(saveSnapshot).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'company', entityId: 'co-gone', period }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(`تم حفظ 8 لقطة للفترة ${period}`));
  });
});
