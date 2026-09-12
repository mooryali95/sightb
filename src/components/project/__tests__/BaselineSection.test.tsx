/**
 * Component tests for the baseline section: the cost baselines, the
 * management reserve card and the earned-value figures against the active
 * baseline.
 *
 * One test was red when written. The reserve card's "spent (contingency)"
 * summed every contingency expense, rejected ones and outstanding
 * advances included, while the actual cost beside it (through the
 * finance library) counts neither. The fix commit that follows turns it
 * green without editing a test.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useStore, type AppState } from '@/store/useStore';
import type { CostBaseline, Expense, Project } from '@/types/project';
import { BaselineSection } from '../BaselineSection';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));
vi.mock('recharts', () => {
  const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const Nothing = () => null;
  return {
    ResponsiveContainer: Box, LineChart: Box, CartesianGrid: Nothing, XAxis: Nothing, YAxis: Nothing,
    Tooltip: Nothing, Legend: Nothing, Line: Nothing,
  };
});

const PROJECT_ID = 'p-1';

const project: Project = {
  id: PROJECT_ID, companyId: 'co-1', name: 'مشروع', contractValue: 100000, currency: 'SAR',
  startDate: '2020-01-01', endDate: '2020-06-30', durationMonths: 6, resourceCount: 1,
  status: 'active', createdAt: '', percentComplete: 50, contractType: 'lump_sum',
  retentionPercent: 0, managementReserve: 5000, taxPercent: 15, vatInclusive: false,
};

function expense(over: Partial<Expense>): Expense {
  return {
    id: 'e', projectId: PROJECT_ID, category: 'consulting', description: '', amount: 0, date: '2020-02-01', month: 2,
    approvalStatus: 'approved', isVatExempt: false, ...over,
  };
}

const expenses: Expense[] = [
  expense({ id: 'c-ok', category: 'contingency', amount: 1000 }),
  expense({ id: 'c-rejected', category: 'contingency', amount: 3000, approvalStatus: 'rejected' }),
  expense({ id: 'c-advance', category: 'contingency', amount: 500, isOutstandingAdvance: true }),
  expense({ id: 'other', amount: 9000, month: 1 }),
];

const baseline: CostBaseline = {
  id: 'bl-1', projectId: PROJECT_ID, name: 'الأساس الأول', version: 1, isActive: true, totalPlanned: 65000,
  createdAt: '2020-01-05T00:00:00Z',
  items: [
    { id: 'i-1', baselineId: 'bl-1', category: 'consulting', description: 'استشارات', plannedAmount: 60000, costType: 'fixed' },
    { id: 'i-2', baselineId: 'bl-1', category: 'contingency', description: 'طوارئ', plannedAmount: 5000, costType: 'fixed' },
  ],
};

const actions = {
  createBaseline: vi.fn().mockResolvedValue('bl-new'),
  deleteBaseline: vi.fn().mockResolvedValue(undefined),
  setActiveBaseline: vi.fn().mockResolvedValue(undefined),
  loadBaselines: vi.fn().mockResolvedValue([]),
};

function seed(over: Partial<AppState> = {}) {
  useStore.setState({ baselines: [baseline], ...actions, ...over } satisfies Partial<AppState>);
}

async function renderSection(readOnly = false, budgetItems: { id: string }[] = [{ id: 'b-1' }]) {
  const view = render(
    <BaselineSection
      projectId={PROJECT_ID} durationMonths={6} expenses={expenses}
      budgetItems={budgetItems as never} project={project} readOnly={readOnly}
    />,
  );
  await waitFor(() => expect(screen.queryByText('جاري التحميل...')).not.toBeInTheDocument());
  return view;
}

function reserveFigure(label: string): string | undefined {
  return screen.getByText(label).nextElementSibling?.textContent ?? undefined;
}

beforeEach(() => {
  Object.values(actions).forEach((fn) => fn.mockClear());
  seed();
});

describe('the management reserve', () => {
  it('charges the reserve only with contingency spend the summary counts', async () => {
    await renderSection();
    // 1,000 approved; the rejected 3,000 and the outstanding 500 are not spend.
    expect(reserveFigure('المصروف (طوارئ)')).toBe('1,000.00 ر.س');
    expect(reserveFigure('المتبقي')).toBe('4,000.00 ر.س');
  });
});

describe('earned value against the active baseline', () => {
  it('shows the actual cost the finance library counts, and the baseline without its reserve', async () => {
    await renderSection();
    // AC: 9,000 + 1,000 approved contingency; BAC: 65,000 less the 5,000 reserve.
    const ac = screen.getByText('التكلفة الفعلية (AC)').closest('div.stat-card') as HTMLElement;
    expect(within(ac).getByText('10,000.00 ر.س')).toBeInTheDocument();
    const bac = screen.getByText('الميزانية الكلية (BAC)').closest('div.stat-card') as HTMLElement;
    expect(within(bac).getByText('60,000.00 ر.س')).toBeInTheDocument();
  });

  it('shows no figures without an active baseline', async () => {
    seed({ baselines: [{ ...baseline, isActive: false }] });
    await renderSection();
    expect(screen.queryByText('التكلفة الفعلية (AC)')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تفعيل' })).toBeInTheDocument();
  });
});

describe('managing baselines', () => {
  it('creates one under the typed name and activates another', async () => {
    seed({ baselines: [baseline, { ...baseline, id: 'bl-2', name: 'الأساس الثاني', version: 2, isActive: false }] });
    await renderSection();
    fireEvent.click(screen.getByRole('button', { name: /خط أساس جديد/ }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByPlaceholderText(/Baseline 3/), { target: { value: '  الأساس الثالث  ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'إنشاء خط الأساس' }));
    await waitFor(() => expect(actions.createBaseline).toHaveBeenCalledWith(PROJECT_ID, 'الأساس الثالث'));

    fireEvent.click(screen.getByRole('button', { name: 'تفعيل' }));
    await waitFor(() => expect(actions.setActiveBaseline).toHaveBeenCalledWith('bl-2', PROJECT_ID));
  });

  it('cannot create one with no budget items, and a viewer cannot write at all', async () => {
    const first = await renderSection(false, []);
    expect(screen.getByRole('button', { name: /خط أساس جديد/ })).toBeDisabled();
    first.unmount();

    seed({ baselines: [{ ...baseline, isActive: false }] });
    await renderSection(true);
    expect(screen.getByText('الأساس الأول')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تفعيل' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /خط أساس جديد/ })).not.toBeInTheDocument();
  });
});
