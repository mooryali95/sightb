/**
 * Component tests for the custody section, written before it is split.
 *
 * A custody is cash handed to a person. What matters is what is left in it,
 * and the section computes that in two places: per row through
 * lib/funds getCustodyBreakdown (base + transfers in − spent − outstanding
 * advances) and once more in the header, by hand. These tests pin the row
 * figure, and pin the header to the same answer.
 *
 * Two tests were red when written:
 *   - the header's "المتبقي" ignored outstanding advances, so it reported
 *     4,000 left in a custody whose own row said 3,500;
 *   - a custody closed by hand (status "closed") with cash still in it was
 *     shown as "نشطة", because the status column read the balance alone.
 * The fix commit that follows turns both green without editing a test.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { useStore, type AppState } from '@/store/useStore';
import type { Custody, Expense } from '@/types/project';
import { CustodySection } from '../CustodySection';
import {
  PROJECT_ID, COMPANY_ID, FUND_ID, CUSTODY_ID, custody, custodyExpenses, fund, outstandingAdvance,
} from './custody-fixtures';

type Role = 'admin' | 'editor' | 'viewer';
const roleState: { role: Role } = { role: 'admin' };

const actions = {
  addCustody: vi.fn().mockResolvedValue('new-custody-id'),
  updateCustody: vi.fn().mockResolvedValue(undefined),
  deleteCustody: vi.fn().mockResolvedValue(undefined),
  createCashTransfer: vi.fn().mockResolvedValue(undefined),
  deleteCashTransfer: vi.fn().mockResolvedValue(undefined),
  refreshCashDerivations: vi.fn().mockResolvedValue(undefined),
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
    paymentRequests: [outstandingAdvance],
    cashTransfers: [],
    ...actions,
    ...over,
  } satisfies Partial<AppState>);
}

interface RenderOptions { custodies?: Custody[]; expenses?: Expense[]; readOnly?: boolean }

function renderSection({ custodies = [custody()], expenses = custodyExpenses, readOnly = false }: RenderOptions = {}) {
  render(
    <CustodySection projectId={PROJECT_ID} companyId={COMPANY_ID} custodies={custodies} expenses={expenses} readOnly={readOnly} />,
  );
}

function rowFor(name: string): HTMLElement {
  const row = screen.getByText(name, { selector: 'span' }).closest('tr');
  if (!row) throw new Error(`"${name}" is not in the table`);
  return row;
}

function openForm(name: RegExp): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name }));
  return screen.getByRole('dialog');
}

beforeEach(() => {
  roleState.role = 'admin';
  Object.values(actions).forEach((fn) => fn.mockClear());
  vi.mocked(toast.error).mockClear();
  seedStore();
});

describe('what a custody row reports', () => {
  it('deducts spend and outstanding advances from what is left', () => {
    renderSection();
    const row = rowFor('عمر');

    // 5,000 − 1,000 spent − 500 still out as an advance = 3,500.
    const cells = within(row).getAllByRole('cell').map((c) => c.textContent);
    expect(cells[1]).toBe('5,000.00 ر.س');
    expect(cells[3]).toBe('5,000.00 ر.س');
    expect(cells[4]).toBe('1,000.00 ر.س+ سلف 500.00 ر.س');
    expect(cells[5]).toContain('3,500.00 ر.س');
    expect(within(row).getByText('من دفعة #1')).toBeInTheDocument();
  });

  it('reports the same remainder in the header as in the rows', () => {
    renderSection();
    // The header used to compute total − spent by hand and forget the
    // advance, so it said 4,000 while the only row said 3,500.
    const header = screen.getByText(/إجمالي العهد/);
    expect(header).toHaveTextContent('المصروف: 1,000.00 ر.س');
    expect(header).toHaveTextContent('المتبقي: 3,500.00 ر.س');
  });

  it('credits an incoming cash transfer and names the fund it came from', () => {
    seedStore({
      cashTransfers: [{ id: 't-1', projectId: PROJECT_ID, fromFundId: FUND_ID, toCustodyId: CUSTODY_ID, amount: 2000, transferDate: '2026-02-20', createdAt: '2026-02-20T00:00:00Z' }],
    });
    renderSection();
    const row = rowFor('عمر');

    // 5,000 + 2,000 in − 1,000 − 500 = 5,500 left, out of 7,000 available.
    const cells = within(row).getAllByRole('cell').map((c) => c.textContent);
    expect(cells[2]).toContain('+2,000.00 ر.س');
    expect(cells[2]).toContain('من دفعة #1');
    expect(cells[3]).toBe('7,000.00 ر.س');
    expect(cells[5]).toContain('5,500.00 ر.س');
  });

  it('flags a custody with no fund behind it', () => {
    renderSection({ custodies: [custody({ sourceFundId: undefined })] });
    expect(within(rowFor('عمر')).getByText('غير مرتبطة بدفعة')).toBeInTheDocument();
  });

  it('shows a custody closed by hand as closed, even with cash still in it', () => {
    renderSection({ custodies: [custody({ status: 'closed', closedDate: '2026-03-01' })] });
    expect(within(rowFor('عمر')).getByText('مُغلقة')).toBeInTheDocument();
  });

  it('shows an exhausted custody as closed', () => {
    renderSection({ expenses: [expenseOf(5000)] });
    // 5,000 − 5,000 − 500 advance: nothing left.
    expect(within(rowFor('عمر')).getByText('مُغلقة')).toBeInTheDocument();
    expect(within(rowFor('عمر')).getByText(/مستنفدة/)).toBeInTheDocument();
  });
});

describe('opening a custody', () => {
  it('draws it from the newest fund with a balance', async () => {
    renderSection();
    const dialog = openForm(/عهدة جديدة/);

    fireEvent.change(within(dialog).getByPlaceholderText(/عمر أحمد/), { target: { value: 'سعاد' } });
    fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: '3000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'إضافة' }));

    await waitFor(() => expect(actions.addCustody).toHaveBeenCalledTimes(1));
    expect(actions.addCustody).toHaveBeenCalledWith(expect.objectContaining({
      projectId: PROJECT_ID,
      resourceName: 'سعاد',
      amount: 3000,
      sourceFundId: FUND_ID,
      status: 'active',
    }));
  });

  it('keeps an admin\'s choice of no fund, and then insists on a written reason', async () => {
    renderSection();
    const dialog = openForm(/عهدة جديدة/);
    fireEvent.change(within(dialog).getByPlaceholderText(/عمر أحمد/), { target: { value: 'سعاد' } });
    fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: '3000' } });
    const fundPicker = within(dialog).getByText(/دفعة #1/).closest('button') as HTMLElement;
    fireEvent.keyDown(fundPicker, { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('option', { name: /بدون ربط/ }), { key: 'Enter' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'إضافة' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('سبب عدم الربط بدفعة مطلوب (10 أحرف على الأقل)'));
    expect(actions.addCustody).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByPlaceholderText(/عهدة طارئة/), { target: { value: 'عهدة طارئة بانتظار اعتماد دفعة' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'إضافة' }));
    await waitFor(() => expect(actions.addCustody).toHaveBeenCalledTimes(1));
    expect(actions.addCustody).toHaveBeenCalledWith(expect.objectContaining({
      sourceFundId: undefined, notes: '[عهدة غير مربوطة بدفعة] عهدة طارئة بانتظار اعتماد دفعة',
    }));
  });

  it('will not reduce a custody below what was spent from it', async () => {
    renderSection();
    fireEvent.click(within(rowFor('عمر')).getByTitle('تعديل العهدة'));
    const dialog = screen.getByRole('dialog');

    fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: '800' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/لا يمكن تخفيض المبلغ تحت 1,000\.00/)));
    expect(actions.updateCustody).not.toHaveBeenCalled();
  });

  it('saves an edit against the same fund', async () => {
    renderSection();
    fireEvent.click(within(rowFor('عمر')).getByTitle('تعديل العهدة'));
    const dialog = screen.getByRole('dialog');

    fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: '6000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ' }));

    await waitFor(() => expect(actions.updateCustody).toHaveBeenCalledWith(CUSTODY_ID, expect.objectContaining({
      amount: 6000,
      sourceFundId: FUND_ID,
      resourceName: 'عمر',
    })));
  });
});

/** Radix Select, driven from the keyboard: open the trigger, Enter on the option. */
function pick(dialog: HTMLElement, placeholder: string, option: RegExp) {
  const trigger = within(dialog).getByText(placeholder).closest('button') as HTMLElement;
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  fireEvent.keyDown(screen.getByRole('option', { name: option }), { key: 'Enter' });
}

