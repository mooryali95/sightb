/**
 * Component tests for the vendor payables panel, written before it is
 * split.
 *
 * A vendor payable is money the project owes; settling it writes an
 * expense against a fund or a custody. What costs money here: which rows
 * count as owed, which sources are offered (never one that cannot cover
 * the amount), and what the settlement expense says.
 *
 * Five tests were red when written, on four defects. A payable marked
 * reimbursed with no
 * expense link was still counted as owed; a fund's balance ignored the
 * advances still out of it, so a fund that could not cover the payable
 * was offered; a custody's balance was read off its row instead of the
 * ledger, so transfers in and advances out were both missed; and the
 * settlement expense was booked in the calendar month rather than the
 * project's. The fix commit that follows turns them green without editing
 * a test.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { toast } from '@/hooks/use-toast';
import { useStore, type AppState } from '@/store/useStore';
import { VendorPayablesPanel } from '../VendorPayablesPanel';
import {
  PROJECT_ID, cashTransfers, custodies, expenses, funds, paymentRequests, project, reimbursements,
} from './vendor-payables-fixtures';

const roleState = { canEdit: true };

vi.mock('@/hooks/useRole', () => ({
  useRole: () => ({
    roles: [], isAdmin: false, isOwner: false, isScopedAdmin: false, isAdminFor: () => false,
    canEdit: () => roleState.canEdit, hasAccess: () => true, loading: false,
  }),
}));
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn(), useToast: () => ({ toast: vi.fn() }) }));

const actions = {
  createReimbursement: vi.fn().mockResolvedValue('new-payable'),
  addExpense: vi.fn().mockResolvedValue('new-expense'),
};

function seedStore(over: Partial<AppState> = {}) {
  useStore.setState({
    projects: [project], reimbursements, projectFunds: funds, custodies, expenses, cashTransfers, paymentRequests,
    ...actions,
    ...over,
  } satisfies Partial<AppState>);
}

function renderPanel(readOnly = false) {
  return render(<VendorPayablesPanel projectId={PROJECT_ID} readOnly={readOnly} />);
}

function rowFor(description: string): HTMLElement {
  const row = screen.getByText(description).closest('tr');
  if (!row) throw new Error(`"${description}" is not in the table`);
  return row;
}

/** Drives a Radix Select by the text its trigger currently shows. */
function pick(dialog: HTMLElement, shown: string | RegExp, option: RegExp) {
  const trigger = within(dialog).getByText(shown).closest('button') as HTMLElement;
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  fireEvent.keyDown(screen.getByRole('option', { name: option }), { key: 'Enter' });
}

function openSettle(description: string): HTMLElement {
  fireEvent.click(within(rowFor(description)).getByRole('button', { name: 'سداد' }));
  return screen.getByRole('dialog');
}

beforeEach(() => {
  roleState.canEdit = true;
  Object.values(actions).forEach((fn) => fn.mockClear());
  vi.mocked(toast).mockClear();
  seedStore();
});

describe('what is owed', () => {
  it('lists only this project\'s vendor payables, and totals what is still owed', () => {
    renderPanel();
    expect(screen.getByText('توريد مواد')).toBeInTheDocument();
    expect(screen.getByText('توريد معدات')).toBeInTheDocument();
    expect(screen.queryByText('سفر موظف')).not.toBeInTheDocument();
    expect(screen.queryByText('ذمة مشروع آخر')).not.toBeInTheDocument();
    expect(within(rowFor('توريد مواد')).getByText('مستحقة')).toBeInTheDocument();
    expect(within(rowFor('توريد معدات')).getByText(/مسدّدة/)).toBeInTheDocument();
    expect(screen.getByText('مستحق: 9,000')).toBeInTheDocument();
  });

  it('treats a payable marked reimbursed as settled even without an expense link', () => {
    renderPanel();
    // Its status is the ledger's word; the link is only how one path settles.
    expect(within(rowFor('نقل بضاعة')).getByText(/مسدّدة/)).toBeInTheDocument();
    expect(within(rowFor('نقل بضاعة')).queryByRole('button', { name: 'سداد' })).not.toBeInTheDocument();
  });

  it('shows a viewer the ledger and nothing that writes', () => {
    renderPanel(true);
    expect(screen.queryByRole('button', { name: /تسجيل ذمة مورد/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'سداد' })).not.toBeInTheDocument();
  });
});

