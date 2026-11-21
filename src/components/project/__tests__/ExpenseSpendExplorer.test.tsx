/**
 * Component tests for the spend explorer, written before it is split.
 *
 * What costs money here is the grand total and each group's total: which
 * rows count as spend. The tree builder is unit-tested; these tests pin
 * what the explorer shows and does with it: the totals strip, grouping and
 * drill-down, the filters, the sort direction, the inspector, saved
 * templates, the share link, the CSV export, and the paging of long lists.
 *
 * Four tests were red when written, all on one defect: an advance still
 * outstanding counted in the grand total, the count, its resource's group
 * and share, the shared view's total and the inspector's approved figure,
 * while every summary in the app counts it as money handed over, not
 * spent. The fix commit that follows turns them green without editing a
 * test.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { BudgetItem, Expense, PaymentRequest, Resource } from '@/types/project';
import { useStore } from '@/store/useStore';
import { encodeSpendView } from '@/lib/spend-url';
import { ExpenseSpendExplorer } from '../ExpenseSpendExplorer';

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn(), useToast: () => ({ toast: vi.fn() }) }));

const PROJECT_ID = 'p-1';

const resources: Resource[] = [
  { id: 'r1', projectId: PROJECT_ID, name: 'أنور', monthlyCost: 0, createdAt: '' },
  { id: 'r2', projectId: PROJECT_ID, name: 'أحمد', monthlyCost: 0, createdAt: '' },
];
const budgetItems: BudgetItem[] = [
  { id: 'b1', projectId: PROJECT_ID, category: 'salary', description: 'رواتب الفريق', plannedAmount: 50000, costType: 'recurring', costClass: 'direct' } as BudgetItem,
];

function expense(over: Partial<Expense>): Expense {
  return { id: 'e', projectId: PROJECT_ID, category: 'salary', description: 'راتب', amount: 0, date: '2026-01-05', month: 1, approvalStatus: 'approved', isVatExempt: false, resourceId: 'r1', budgetItemId: 'b1', ...over };
}

const expenses: Expense[] = [
  expense({ id: 'e1', amount: 10000, vendor: 'شركة س' }),
  expense({ id: 'e2', amount: 2000, category: 'other', description: 'مواصلات', date: '2026-02-10', month: 2, approvalStatus: 'pending', budgetItemId: undefined }),
  expense({ id: 'e3', amount: 23000, resourceId: 'r2' }),
  expense({ id: 'e4', amount: 3000, category: 'other', description: 'مكافأة مرفوضة', date: '2026-03-01', month: 3, approvalStatus: 'rejected' }),
  expense({ id: 'e5', amount: 4000, description: 'سلفة قائمة', date: '2026-03-05', month: 3, isOutstandingAdvance: true }),
];

/**
 * The paid advance behind e5. The tile reads what is still out on the
 * request; e5 is the expense rows written before 22 May carried for it, so
 * the tile must not count it a second time.
 */
function advance(over: Partial<PaymentRequest> = {}): PaymentRequest {
  return {
    id: 'pr-advance', projectId: PROJECT_ID, resourceId: 'r1', requestType: 'advance', amount: 4000, currency: 'SAR',
    description: 'سلفة', linkedReimbursementIds: [], status: 'paid', isAdvanceOutstanding: true, refundedAmount: 0,
    autoCreatedExpenseId: 'e5', ...over,
  } as PaymentRequest;
}

function renderExplorer(rows = expenses, search = '') {
  return render(
    <MemoryRouter initialEntries={[`/project/${PROJECT_ID}${search}`]}>
      <ExpenseSpendExplorer projectId={PROJECT_ID} projectName="مشروع الوزارة" expenses={rows} resources={resources} custodies={[]} budgetItems={budgetItems} />
    </MemoryRouter>,
  );
}

/** The group rows, in display order, by the label each expand button carries. */
function groupLabels(): string[] {
  return screen.getAllByRole('button', { name: /(مصروف واحد|مصروفان|مصروفات|مصروفًا|مصروف) ·/ }).map((b) => b.querySelector('.font-medium')?.textContent ?? '');
}

function card(label: string): HTMLElement {
  return screen.getByText(label).nextElementSibling as HTMLElement;
}

