/**
 * Component tests for the funds section, written before it is split.
 *
 * The section is the largest file left in the repository (922 lines) and it
 * decides three things that cost money when wrong: what a fund still holds,
 * who may open a new one and on what condition, and whether a settlement can
 * be sent with the figure typed in. These tests drive the real store and the
 * real derivation chain in lib/funds and assert on rendered text and on what
 * reaches the store actions.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { useStore, type AppState } from '@/store/useStore';
import { FundsSection } from '../FundsSection';
import { PROJECT_ID, FUND_ID, expenses, fund, settlement } from './funds-fixtures';

type Role = 'admin' | 'editor' | 'viewer';
const roleState: { role: Role } = { role: 'admin' };

const actions = {
  createFund: vi.fn().mockResolvedValue('new-fund-id'),
  acknowledgeFund: vi.fn().mockResolvedValue(undefined),
  submitSettlement: vi.fn().mockResolvedValue(undefined),
  approveSettlement: vi.fn().mockResolvedValue(undefined),
  rejectSettlement: vi.fn().mockResolvedValue(undefined),
  deleteFund: vi.fn().mockResolvedValue(undefined),
  updateSettlementDraft: vi.fn().mockResolvedValue(undefined),
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
    fundSettlements: [settlement()],
    custodies: [], paymentRequests: [], cashTransfers: [],
    ...actions,
    ...over,
  } satisfies Partial<AppState>);
}

function renderSection(readOnly = false) {
  render(<FundsSection projectId={PROJECT_ID} expenses={expenses} readOnly={readOnly} />);
}

/** The table row for a fund, by its number. */
function fundRow(number: number): HTMLElement {
  const row = screen.getByText(`#${number}`).closest('tr');
  if (!row) throw new Error(`fund #${number} is not in the table`);
  return row;
}

function rowButtons(row: HTMLElement): string[] {
  return within(row).getAllByRole('button').map((b) => b.textContent?.trim() ?? '');
}

beforeEach(() => {
  roleState.role = 'admin';
  Object.values(actions).forEach((fn) => fn.mockClear());
  vi.mocked(toast.error).mockClear();
  seedStore();
});

describe('what a fund row reports', () => {
  it('shows the amount, the documented spend, and what is left', () => {
    renderSection();
    const row = fundRow(1);

    // 50,000 received, 7,000 + 5,000 spent. The 9,999 on another project's
    // fund must not appear anywhere in this row.
    expect(within(row).getByText('50,000.00 ر.س')).toBeInTheDocument();
    expect(within(row).getByText('12,000.00 ر.س')).toBeInTheDocument();
    expect(within(row).getByText('38,000.00 ر.س')).toBeInTheDocument();
    expect(within(row).queryByText(/9,999|21,999|28,001/)).not.toBeInTheDocument();
  });

  it('reports zero left once the settlement is approved, whatever the arithmetic says', () => {
    // An approved settlement closes the fund. Its computed remainder is still
    // 38,000, but showing that would put phantom cash in the manager's hand.
    seedStore({ fundSettlements: [settlement({ status: 'approved' })] });
    renderSection();
    const row = fundRow(1);

    expect(within(row).getByText('0.00 ر.س')).toBeInTheDocument();
    expect(within(row).queryByText('38,000.00 ر.س')).not.toBeInTheDocument();
  });

  it('keeps another project\'s fund off the table', () => {
    seedStore({ projectFunds: [fund(), fund({ id: 'foreign', fundNumber: 9, projectId: 'a-different-project' })] });
    renderSection();
    expect(screen.queryByText('#9')).not.toBeInTheDocument();
  });
});

