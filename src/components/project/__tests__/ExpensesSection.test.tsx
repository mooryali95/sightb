/**
 * Component tests for the expenses section, written before it is split.
 *
 * Three things here cost money when wrong: the figures at the top (what was
 * spent, and by whom), the single-source rule on a new expense (a fund or a
 * custody, never neither and never both, and never more than the source
 * holds), and the row actions that approve, reject, re-link or delete.
 *
 * One test was red when written. The resource and responsible summaries
 * counted rejected expenses while the total above them excluded them, so the
 * same screen reported two answers to "how much did سالم spend". The fix
 * commit that follows turns it green without editing a test.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { useStore, type AppState } from '@/store/useStore';
import type { Expense } from '@/types/project';
import { ExpensesSection } from '../ExpensesSection';
import {
  PROJECT_ID, FUND_ID, RESOURCE_ID, expenses, fund, outstandingAdvanceExpense, resource,
} from './expenses-fixtures';

type Role = 'admin' | 'editor' | 'viewer';
const roleState: { role: Role } = { role: 'admin' };

const actions = {
  addExpense: vi.fn().mockResolvedValue('new-expense-id'),
  updateExpense: vi.fn().mockResolvedValue(undefined),
  deleteExpense: vi.fn().mockResolvedValue(undefined),
  acknowledgeFund: vi.fn().mockResolvedValue(undefined),
  updateProject: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@/hooks/useRole', () => ({
  useRole: () => ({
    roles: [], isOwner: false,
    isAdmin: roleState.role === 'admin',
    isScopedAdmin: roleState.role === 'admin',
    isAdminFor: () => roleState.role === 'admin',
    canEdit: () => roleState.role !== 'viewer',
    hasAccess: () => true,
    loading: false,
  }),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(),
  }),
}));

function seedStore(over: Partial<AppState> = {}) {
  useStore.setState({
    projectFunds: [fund()],
    paymentRequests: [], cashTransfers: [],
    ...actions,
    ...over,
  } satisfies Partial<AppState>);
}

interface RenderOptions {
  expenses?: Expense[];
  readOnly?: boolean;
  projectStatus?: string;
}

function renderSection({ expenses: rows = expenses, readOnly = false, projectStatus = 'active' }: RenderOptions = {}) {
  render(
    <ExpensesSection
      projectId={PROJECT_ID}
      durationMonths={6}
      expenses={rows}
      resources={[resource]}
      custodies={[]}
      budgetItems={[]}
      revenues={[]}
      contractValue={100000}
      readOnly={readOnly}
      taxPercent={15}
      projectStatus={projectStatus}
    />,
  );
}

/** The table row an expense's description sits in. */
function rowFor(description: string): HTMLElement {
  const row = screen.getByText(description).closest('tr');
  if (!row) throw new Error(`"${description}" is not in the table`);
  return row;
}

/**
 * The figure on a summary card, found by the card's label inside the named
 * summary block. Scoped because the same name also labels table rows.
 */
function cardFigure(block: string, label: string): string | undefined {
  const section = screen.getByText(block).closest('div.stat-card') as HTMLElement;
  return within(section).getByText(label).nextElementSibling?.textContent ?? undefined;
}

function openAddForm(): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: /إضافة مصروف/ }));
  return screen.getByRole('dialog');
}

function fillAmountAndDescription(dialog: HTMLElement, amount: string, description = 'مصروف جديد') {
  fireEvent.change(within(dialog).getByPlaceholderText(/راتب شهر يناير/), { target: { value: description } });
  fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: amount } });
}

beforeEach(() => {
  roleState.role = 'admin';
  Object.values(actions).forEach((fn) => fn.mockClear());
  vi.mocked(toast.error).mockClear();
  seedStore();
});

