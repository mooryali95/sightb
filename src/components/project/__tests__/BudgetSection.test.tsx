/**
 * Component tests for the budget section, written before it is split.
 *
 * The section turns budget items into three sets of figures — the planning
 * summary, the per-category table and the per-item table — and each is
 * compared against actual spend. What costs money when wrong: a recurring
 * item counted once instead of per month, a rejected expense counted as
 * spend, the baseline lock not holding, and the auto-link putting spend on
 * the wrong item.
 *
 * One test was red when written: every "actual" on this screen summed all
 * expenses, rejected ones included, while the expenses section, the funds
 * and the custodies all exclude them. The fix commit that follows turns it
 * green without editing a test.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useStore, type AppState } from '@/store/useStore';
import { EXPENSE_CATEGORY_LABELS, type BudgetItem, type Expense, type PaymentRequest } from '@/types/project';
import { BudgetSection } from '../BudgetSection';

const PROJECT_ID = 'project-under-test';

function item(over: Partial<BudgetItem>): BudgetItem {
  return {
    id: 'b', projectId: PROJECT_ID, category: 'consulting', description: 'بند', plannedAmount: 0,
    costType: 'fixed', costClass: 'direct', ...over,
  };
}

/** 30,000 once, plus 5,000 a month for months 2 to 4 (three months = 15,000). */
const budgetItems: BudgetItem[] = [
  item({ id: 'b-fixed', description: 'استشارة تصميم', plannedAmount: 30000, startMonth: 1, endMonth: 1, month: 1 }),
  item({ id: 'b-recurring', description: 'راتب مهندس', category: 'salary', plannedAmount: 5000, costType: 'recurring', startMonth: 2, endMonth: 4, month: 2 }),
];

function expense(over: Partial<Expense>): Expense {
  return {
    id: 'e', projectId: PROJECT_ID, category: 'consulting', description: 'مصروف', amount: 0, date: '2026-02-10',
    month: 2, approvalStatus: 'approved', isVatExempt: false, ...over,
  };
}

/** 10,000 approved and 2,000 rejected, both linked to the fixed item. */
const expenses: Expense[] = [
  expense({ id: 'e-approved', amount: 10000, budgetItemId: 'b-fixed' }),
  expense({ id: 'e-rejected', amount: 2000, budgetItemId: 'b-fixed', approvalStatus: 'rejected' }),
];

const outstandingAdvance: PaymentRequest = {
  id: 'req-adv', projectId: PROJECT_ID, resourceId: 'res', requestType: 'advance', amount: 3000, currency: 'SAR',
  description: 'سلفة', linkedReimbursementIds: [], priority: 'normal', status: 'paid', requestedBy: 'u',
  paymentAttachments: [], isAdvanceOutstanding: true, refundedAmount: 0,
  createdAt: '2026-02-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z',
};

const actions = {
  addBudgetItem: vi.fn().mockResolvedValue('new-item'),
  updateBudgetItem: vi.fn().mockResolvedValue(undefined),
  deleteBudgetItem: vi.fn().mockResolvedValue(undefined),
  updateExpense: vi.fn().mockResolvedValue(undefined),
};

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));

function seedStore(over: Partial<AppState> = {}) {
  useStore.setState({
    paymentRequests: [outstandingAdvance],
    budgetAmendments: [],
    loadBudgetAmendments: vi.fn().mockResolvedValue(undefined),
    ...actions,
    ...over,
  } satisfies Partial<AppState>);
}

interface RenderOptions {
  items?: BudgetItem[]; rows?: Expense[]; readOnly?: boolean; baselineLocked?: boolean;
}

function renderSection({ items = budgetItems, rows = expenses, readOnly = false, baselineLocked = false }: RenderOptions = {}) {
  render(
    <BudgetSection
      projectId={PROJECT_ID} budgetItems={items} expenses={rows} durationMonths={6} resources={[]}
      contractValue={100000} currency="SAR" managementReserve={4000} readOnly={readOnly}
      baselineLocked={baselineLocked} taxPercent={15}
    />,
  );
}

/** The figure under a summary label. */
function summary(label: string): string {
  return screen.getByText(label).nextElementSibling?.textContent ?? '';
}

function rowFor(description: string): HTMLElement {
  const row = screen.getByText(description).closest('tr');
  if (!row) throw new Error(`"${description}" is not in a table`);
  return row;
}

beforeEach(() => {
  Object.values(actions).forEach((fn) => fn.mockClear());
  seedStore();
});

describe('the planning summary', () => {
  it('derives tax, planned total, unallocated and planned profit from the contract', () => {
    renderSection();
    // Planned: 30,000 + 5,000 × 3 months = 45,000 — a recurring item counts per month.
    expect(summary('الضريبة (15%)')).toBe('15,000.00 ر.س');
    expect(summary('شامل الضريبة')).toBe('115,000.00 ر.س');
    expect(summary('إجمالي المخطط')).toBe('45,000.00 ر.س');
    expect(summary('غير مخصص')).toBe('55,000.00 ر.س');
    expect(summary('الربح المخطط')).toContain('55,000.00 ر.س');
    expect(summary('الربح المخطط')).toContain('(55.0%)');
  });

  it('shows outstanding advances as recoverable, outside actual cost', () => {
    renderSection();
    const note = screen.getByText(/سلف قائمة \(لم تُسوَّ بعد\)/).closest('div.rounded-lg') as HTMLElement;
    expect(note).toHaveTextContent('3,000.00 ر.س');
    expect(note).toHaveTextContent('1 سلفة');
  });
});

