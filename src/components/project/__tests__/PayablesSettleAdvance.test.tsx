/**
 * The fifth layer: the settle-advance dialog.
 *
 * This is the heaviest piece left in the section — five settlement modes, a
 * live preview of what the operation does to the outstanding balance, a split
 * path when an invoice exceeds what is owed, a history of earlier events with
 * a reversal control, and an admin-only write-off. Every one of those decides
 * how much money leaves which ledger, and none of it was under a test.
 *
 * One test here was red when written. It documents a defect found while
 * reading the code: clearing the amount field settled the advance's ORIGINAL
 * amount, not the remainder still outstanding, while the preview above the
 * button said the operation was for 0.00. The fix commit that follows turns
 * it green without editing a test.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { useStore, type AppState } from '@/store/useStore';
import type { ProjectFund, SettlementEvent } from '@/types/project';
import { ResourcePayablesSection } from '../ResourcePayablesSection';
import {
  PROJECT_ID,
  partlyRefundedAdvance,
  paymentRequest,
  resource,
  resourceReimbursements,
} from './payables-fixtures';

type Role = 'admin' | 'editor' | 'viewer';
const roleState: { role: Role } = { role: 'admin' };

const actions = {
  settleAdvance: vi.fn().mockResolvedValue(undefined),
  settleAdvanceWithSplit: vi.fn().mockResolvedValue(undefined),
  reverseSettlementEvent: vi.fn().mockResolvedValue(undefined),
  loadSettlementEventsForRequest: vi.fn().mockResolvedValue(undefined),
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

vi.mock('@/lib/export-lazy', () => ({
  exportOutstandingAdvancesExcel: vi.fn(),
  exportOutstandingAdvancesPDF: vi.fn(),
  exportSettlementEventsExcel: vi.fn(),
  exportSettlementEventsPDF: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(),
  }),
}));

/** 10,000 in a fund: enough to cover any overflow these tests produce. */
const fundedFund: ProjectFund = {
  id: 'fund-1',
  projectId: PROJECT_ID,
  fundNumber: 1,
  amount: 10000,
  transferDate: '2026-02-01',
  status: 'transferred',
  createdBy: 'user-1',
  createdAt: '2026-02-01T00:00:00Z',
  updatedAt: '2026-02-01T00:00:00Z',
};

function settlementEvent(over: Partial<SettlementEvent>): SettlementEvent {
  return {
    id: 'ev',
    paymentRequestId: partlyRefundedAdvance.id,
    projectId: PROJECT_ID,
    eventType: 'cash_refund',
    amount: 2000,
    createdBy: 'user-1',
    createdAt: '2026-03-15T00:00:00Z',
    ...over,
  };
}

/** The 2,000 refund that explains why 3,000 of the 5,000 advance is still out. */
const refundEvent = settlementEvent({ id: 'ev-refund', notes: 'استلام نقدي' });

function seedStore(over: Partial<AppState> = {}) {
  const noop = vi.fn().mockResolvedValue(undefined);
  useStore.setState({
    resources: [resource],
    reimbursements: resourceReimbursements,
    paymentRequests: [partlyRefundedAdvance],
    resourceSettlements: [],
    projectFunds: [], custodies: [], expenses: [], budgetItems: [], cashTransfers: [],
    settlementEvents: [],
    loadSettlementEventsForRequest: actions.loadSettlementEventsForRequest,
    settleAdvanceWithSplit: actions.settleAdvanceWithSplit,
    settleAdvance: actions.settleAdvance,
    reverseSettlementEvent: actions.reverseSettlementEvent,
    createReimbursement: noop, approveReimbursement: noop, rejectReimbursement: noop,
    deleteReimbursement: noop, createPaymentRequest: noop, submitPaymentRequest: noop,
    reviewPaymentRequest: noop, approvePaymentRequest: noop, rejectPaymentRequest: noop,
    schedulePaymentRequest: noop, payPaymentRequest: noop, cancelPaymentRequest: noop,
    deletePaymentRequest: noop, updatePaymentRequest: noop,
    createResourceSettlement: noop, signResourceSettlement: noop,
    ...over,
  } satisfies Partial<AppState>);
}

function openTab(name: RegExp) {
  const trigger = screen.getByRole('tab', { name });
  fireEvent.mouseDown(trigger);
  fireEvent.click(trigger);
}

/** Render, switch to the requests tab, open the settle dialog on the advance. */
function openSettleDialog(): HTMLElement {
  render(<ResourcePayablesSection projectId={PROJECT_ID} projectName="مشروع" />);
  openTab(/طلبات الصرف/);
  fireEvent.click(screen.getByRole('button', { name: 'تسوية السلفة' }));
  return screen.getByRole('dialog');
}