describe('moving cash into a custody', () => {
  it('records the transfer from the chosen fund to the chosen custody', async () => {
    renderSection();
    const dialog = openForm(/تحويل نقد/);

    pick(dialog, 'اختر دفعة', /دفعة #1/);
    pick(dialog, 'اختر عهدة', /عمر/);
    fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: '2000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'تسجيل التحويل' }));

    await waitFor(() => expect(actions.createCashTransfer).toHaveBeenCalledTimes(1));
    expect(actions.createCashTransfer).toHaveBeenCalledWith(expect.objectContaining({
      projectId: PROJECT_ID,
      fromFundId: FUND_ID,
      toCustodyId: CUSTODY_ID,
      amount: 2000,
    }));
  });

  it('refuses a transfer with no custody chosen', async () => {
    renderSection();
    const dialog = openForm(/تحويل نقد/);

    pick(dialog, 'اختر دفعة', /دفعة #1/);
    fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: '2000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'تسجيل التحويل' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('اختر العهدة المستهدفة'));
    expect(actions.createCashTransfer).not.toHaveBeenCalled();
  });

  it('refuses more than the fund still holds', async () => {
    // A 5,600 fund with the 5,000 custody drawn from it has 600 left.
    seedStore({ projectFunds: [fund({ amount: 5600 })] });
    renderSection();
    const dialog = openForm(/تحويل نقد/);

    pick(dialog, 'اختر دفعة', /دفعة #1/);
    pick(dialog, 'اختر عهدة', /عمر/);
    fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: '1000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'تسجيل التحويل' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/يتجاوز رصيد الدفعة المتاح \(600\.00 ر\.س\)/)));
    expect(actions.createCashTransfer).not.toHaveBeenCalled();
  });
});

describe('row actions', () => {
  it('names the spend that will lose its link before deleting', () => {
    renderSection();
    const [deleteTrigger] = within(rowFor('عمر')).getAllByRole('button').filter((b) => b.querySelector('svg.lucide-trash2'));
    fireEvent.click(deleteTrigger);
    expect(screen.getByRole('alertdialog')).toHaveTextContent('1,000.00 ر.س');
  });

  it('shows a read-only viewer the details control and nothing that writes', () => {
    renderSection({ readOnly: true });
    expect(within(rowFor('عمر')).getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /عهدة جديدة/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /تحويل نقد/ })).not.toBeInTheDocument();
  });
});

function expenseOf(amount: number): Expense {
  return { ...custodyExpenses[0], id: `exp-${amount}`, amount };
}