/** Drives a Radix Select by the text its trigger currently shows. */
function pick(shown: string, option: RegExp) {
  const trigger = screen.getByText(shown).closest('button') as HTMLElement;
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  fireEvent.keyDown(screen.getByRole('option', { name: option }), { key: 'Enter' });
}

beforeEach(() => {
  localStorage.clear();
  useStore.setState({ paymentRequests: [advance()] });
});
afterEach(() => vi.restoreAllMocks());

describe('the totals', () => {
  it('counts approved and pending spend only, and shows the rejected and outstanding amounts apart', () => {
    renderExplorer();
    // 10,000 + 2,000 + 23,000. The rejected 3,000 and the outstanding advance 4,000 are outside.
    expect(card('إجمالي المطابق')).toHaveTextContent('35,000.00 ر.س');
    // The count keeps the rejected row (shown for transparency); the outstanding advance is not a row here.
    expect(card('عدد المصروفات')).toHaveTextContent('4');
    expect(card('عدد المجموعات')).toHaveTextContent('2');
    expect(card('مرفوض (خارج الإجمالي)')).toHaveTextContent('3,000.00 ر.س');
    expect(card('سلف قائمة (خارج الإجمالي)')).toHaveTextContent('4,000.00 ر.س');
  });

  it('reads an advance that has no expense row, net of what came back', () => {
    // The shape written since 22 May: the request alone. 6,000 out, 1,000 back.
    useStore.setState({ paymentRequests: [advance({ amount: 6000, refundedAmount: 1000, autoCreatedExpenseId: undefined })] });
    renderExplorer(expenses.filter((e) => e.id !== 'e5'));
    expect(card('إجمالي المطابق')).toHaveTextContent('35,000.00 ر.س');
    expect(card('سلف قائمة (خارج الإجمالي)')).toHaveTextContent('5,000.00 ر.س');
  });

  it('groups by resource, largest first, with each share, and drills into the category level', () => {
    renderExplorer();
    expect(groupLabels()).toEqual(['أحمد', 'أنور']);
    const anwar = screen.getByRole('button', { name: /أنور/ });
    // 12,000 of 35,000; the rejected row stays in the count, the outstanding advance in neither.
    expect(anwar).toHaveTextContent(/3 مصروفات · 34\.3%/);
    fireEvent.click(anwar);
    expect(groupLabels()).toEqual(['أحمد', 'أنور', 'رواتب موظفين', 'أخرى']);
    // The pending 2,000 and the rejected 3,000; the count keeps the rejected row.
    expect(screen.getByRole('button', { name: /أخرى/ })).toHaveTextContent('مصروفان');
  });
});

describe('filters and sort', () => {
  it('narrows by text and clears with one click', () => {
    renderExplorer();
    fireEvent.change(screen.getByPlaceholderText(/اسم مورد، جهة/), { target: { value: 'مواصلات' } });
    expect(card('إجمالي المطابق')).toHaveTextContent('2,000.00 ر.س');
    expect(groupLabels()).toEqual(['أنور']);
    fireEvent.click(screen.getByRole('button', { name: /مسح الفلاتر/ }));
    expect(groupLabels()).toEqual(['أحمد', 'أنور']);
    expect(screen.queryByRole('button', { name: /مسح الفلاتر/ })).not.toBeInTheDocument();
  });

  it('narrows by approval status and by date range', () => {
    renderExplorer();
    pick('كل الحالات', /بانتظار الاعتماد/);
    expect(card('إجمالي المطابق')).toHaveTextContent('2,000.00 ر.س');
    fireEvent.click(screen.getByRole('button', { name: /مسح الفلاتر/ }));
    const [from, to] = Array.from(document.querySelectorAll('input[type="date"]'));
    fireEvent.change(from, { target: { value: '2026-01-01' } });
    fireEvent.change(to, { target: { value: '2026-01-31' } });
    expect(card('إجمالي المطابق')).toHaveTextContent('33,000.00 ر.س');
  });

  it('flips the sort direction', () => {
    renderExplorer();
    fireEvent.click(screen.getByRole('button', { name: /تنازلي/ }));
    expect(groupLabels()).toEqual(['أنور', 'أحمد']);
    expect(screen.getByRole('button', { name: /تصاعدي/ })).toBeInTheDocument();
  });

  it('restores a shared view from the address', () => {
    renderExplorer(expenses, `?${encodeSpendView({ dimensions: ['category'], filters: { query: '', approvalStatus: 'approved' }, sort: { key: 'label', dir: 'asc' } })}`);
    expect(groupLabels()).toEqual(['رواتب موظفين']);
    expect(card('إجمالي المطابق')).toHaveTextContent('33,000.00 ر.س');
  });
});