describe('the figures at the top', () => {
  it('totals every row that was not rejected, against the contract value', () => {
    renderSection();
    // 7,000 + 5,000 + 500 pending = 12,500; the rejected 3,000 is not spend.
    expect(screen.getByText(/نسبة ما صُرف من قيمة العقد \(12\.5%\)/)).toBeInTheDocument();
    expect(screen.getByText('12,500.00 ر.س / 100,000.00 ر.س')).toBeInTheDocument();
  });

  it('attributes to a resource only what was not rejected', () => {
    renderSection();
    // سالم has 7,000 approved and 3,000 rejected. Counting the rejected row
    // would say 10,000 on the same screen whose total says the row is not spend.
    expect(cardFigure('ملخص الصرف حسب المورد', resource.name)).toBe('7,000.00 ر.س');
    expect(cardFigure('ملخص الصرف حسب المسؤول', 'أحمد')).toBe('12,000.00 ر.س');
    expect(cardFigure('ملخص الصرف حسب المسؤول', 'ليلى')).toBe('500.00 ر.س');
  });

  it('counts the rows awaiting approval', () => {
    renderSection();
    expect(screen.getByText('1 مصروف بانتظار الاعتماد')).toBeInTheDocument();
  });

  it('keeps a legacy outstanding advance out of the table', () => {
    renderSection({ expenses: [...expenses, outstandingAdvanceExpense] });
    // Outstanding advances are receivables and live in the payables section.
    expect(screen.queryByText('سلفة قائمة قديمة')).not.toBeInTheDocument();
    expect(screen.getByText('استشارة تصميم')).toBeInTheDocument();
  });

  it('leaves the hidden advance out of the totals and the cards too', () => {
    // The advance is hidden as a receivable; counting it would put 2,000 of it on the
    // same screen's total and on its resource's and responsible's cards.
    renderSection({ expenses: [...expenses, { ...outstandingAdvanceExpense, resourceId: RESOURCE_ID }] });
    expect(screen.getByText(/نسبة ما صُرف من قيمة العقد \(12\.5%\)/)).toBeInTheDocument();
    expect(screen.getByText('12,500.00 ر.س / 100,000.00 ر.س')).toBeInTheDocument();
    expect(cardFigure('ملخص الصرف حسب المورد', resource.name)).toBe('7,000.00 ر.س');
    expect(cardFigure('ملخص الصرف حسب المسؤول', 'أحمد')).toBe('12,000.00 ر.س');
  });
});