describe('recording a payable', () => {
  it('records it as an approved vendor payable on the project', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /تسجيل ذمة مورد/ }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByPlaceholderText(/مؤسسة النور/), { target: { value: 'شركة الإمداد' } });
    const [description] = within(dialog).getAllByRole('textbox').filter((el) => !el.getAttribute('placeholder') && el.tagName === 'INPUT');
    fireEvent.change(description, { target: { value: 'أسمنت' } });
    fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: '1200' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ' }));

    await waitFor(() => expect(actions.createReimbursement).toHaveBeenCalledWith(expect.objectContaining({
      projectId: PROJECT_ID, sourceKind: 'vendor', vendorName: 'شركة الإمداد', category: 'other', description: 'أسمنت', amount: 1200, autoApprove: true,
    })));
  });

  it('refuses one with no vendor, description or amount', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /تسجيل ذمة مورد/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'حفظ' }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'بيانات ناقصة', variant: 'destructive' })));
    expect(actions.createReimbursement).not.toHaveBeenCalled();
  });
});

describe('settling a payable', () => {
  it('writes an approved expense on the chosen fund, in the project\'s month, linked to the payable', async () => {
    renderPanel();
    const dialog = openSettle('توريد مواد');
    pick(dialog, 'اختر…', /دفعة #2/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'تأكيد السداد' }));

    await waitFor(() => expect(actions.addExpense).toHaveBeenCalledTimes(1));
    expect(actions.addExpense).toHaveBeenCalledWith(expect.objectContaining({
      projectId: PROJECT_ID, amount: 9000, vendor: 'مؤسسة التوريد', category: 'equipment',
      approvalStatus: 'approved', fundId: 'fund-2', custodyId: undefined, reimbursesPayableId: 'vp-open',
      month: 13,
    }));
  });

  it('does not offer a fund whose outstanding advances leave less than the payable', () => {
    renderPanel();
    const dialog = openSettle('توريد مواد');
    fireEvent.keyDown(within(dialog).getByText('اختر…').closest('button') as HTMLElement, { key: 'ArrowDown' });
    // Fund 1: 12,000 − 1,000 spent − 3,000 advance out = 8,000, short of 9,000.
    expect(screen.getByRole('option', { name: /دفعة #1 — متبقي: 8,000/ })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('option', { name: /دفعة #2 — متبقي: 15,000/ })).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('measures a custody by the ledger, not by its row, and settles from the one that can cover it', async () => {
    renderPanel();
    const dialog = openSettle('توريد مواد');
    pick(dialog, 'دفعة نشطة', /عهدة نشطة/);
    fireEvent.keyDown(within(dialog).getByText('اختر…').closest('button') as HTMLElement, { key: 'ArrowDown' });
    // Custody 1: 10,000 + 2,000 in − 4,000 advance out = 8,000, short of 9,000.
    expect(screen.getByRole('option', { name: /عمر — متبقي: 8,000/ })).toHaveAttribute('aria-disabled', 'true');
    fireEvent.keyDown(screen.getByRole('option', { name: /ليلى — متبقي: 12,000/ }), { key: 'Enter' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'تأكيد السداد' }));

    await waitFor(() => expect(actions.addExpense).toHaveBeenCalledWith(expect.objectContaining({
      custodyId: 'cust-2', fundId: undefined, reimbursesPayableId: 'vp-open',
    })));
  });
});