/** Radix radios are buttons, not inputs; pick one by its visible label. */
function chooseMode(dialog: HTMLElement, label: string) {
  const radio = within(dialog).getByText(label).closest('label')?.querySelector('button[role="radio"]');
  if (!radio) throw new Error(`no radio labelled "${label}"`);
  fireEvent.click(radio);
}

function amountInput(dialog: HTMLElement): HTMLInputElement {
  return within(dialog).getByRole('spinbutton') as HTMLInputElement;
}

function confirmButton(dialog: HTMLElement) {
  return within(dialog).getByRole('button', { name: 'تنفيذ التسوية' });
}

beforeEach(() => {
  roleState.role = 'admin';
  Object.values(actions).forEach((fn) => fn.mockClear());
  vi.mocked(toast.error).mockClear();
  seedStore();
});

describe('what the dialog says is outstanding', () => {
  it('shows the remainder after earlier refunds, and pre-fills the amount with it', () => {
    const dialog = openSettleDialog();

    // 5,000 advanced, 2,000 came back: the operation is about 3,000, and
    // the amount field starts there so a plain confirm closes the advance.
    const rowValue = (label: string) =>
      within(dialog).getByText(label).parentElement?.querySelector('.font-mono')?.textContent;
    expect(rowValue('مبلغ السلفة')).toBe('5,000.00 ر.س');
    expect(rowValue('مردود سابقاً')).toBe('2,000.00 ر.س');
    expect(rowValue('المتبقي القائم')).toBe('3,000.00 ر.س');
    expect(amountInput(dialog).value).toBe('3000');
  });

  it('loads the advance\'s settlement history when opened', () => {
    openSettleDialog();
    expect(actions.loadSettlementEventsForRequest).toHaveBeenCalledWith(partlyRefundedAdvance.id);
  });
});

describe('a documented settlement', () => {
  it('books the outstanding remainder as an expense in the chosen category', async () => {
    const dialog = openSettleDialog();

    fireEvent.click(confirmButton(dialog));

    await waitFor(() => expect(actions.settleAdvance).toHaveBeenCalledTimes(1));
    expect(actions.settleAdvance).toHaveBeenCalledWith(partlyRefundedAdvance.id, expect.objectContaining({
      type: 'documented',
      settledAmount: 3000,
      expenseCategory: 'other',
    }));
    expect(actions.settleAdvanceWithSplit).not.toHaveBeenCalled();
  });

  it('settles the remainder, not the original amount, when the field is cleared', async () => {
    const dialog = openSettleDialog();

    fireEvent.change(amountInput(dialog), { target: { value: '' } });
    // The preview and the wire must agree: an empty field means "the
    // remainder", which is what the placeholder promises.
    expect(within(dialog).getByText('هذه العملية').nextElementSibling).toHaveTextContent('3,000.00 ر.س');
    fireEvent.click(confirmButton(dialog));

    await waitFor(() => expect(actions.settleAdvance).toHaveBeenCalledTimes(1));
    expect(actions.settleAdvance).toHaveBeenCalledWith(partlyRefundedAdvance.id, expect.objectContaining({
      settledAmount: 3000,
    }));
  });

  it('switches to a split when the invoice exceeds the remainder, and needs a source for the overflow', async () => {
    seedStore({ projectFunds: [fundedFund] });
    const dialog = openSettleDialog();

    fireEvent.change(amountInput(dialog), { target: { value: '3500' } });

    // 3,500 against 3,000 outstanding: 3,000 closes the advance and 500 is a
    // fresh expense that has to come out of a named fund or custody.
    expect(within(dialog).getByText(/فائض \(500\.00 ر\.س\)/)).toBeInTheDocument();
    expect(confirmButton(dialog)).toBeEnabled();

    fireEvent.click(confirmButton(dialog));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('اختر مصدر تغطية الجزء الفائض'));
    expect(actions.settleAdvanceWithSplit).not.toHaveBeenCalled();
    expect(actions.settleAdvance).not.toHaveBeenCalled();
  });
});