describe('the inspector, templates, sharing and export', () => {
  it('opens a group with its approved and pending split and its expenses', () => {
    renderExplorer();
    fireEvent.click(within(screen.getByRole('button', { name: /أنور/ }).parentElement as HTMLElement).getByRole('button', { name: 'تفاصيل' }));
    const inspector = screen.getByRole('dialog');
    expect(within(inspector).getAllByText('معتمد')[0].nextElementSibling).toHaveTextContent('10,000.00 ر.س');
    expect(within(inspector).getByText('قيد الاعتماد').nextElementSibling).toHaveTextContent('2,000.00 ر.س');
    expect(within(inspector).getByText('مواصلات')).toBeInTheDocument();
    expect(within(inspector).getByText('شركة س')).toBeInTheDocument();
  });

  it('saves the current view as a template, applies it, and deletes it', () => {
    renderExplorer();
    fireEvent.change(screen.getByPlaceholderText(/اسم مورد، جهة/), { target: { value: 'مواصلات' } });
    fireEvent.change(screen.getByPlaceholderText(/مصروفات الربع الأول/), { target: { value: 'المواصلات' } });
    fireEvent.click(screen.getByRole('button', { name: /حفظ القالب/ }));
    fireEvent.click(screen.getByRole('button', { name: /مسح الفلاتر/ }));
    expect(groupLabels()).toEqual(['أحمد', 'أنور']);

    fireEvent.click(screen.getByRole('button', { name: 'المواصلات' }));
    expect(card('إجمالي المطابق')).toHaveTextContent('2,000.00 ر.س');

    fireEvent.click(screen.getByRole('button', { name: 'حذف القالب' }));
    expect(screen.queryByRole('button', { name: 'المواصلات' })).not.toBeInTheDocument();
  });

  it('copies a link that carries the view', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderExplorer();
    fireEvent.change(screen.getByPlaceholderText(/اسم مورد، جهة/), { target: { value: 'راتب' } });
    fireEvent.click(screen.getByRole('button', { name: /نسخ رابط التقرير/ }));
    const expected = encodeSpendView({
      dimensions: ['resource', 'category', 'budgetItem'],
      filters: { query: 'راتب', dateFrom: undefined, dateTo: undefined, category: 'all', approvalStatus: 'all' },
      sort: { key: 'total', dir: 'desc' },
    });
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/project/${PROJECT_ID}?${expected}`);
  });

  it('exports the tree as a CSV named after the levels', () => {
    const blobs: Blob[] = [];
    const downloads: string[] = [];
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: (b: Blob) => { blobs.push(b); return 'blob:x'; }, revokeObjectURL: vi.fn() }));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloads.push(this.download); });
    renderExplorer();
    fireEvent.click(screen.getByRole('button', { name: /تصدير CSV/ }));
    expect(blobs).toHaveLength(1);
    expect(downloads[0]).toMatch(/^spend-resource-category-budgetItem-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it('pages a long list and shows the rest on request', () => {
    const many: Resource[] = Array.from({ length: 45 }, (_, i) => ({ id: `m${i}`, projectId: PROJECT_ID, name: `مورد ${i}`, monthlyCost: 0, createdAt: '' }));
    const rows = many.map((r, i) => expense({ id: `x${i}`, resourceId: r.id, amount: 100 + i }));
    render(
      <MemoryRouter>
        <ExpenseSpendExplorer projectId={PROJECT_ID} expenses={rows} resources={many} custodies={[]} budgetItems={[]} />
      </MemoryRouter>,
    );
    expect(groupLabels()).toHaveLength(40);
    fireEvent.click(screen.getByRole('button', { name: /عرض المزيد \(5 صفاً متبقياً\)/ }));
    expect(groupLabels()).toHaveLength(45);
  });
});