describe('opening a new fund', () => {
  it('is offered to an admin only', () => {
    renderSection();
    expect(screen.getByRole('button', { name: /دفعة جديدة/ })).toBeInTheDocument();
  });

  it('is withheld from an editor', () => {
    roleState.role = 'editor';
    renderSection();
    expect(screen.queryByRole('button', { name: /دفعة جديدة/ })).not.toBeInTheDocument();
  });

  it('is blocked while a fund is unsettled, with the emergency path offered instead', () => {
    renderSection();
    // Fund #1 is acknowledged, not settled: the rule says no new fund.
    expect(screen.getByRole('button', { name: /دفعة جديدة/ })).toBeDisabled();
    expect(screen.getByText(/لا يمكن اعتماد دفعة جديدة قبل تسوية الدفعة رقم 1/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /دفعة استثنائية/ })).toBeInTheDocument();
  });

  it('is open once every fund is settled', () => {
    seedStore({ projectFunds: [fund({ status: 'settled' })], fundSettlements: [settlement({ status: 'approved' })] });
    renderSection();
    expect(screen.getByRole('button', { name: /دفعة جديدة/ })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /دفعة استثنائية/ })).not.toBeInTheDocument();
  });

  it('creates the fund with the amount and date typed', async () => {
    seedStore({ projectFunds: [fund({ status: 'settled' })], fundSettlements: [settlement({ status: 'approved' })] });
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: /دفعة جديدة/ }));
    const dialog = screen.getByRole('dialog');

    fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: '25000' } });
    fireEvent.change(dialog.querySelector('input[type="date"]') as HTMLInputElement, { target: { value: '2026-05-01' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'اعتماد التحويل' }));

    await waitFor(() => expect(actions.createFund).toHaveBeenCalledTimes(1));
    expect(actions.createFund).toHaveBeenCalledWith(PROJECT_ID, 25000, '2026-05-01', undefined);
  });

  it('refuses an amount of zero', async () => {
    seedStore({ projectFunds: [fund({ status: 'settled' })], fundSettlements: [settlement({ status: 'approved' })] });
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: /دفعة جديدة/ }));

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'اعتماد التحويل' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('أدخل مبلغاً صحيحاً'));
    expect(actions.createFund).not.toHaveBeenCalled();
  });

  it('records an emergency fund with its reason, and refuses one without', async () => {
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: /دفعة استثنائية/ }));
    const dialog = screen.getByRole('dialog');

    fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: '8000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'اعتماد الدفعة الاستثنائية' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/سبب الدفعة الاستثنائية مطلوب/)));
    expect(actions.createFund).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByPlaceholderText(/مدفوعات عاجلة/), { target: { value: 'مدفوعات عاجلة لمورد حرج' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'اعتماد الدفعة الاستثنائية' }));

    await waitFor(() => expect(actions.createFund).toHaveBeenCalledTimes(1));
    expect(actions.createFund.mock.calls[0][1]).toBe(8000);
    expect(actions.createFund.mock.calls[0][4]).toEqual({ emergency: true, emergencyReason: 'مدفوعات عاجلة لمورد حرج' });
  });
});

describe('row actions follow the fund\'s and the settlement\'s status', () => {
  it('asks a freshly transferred fund to be acknowledged', async () => {
    seedStore({ projectFunds: [fund({ status: 'transferred', acknowledgedAt: undefined })], fundSettlements: [] });
    renderSection();

    fireEvent.click(within(fundRow(1)).getByRole('button', { name: /إقرار استلام/ }));

    await waitFor(() => expect(actions.acknowledgeFund).toHaveBeenCalledWith(FUND_ID));
  });

  it('offers settlement on an acknowledged fund with a draft, and nothing to a read-only viewer', () => {
    renderSection();
    expect(within(fundRow(1)).getByRole('button', { name: /تسوية/ })).toBeInTheDocument();
  });

  it('withholds every write from a read-only viewer', () => {
    roleState.role = 'viewer';
    renderSection(true);
    // Only the details (eye) button remains: no acknowledge, settle or delete.
    expect(rowButtons(fundRow(1))).toEqual(['']);
  });

  it('lets an admin approve or reject a submitted settlement, and an editor neither', () => {
    seedStore({ fundSettlements: [settlement({ status: 'submitted', remainingCash: 38000 })] });
    renderSection();
    expect(rowButtons(fundRow(1))).toEqual(expect.arrayContaining(['اعتماد', 'رفض']));

    roleState.role = 'editor';
    seedStore({ fundSettlements: [settlement({ status: 'submitted', remainingCash: 38000 })] });
    render(<FundsSection projectId={PROJECT_ID} expenses={expenses} />);
    const rows = screen.getAllByText('#1').map((c) => c.closest('tr') as HTMLElement);
    expect(rowButtons(rows[rows.length - 1])).not.toEqual(expect.arrayContaining(['اعتماد', 'رفض']));
  });

  it('wires approve to the settlement in that row', async () => {
    seedStore({ fundSettlements: [settlement({ id: 'stl-9', status: 'submitted', remainingCash: 38000 })] });
    renderSection();

    fireEvent.click(within(fundRow(1)).getByRole('button', { name: 'اعتماد' }));

    await waitFor(() => expect(actions.approveSettlement).toHaveBeenCalledWith('stl-9'));
  });
});

