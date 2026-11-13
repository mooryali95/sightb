/**
 * Component tests for the spend consistency chart, written before it is
 * split. The report and the row comparison are unit-tested in
 * lib/__tests__/spend-tree.test.ts; what is pinned here is what the chart
 * loads, shows, records, and opens: the repairs fetched for the project,
 * the alert or the all-clear, the three totals, the bars, the unlinked
 * badges, the rows by resource or by category, the detailed comparison,
 * and the alert recorded in the alert centre.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Expense, Resource } from '@/types/project';
import { listCashTransferRepairs } from '@/services/cashRepairService';
import { recordConsistencyAlert } from '@/lib/consistency-alerts';
import { SpendConsistencyChart } from '../SpendConsistencyChart';

vi.mock('@/services/cashRepairService', () => ({ listCashTransferRepairs: vi.fn() }));
vi.mock('@/lib/consistency-alerts', () => ({ recordConsistencyAlert: vi.fn() }));
vi.mock('recharts', () => {
  const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const Nothing = () => null;
  return {
    ResponsiveContainer: Box, CartesianGrid: Nothing, XAxis: Nothing, YAxis: Nothing, Tooltip: Nothing, Legend: Nothing, Bar: Nothing,
    BarChart: ({ data }: { data: Record<string, string | number>[] }) => (
      <ul data-testid="bars">{data.map((d) => <li key={String(d.name)}>{`${d.name}: ${d['قبل']} / ${d['بعد']} / ${d['فجوة']}`}</li>)}</ul>
    ),
  };
});

const PROJECT_ID = 'p-1';
const resources: Resource[] = [
  { id: 'r1', projectId: PROJECT_ID, name: 'أنور', monthlyCost: 0, createdAt: '' },
  { id: 'r2', projectId: PROJECT_ID, name: 'أحمد', monthlyCost: 0, createdAt: '' },
];
function expense(over: Partial<Expense>): Expense {
  return { id: 'e', projectId: PROJECT_ID, category: 'salary', description: 'مصروف', amount: 0, date: '2026-02-10', month: 2, approvalStatus: 'approved', isVatExempt: false, ...over };
}
// A 1,000 repair on custody c1 spreads over its two expenses (6,000 and 4,000);
// a 500 repair on a custody with no expenses lands on the unassigned row; the
// 1,500 on أحمد is linked to nothing; the rejected 9,999 counts nowhere.
const expenses: Expense[] = [
  expense({ id: 'e1', amount: 6000, resourceId: 'r1', custodyId: 'c1', description: 'رواتب من العهدة' }),
  expense({ id: 'e2', amount: 2000, resourceId: 'r1', fundId: 'f1', description: 'رواتب من الدفعة' }),
  expense({ id: 'e3', amount: 4000, resourceId: 'r2', custodyId: 'c1', category: 'travel', description: 'تذاكر' }),
  expense({ id: 'e4', amount: 1500, resourceId: 'r2', category: 'other', description: 'بلا مصدر' }),
  expense({ id: 'x', amount: 9999, resourceId: 'r1', fundId: 'f1', approvalStatus: 'rejected' }),
];
const repairs = [
  { id: 'rep1', projectId: PROJECT_ID, custodyId: 'c1', amount: 1000 },
  { id: 'rep2', projectId: PROJECT_ID, custodyId: 'c-gone', amount: 500 },
];

function renderChart(rows: Expense[] = expenses) {
  return render(
    <MemoryRouter>
      <SpendConsistencyChart projectId={PROJECT_ID} projectName="مشروع الوزارة" expenses={rows} resources={resources} />
    </MemoryRouter>,
  );
}
const tile = (label: string) => screen.getByText(label).nextElementSibling as HTMLElement;
const rowButton = (label: string) => screen.getByText(label, { selector: 'span.font-medium' }).closest('button') as HTMLElement;

beforeEach(() => {
  vi.mocked(listCashTransferRepairs).mockReset().mockResolvedValue(repairs as never);
  vi.mocked(recordConsistencyAlert).mockReset();
});

describe('with repairs and an unlinked expense', () => {
  it('loads the project\'s repairs, warns, totals before and after, and charts each group', async () => {
    renderChart();
    await waitFor(() => expect(tile('إجمالي الفجوة')).toHaveTextContent('1,500.00 ر.س'));
    expect(listCashTransferRepairs).toHaveBeenCalledWith(PROJECT_ID);
    expect(tile('الإجمالي قبل')).toHaveTextContent('15,000.00 ر.س');
    expect(tile('الإجمالي بعد')).toHaveTextContent('13,500.00 ر.س');
    expect(screen.getByText('تم رصد اختلافات في أرقام الصرف')).toBeInTheDocument();
    expect(screen.getByText(/فرق قبل\/بعد الإصلاح:/)).toHaveTextContent('1,500.00 ر.س');
    expect(screen.getByText(/مصروفات بلا دفعة أو عهدة:/)).toHaveTextContent('1,500.00 ر.س (1 عملية) — أحمد');
    // Largest gap first: أنور 600, the unassigned 500, أحمد 400.
    const bars = within(screen.getByTestId('bars')).getAllByRole('listitem').map((li) => li.textContent);
    expect(bars[0]).toBe('أنور: 8600 / 8000 / 600');
    expect(bars[2]).toBe('أحمد: 5900 / 5500 / 400');
    expect(bars).toHaveLength(3);
    expect(screen.getByText('أحمد: 1,500.00 ر.س (1)')).toBeInTheDocument();
  });

  it('records the finding in the alert centre', async () => {
    renderChart();
    await waitFor(() => expect(recordConsistencyAlert).toHaveBeenCalledWith(PROJECT_ID, 'مشروع الوزارة', expect.objectContaining({ hasIssues: true, totalGap: 1500 })));
  });

  it('regroups by category', async () => {
    renderChart();
    await waitFor(() => expect(tile('إجمالي الفجوة')).toHaveTextContent('1,500.00 ر.س'));
    fireEvent.click(screen.getByRole('button', { name: 'حسب الفئة' }));
    // Salary: 6,000 + 2,000 after, plus 600 of the repair; travel 4,000 plus 400.
    expect(rowButton('رواتب موظفين')).toHaveTextContent('قبل: 8,600.00 ر.س');
    expect(rowButton('سفر وتنقل')).toHaveTextContent('فرق: 400.00 ر.س');
    expect(screen.getByText(/انقر على أي فئة/)).toBeInTheDocument();
  });

  it('opens a group to show which lines the repair changed', async () => {
    renderChart();
    await waitFor(() => expect(tile('إجمالي الفجوة')).toHaveTextContent('1,500.00 ر.س'));
    fireEvent.click(rowButton('أنور'));
    const panel = screen.getByRole('dialog');
    expect(within(panel).getByText('مقارنة تفصيلية — أنور')).toBeInTheDocument();
    expect(within(panel).getByText('تغيّر عنصر واحد من أصل 2')).toBeInTheDocument();
    expect(within(panel).getByText('قبل الإصلاح').nextElementSibling).toHaveTextContent('8,600.00 ر.س');
    const changed = within(panel).getByText('رواتب من العهدة').closest('.rounded') as HTMLElement;
    expect(changed).toHaveTextContent('قبل: 6,600.00 ر.س');
    expect(changed).toHaveTextContent('فرق: 600.00 ر.س');
    expect(within(changed).getByText('تغيّر')).toBeInTheDocument();
    expect(within(panel).getByText('رواتب من الدفعة').closest('.rounded')).toHaveTextContent('فرق: 0.00 ر.س');
  });
});

describe('when everything agrees', () => {
  it('gives the all-clear and records nothing amiss', async () => {
    vi.mocked(listCashTransferRepairs).mockResolvedValue([]);
    renderChart(expenses.filter((e) => e.id !== 'e4'));
    await waitFor(() => expect(listCashTransferRepairs).toHaveBeenCalled());
    expect(screen.getByText('الأرقام متسقة')).toBeInTheDocument();
    expect(tile('إجمالي الفجوة')).toHaveTextContent('0.00 ر.س');
    expect(screen.queryByText(/انقر على أي مورد/)).toBeInTheDocument();
    await waitFor(() => expect(recordConsistencyAlert).toHaveBeenLastCalledWith(PROJECT_ID, 'مشروع الوزارة', expect.objectContaining({ hasIssues: false })));
  });
});