describe('adding an expense', () => {
  it('books it against the active fund with the net amount', async () => {
    renderSection();
    const dialog = openAddForm();
    fillAmountAndDescription(dialog, '1000');

    fireEvent.click(within(dialog).getByRole('button', { name: 'إضافة' }));

    await waitFor(() => expect(actions.addExpense).toHaveBeenCalledTimes(1));
    expect(actions.addExpense).toHaveBeenCalledWith(expect.objectContaining({
      projectId: PROJECT_ID,
      description: 'مصروف جديد',
      amount: 1000,
      fundId: FUND_ID,
      custodyId: undefined,
      isVatExempt: false,
    }));
  });

  it('strips VAT when the amount typed includes it', async () => {
    renderSection();
    const dialog = openAddForm();
    fillAmountAndDescription(dialog, '1150');
    fireEvent.click(within(dialog).getByLabelText(/المبلغ شامل الضريبة/));

    // The preview and the wire must agree: 1,150 inclusive is 1,000 net.
    expect(within(dialog).getByText(/بدون ضريبة: 1,000\.00 ر\.س/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'إضافة' }));

    await waitFor(() => expect(actions.addExpense).toHaveBeenCalledWith(expect.objectContaining({ amount: 1000 })));
  });

  it('refuses more than the active fund still holds', async () => {
    renderSection();
    const dialog = openAddForm();
    // 50,000 − 12,000 documented = 38,000 left; 40,000 does not fit.
    fillAmountAndDescription(dialog, '40000');

    fireEvent.click(within(dialog).getByRole('button', { name: 'إضافة' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/يتجاوز المتبقي في الدفعة #1/), expect.anything()));
    expect(actions.addExpense).not.toHaveBeenCalled();
  });

  it('holds the form while the fund is still only transferred, and lets an admin acknowledge it inline', async () => {
    seedStore({ projectFunds: [fund({ status: 'transferred', acknowledgedAt: undefined })] });
    renderSection();
    const dialog = openAddForm();
    fillAmountAndDescription(dialog, '1000');

    expect(within(dialog).getByRole('button', { name: 'إضافة' })).toBeDisabled();
    expect(within(dialog).getByText(/الدفعة #1 — قيد التحويل/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'إقرار الاستلام' }));

    await waitFor(() => expect(actions.acknowledgeFund).toHaveBeenCalledWith(FUND_ID));
    expect(actions.addExpense).not.toHaveBeenCalled();
  });

  it('refuses an expense with no source at all', async () => {
    // No fund on the project, and no custody picked: money from nowhere.
    seedStore({ projectFunds: [] });
    renderSection();
    const dialog = openAddForm();
    fillAmountAndDescription(dialog, '1000');

    fireEvent.click(within(dialog).getByRole('button', { name: 'إضافة' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('يجب اختيار مصدر الصرف: دفعة أو عهدة.'));
    expect(actions.addExpense).not.toHaveBeenCalled();
  });

  it('activates a project still in planning on its first expense', async () => {
    renderSection({ projectStatus: 'planning' });
    const dialog = openAddForm();
    fillAmountAndDescription(dialog, '1000');

    fireEvent.click(within(dialog).getByRole('button', { name: 'إضافة' }));

    await waitFor(() => expect(actions.updateProject).toHaveBeenCalledWith(PROJECT_ID, { status: 'active' }));
  });
});

describe('editing an expense', () => {
  it('opens on the row\'s values and saves the changed amount against the same fund', async () => {
    renderSection();
    const [edit] = within(rowFor('استشارة تصميم')).getAllByRole('button').filter((b) => b.querySelector('svg.lucide-pencil'));
    fireEvent.click(edit);
    const dialog = screen.getByRole('dialog');

    expect((within(dialog).getByPlaceholderText(/راتب شهر يناير/) as HTMLInputElement).value).toBe('استشارة تصميم');
    expect((within(dialog).getByRole('spinbutton') as HTMLInputElement).value).toBe('7000');
    fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: '7500' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ التعديلات' }));

    await waitFor(() => expect(actions.updateExpense).toHaveBeenCalledTimes(1));
    expect(actions.updateExpense).toHaveBeenCalledWith('exp-1', expect.objectContaining({
      amount: 7500,
      fundId: FUND_ID,
      resourceId: RESOURCE_ID,
      custodyId: null,
    }));
  });
});

describe('row actions', () => {
  it('approves and rejects a pending row, and nothing else', async () => {
    renderSection();
    const row = rowFor('استشارة معلّقة');

    fireEvent.click(within(row).getByTitle('اعتماد'));
    await waitFor(() => expect(actions.updateExpense).toHaveBeenCalledWith('exp-pending', { approvalStatus: 'approved' }));

    fireEvent.click(within(row).getByTitle('رفض'));
    await waitFor(() => expect(actions.updateExpense).toHaveBeenCalledWith('exp-pending', { approvalStatus: 'rejected' }));

    // An approved row offers no approve control.
    expect(within(rowFor('استشارة تصميم')).queryByTitle('اعتماد')).not.toBeInTheDocument();
  });

  it('offers to link a row with no source to the active fund', async () => {
    renderSection({ expenses: [...expenses, expense({ id: 'exp-loose', amount: 100, description: 'مصروف بلا مصدر', fundId: undefined })] });

    fireEvent.click(within(rowFor('مصروف بلا مصدر')).getByTitle('ربط بالدفعة #1'));

    await waitFor(() => expect(actions.updateExpense).toHaveBeenCalledWith('exp-loose', { fundId: FUND_ID }));
    expect(within(rowFor('استشارة تصميم')).queryByTitle('ربط بالدفعة #1')).not.toBeInTheDocument();
  });

  it('deletes a row after confirmation', async () => {
    renderSection();
    const [deleteTrigger] = within(rowFor('استشارة إنشائية')).getAllByRole('button').filter((b) => b.querySelector('svg.lucide-trash2'));
    fireEvent.click(deleteTrigger);
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'حذف' }));

    await waitFor(() => expect(actions.deleteExpense).toHaveBeenCalledWith('exp-2'));
  });

  it('shows a read-only viewer the details control and nothing that writes', () => {
    renderSection({ readOnly: true });
    expect(within(rowFor('استشارة معلّقة')).getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /إضافة مصروف/ })).not.toBeInTheDocument();
  });
});

function expense(over: Partial<Expense>): Expense {
  return { ...expenses[0], ...over };
}