describe('the settlement dialog', () => {
  function openSettle(): HTMLElement {
    fireEvent.click(within(fundRow(1)).getByRole('button', { name: /تسوية/ }));
    return screen.getByRole('dialog');
  }

  it('reconciles received against spent and the cash typed in', () => {
    renderSection();
    const dialog = openSettle();

    // 50,000 − 12,000 − 0 typed = 38,000 unaccounted for until cash is entered.
    const figure = (label: string) => within(dialog).getByText(label).nextElementSibling?.textContent;
    expect(figure('المستلم')).toBe('50,000.00 ر.س');
    expect(figure('المصروف الموثق')).toBe('12,000.00 ر.س');
    expect(figure('الفرق')).toBe('38,000.00 ر.س');

    fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: '38000' } });
    expect(figure('الفرق')).toBe('0.00 ر.س');
  });

  it('fills the cash in hand from the ledger on request', () => {
    renderSection();
    const dialog = openSettle();

    fireEvent.click(within(dialog).getByRole('button', { name: 'احتسب تلقائياً' }));

    expect((within(dialog).getByRole('spinbutton') as HTMLInputElement).value).toBe('38000');
  });

  it('sends a balanced settlement with the figure typed', async () => {
    renderSection();
    const dialog = openSettle();

    fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: '38000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'إرسال للاعتماد' }));

    await waitFor(() => expect(actions.submitSettlement).toHaveBeenCalledWith(FUND_ID, 38000, [], undefined));
  });

  it('will not send an unexplained difference, and sends it once explained', async () => {
    renderSection();
    const dialog = openSettle();

    fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: '37000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'إرسال للاعتماد' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('يجب توضيح سبب الفرق'));
    expect(actions.submitSettlement).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByPlaceholderText(/مصروف نقدي بدون فاتورة/), { target: { value: 'مصروف نقدي بلا فاتورة' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'إرسال للاعتماد' }));

    await waitFor(() => expect(actions.submitSettlement).toHaveBeenCalledWith(FUND_ID, 37000, [], 'مصروف نقدي بلا فاتورة'));
  });

  it('saves the draft with the cash and reason typed', async () => {
    renderSection();
    const dialog = openSettle();

    fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: '38000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ مسودة' }));

    await waitFor(() => expect(actions.updateSettlementDraft).toHaveBeenCalledWith('settlement-1', expect.objectContaining({ remainingCash: 38000 })));
  });

  it('opens read-only on a submitted settlement', () => {
    seedStore({ fundSettlements: [settlement({ status: 'submitted', remainingCash: 38000 })] });
    renderSection();
    fireEvent.click(within(fundRow(1)).getByRole('button', { name: 'عرض' }));
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByRole('spinbutton')).toBeDisabled();
    expect(within(dialog).queryByRole('button', { name: 'إرسال للاعتماد' })).not.toBeInTheDocument();
  });
});

describe('rejecting a settlement', () => {
  it('insists on a reason, then rejects with it', async () => {
    seedStore({ fundSettlements: [settlement({ id: 'stl-9', status: 'submitted', remainingCash: 38000 })] });
    renderSection();
    fireEvent.click(within(fundRow(1)).getByRole('button', { name: 'رفض' }));
    const dialog = screen.getByRole('dialog');

    fireEvent.click(within(dialog).getByRole('button', { name: 'رفض التسوية' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('سبب الرفض مطلوب'));
    expect(actions.rejectSettlement).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'الفواتير ناقصة' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'رفض التسوية' }));

    await waitFor(() => expect(actions.rejectSettlement).toHaveBeenCalledWith('stl-9', 'الفواتير ناقصة'));
  });
});

describe('deleting a fund', () => {
  it('names what will be unlinked before asking', () => {
    renderSection();
    const [deleteTrigger] = within(fundRow(1)).getAllByRole('button').filter((b) => b.textContent?.trim() === '' && b.getAttribute('title') !== 'عرض التفاصيل');
    fireEvent.click(deleteTrigger);

    // Two expenses, 12,000 in total, hang off this fund.
    expect(screen.getByRole('alertdialog')).toHaveTextContent('مصروفان (12,000.00 ر.س)');
  });
});