describe('a cash refund', () => {
  it('refuses more than is outstanding', () => {
    const dialog = openSettleDialog();
    chooseMode(dialog, 'رد نقدي');

    fireEvent.change(amountInput(dialog), { target: { value: '3001' } });

    // A refund larger than the remainder would leave the advance negative.
    expect(within(dialog).getByText(/المبلغ يتجاوز المتبقي القائم/)).toBeInTheDocument();
    expect(confirmButton(dialog)).toBeDisabled();
  });

  it('sends a partial refund and leaves the rest outstanding', async () => {
    const dialog = openSettleDialog();
    chooseMode(dialog, 'رد نقدي');

    fireEvent.change(amountInput(dialog), { target: { value: '1000' } });
    expect(within(dialog).getByText('المتبقي').nextElementSibling).toHaveTextContent('2,000.00 ر.س');
    fireEvent.click(confirmButton(dialog));

    await waitFor(() => expect(actions.settleAdvance).toHaveBeenCalledTimes(1));
    expect(actions.settleAdvance).toHaveBeenCalledWith(partlyRefundedAdvance.id, expect.objectContaining({
      type: 'cash_refund',
      settledAmount: 1000,
    }));
  });
});

describe('a compound settlement', () => {
  it('sends the refund first, then the documented part', async () => {
    const dialog = openSettleDialog();
    chooseMode(dialog, 'تسوية مركّبة');

    const [refund, documented] = within(dialog).getAllByRole('spinbutton');
    fireEvent.change(refund, { target: { value: '1000' } });
    fireEvent.change(documented, { target: { value: '2000' } });
    fireEvent.click(confirmButton(dialog));

    await waitFor(() => expect(actions.settleAdvance).toHaveBeenCalledTimes(2));
    expect(actions.settleAdvance.mock.calls[0][1]).toMatchObject({ type: 'cash_refund', settledAmount: 1000 });
    expect(actions.settleAdvance.mock.calls[1][1]).toMatchObject({ type: 'documented', settledAmount: 2000 });
  });

  it('refuses when both parts are empty', async () => {
    const dialog = openSettleDialog();
    chooseMode(dialog, 'تسوية مركّبة');

    fireEvent.click(confirmButton(dialog));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('أدخل مبلغ الرد و/أو التوثيق'));
    expect(actions.settleAdvance).not.toHaveBeenCalled();
  });
});

describe('writing an advance off', () => {
  it('is not offered to an editor', () => {
    roleState.role = 'editor';
    const dialog = openSettleDialog();

    const radio = within(dialog).getByText('شطب (مدير فقط)').closest('label')?.querySelector('button[role="radio"]');
    expect(radio).toBeDisabled();
  });

  it('requires a reason from an admin', async () => {
    const dialog = openSettleDialog();
    chooseMode(dialog, 'شطب');

    fireEvent.click(confirmButton(dialog));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('سبب الشطب مطلوب'));
    expect(actions.settleAdvance).not.toHaveBeenCalled();
  });

  it('writes off the full remainder once a reason is given', async () => {
    const dialog = openSettleDialog();
    chooseMode(dialog, 'شطب');

    fireEvent.change(within(dialog).getByPlaceholderText('سبب الشطب (إلزامي)'), { target: { value: 'المورد غادر' } });
    fireEvent.click(confirmButton(dialog));

    await waitFor(() => expect(actions.settleAdvance).toHaveBeenCalledTimes(1));
    expect(actions.settleAdvance).toHaveBeenCalledWith(partlyRefundedAdvance.id, expect.objectContaining({
      type: 'written_off',
      settledAmount: 3000,
      notes: 'المورد غادر',
    }));
  });
});

describe('the settlement history inside the dialog', () => {
  it('lists earlier events and lets an editor reverse one, for a stated reason', async () => {
    seedStore({ settlementEvents: [refundEvent] });
    const dialog = openSettleDialog();

    const row = within(dialog).getByText('رد نقدي', { selector: 'span.font-medium' }).closest('div.justify-between') as HTMLElement;
    expect(within(row).getByText('2,000.00 ر.س')).toBeInTheDocument();
    fireEvent.click(within(row).getByTitle('تراجع عن هذا الحدث'));

    const confirm = screen.getByRole('alertdialog');
    const go = within(confirm).getByRole('button', { name: 'تأكيد التراجع' });
    expect(go).toBeDisabled();
    fireEvent.change(within(confirm).getByPlaceholderText(/سبب التراجع/), { target: { value: 'قُيّد بالخطأ' } });
    fireEvent.click(go);

    await waitFor(() => expect(actions.reverseSettlementEvent).toHaveBeenCalledWith('ev-refund', 'قُيّد بالخطأ'));
  });

  it('marks a reversed event and offers no second reversal', () => {
    seedStore({
      settlementEvents: [
        refundEvent,
        settlementEvent({ id: 'ev-reverse', eventType: 'reverse', reversedEventId: 'ev-refund', notes: 'خطأ' }),
      ],
    });
    const dialog = openSettleDialog();

    expect(within(dialog).getByText('ملغى')).toBeInTheDocument();
    expect(within(dialog).queryByTitle('تراجع عن هذا الحدث')).not.toBeInTheDocument();
  });
});