describe('what counts as actual spend', () => {
  it('leaves rejected expenses out of every actual figure', () => {
    renderSection();
    // 10,000 approved; the rejected 2,000 is not spend anywhere else in the app.
    const totals = screen.getByText(/الإجمالي المخطط:/);
    expect(totals).toHaveTextContent('الفعلي: 10,000.00 ر.س');
    expect(totals).toHaveTextContent('المتبقي: 35,000.00 ر.س');
    const cells = within(rowFor('استشارة تصميم')).getAllByRole('cell').map((c) => c.textContent);
    expect(cells[6]).toBe('10,000.00 ر.س');
  });

  it('spreads a recurring item over its months in the per-category table', () => {
    renderSection();
    const categoryTable = screen.getByText('النسبة من العقد').closest('table') as HTMLElement;
    const salary = within(categoryTable).getByText(EXPENSE_CATEGORY_LABELS.salary).closest('tr') as HTMLElement;
    expect(within(salary).getAllByRole('cell')[1]).toHaveTextContent('15,000.00 ر.س');
    const total = within(categoryTable).getByText('الإجمالي').closest('tr') as HTMLElement;
    expect(within(total).getAllByRole('cell')[1]).toHaveTextContent('45,000.00 ر.س');
  });

  it('shows the recurring item\'s monthly figure and its total on its row', () => {
    renderSection();
    const cells = within(rowFor('راتب مهندس')).getAllByRole('cell').map((c) => c.textContent);
    expect(cells[3]).toBe('شهر 2 → 4');
    expect(cells[5]).toContain('5,000.00 ر.س');
    expect(cells[5]).toContain('إجمالي: 15,000.00 ر.س');
  });
});

describe('the baseline lock', () => {
  it('hides every write while the baseline is locked with no open amendment', () => {
    renderSection({ baselineLocked: true });
    expect(screen.queryByRole('button', { name: /بند جديد/ })).not.toBeInTheDocument();
    // The amendment manager above says so too; the section's own notice is the one with the change-order button.
    expect(screen.getByRole('button', { name: 'أمر تغيير' })).toBeInTheDocument();
    expect(within(rowFor('استشارة تصميم')).queryAllByRole('button')).toHaveLength(0);
  });

  it('hides every write from a read-only viewer', () => {
    renderSection({ readOnly: true });
    expect(screen.queryByRole('button', { name: /بند جديد/ })).not.toBeInTheDocument();
    expect(within(rowFor('استشارة تصميم')).queryAllByRole('button')).toHaveLength(0);
  });
});

describe('adding and editing an item', () => {
  it('adds a fixed direct item with the amount typed', async () => {
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: /بند جديد/ }));
    const dialog = screen.getByRole('dialog');

    fireEvent.change(within(dialog).getByPlaceholderText(/راتب أحمد/), { target: { value: 'تراخيص' } });
    fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: '8000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'إضافة' }));

    await waitFor(() => expect(actions.addBudgetItem).toHaveBeenCalledTimes(1));
    expect(actions.addBudgetItem).toHaveBeenCalledWith(expect.objectContaining({
      projectId: PROJECT_ID, description: 'تراخيص', plannedAmount: 8000, costType: 'fixed', costClass: 'direct',
    }));
  });

  it('opens an edit on the row\'s values and saves the new amount', async () => {
    renderSection();
    const [edit] = within(rowFor('استشارة تصميم')).getAllByRole('button').filter((b) => b.querySelector('svg.lucide-pencil'));
    fireEvent.click(edit);
    const dialog = screen.getByRole('dialog');

    expect((within(dialog).getByRole('spinbutton') as HTMLInputElement).value).toBe('30000');
    fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: '32000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ التعديلات' }));

    await waitFor(() => expect(actions.updateBudgetItem).toHaveBeenCalledWith('b-fixed', expect.objectContaining({ plannedAmount: 32000, startMonth: 1 })));
  });
});

describe('expenses with no budget item', () => {
  it('lists them by category and links each to an item of the same category on request', async () => {
    renderSection({ rows: [...expenses, expense({ id: 'e-loose', amount: 700, category: 'salary', description: 'بلا بند' })] });
    const warning = screen.getByText(/مصروفات غير مربوطة ببنود الموازنة/).closest('div.rounded-lg') as HTMLElement;
    expect(warning).toHaveTextContent(`${EXPENSE_CATEGORY_LABELS.salary}: 700.00 ر.س`);

    fireEvent.click(within(warning).getByRole('button', { name: /ربط تلقائي/ }));

    await waitFor(() => expect(actions.updateExpense).toHaveBeenCalledWith('e-loose', { budgetItemId: 'b-recurring' }));
    expect(actions.updateExpense).toHaveBeenCalledTimes(1);
  });
});

describe('reserves', () => {
  it('separates contingency from the rest of the budget and shows the management reserve', () => {
    renderSection({
      items: [...budgetItems, item({ id: 'b-cont', category: 'contingency', description: 'طوارئ', plannedAmount: 5000 })],
      rows: [...expenses, expense({ id: 'e-cont', category: 'contingency', amount: 1200, budgetItemId: 'b-cont' })],
    });
    expect(summary('الموازنة بدون احتياطي')).toBe('45,000.00 ر.س');
    expect(summary('احتياطي الطوارئ (مخطط)')).toBe('5,000.00 ر.س');
    expect(summary('احتياطي الطوارئ (مصروف)')).toBe('1,200.00 ر.س');
    expect(summary('المتبقي من الاحتياطي')).toBe('3,800.00 ر.س');
    expect(summary('الاحتياطي الإداري')).toBe('4,000.00 ر.س');
  });
});
