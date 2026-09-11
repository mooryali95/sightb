/**
 * The fourth layer: the payment-requests tab, and the two dialogs it drives.
 *
 * This is the largest piece still inside the section and the one that moves
 * money most directly: a request is created from approved reimbursements,
 * walks a status chain gated by role, and is paid out of a named fund or
 * custody. Each of those steps can go wrong without a visible error — a
 * button that appears for the wrong role, an action wired to a neighbouring
 * row, an amount that does not match the rows it claims to pay.
 *
 * Two tests here were red when written. They document defects found while
 * reading the code, and the fix commit that follows turns them green:
 *
 *   - "opens the request dialog from the balances table" — the dialog was
 *     rendered inside the requests tab panel, which Radix unmounts while
 *     another tab is active. The button on the balances card set state that
 *     nothing rendered, so on the default tab it did nothing at all.
 *   - "refuses to confirm a payment with no source" — the dialog offered an
 *     "outside the system" source that the confirm handler always rejected,
 *     so the option was a dead end dressed as a choice.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useStore, type AppState } from '@/store/useStore';
import type { ProjectFund } from '@/types/project';
import { ResourcePayablesSection } from '../ResourcePayablesSection';
import {
  PROJECT_ID,
  RESOURCE_ID,
  partlyRefundedAdvance,
  paymentRequest,
  paymentRequests,
  resource,
  resourceReimbursements,
  vendorReimbursements,
} from './payables-fixtures';

type Role = 'admin' | 'editor' | 'viewer';
const roleState: { role: Role } = { role: 'admin' };

const actions = {
  approvePaymentRequest: vi.fn().mockResolvedValue(undefined),
  reviewPaymentRequest: vi.fn().mockResolvedValue(undefined),
  cancelPaymentRequest: vi.fn().mockResolvedValue(undefined),
  createPaymentRequest: vi.fn().mockResolvedValue('new-request-id'),
  submitPaymentRequest: vi.fn().mockResolvedValue(undefined),
  payPaymentRequest: vi.fn().mockResolvedValue(undefined),
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

/** A fund with 10,000 available: enough to pay any request in the fixtures. */
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

function seedStore(over: Partial<AppState> = {}) {
  const noop = vi.fn().mockResolvedValue(undefined);
  useStore.setState({
    resources: [resource],
    reimbursements: [...resourceReimbursements, ...vendorReimbursements],
    paymentRequests,
    resourceSettlements: [],
    projectFunds: [], custodies: [], expenses: [], budgetItems: [], cashTransfers: [],
    settlementEvents: [],
    loadSettlementEventsForRequest: noop, settleAdvanceWithSplit: noop,
    createReimbursement: noop, approveReimbursement: noop, rejectReimbursement: noop,
    deleteReimbursement: noop,
    createPaymentRequest: actions.createPaymentRequest,
    submitPaymentRequest: actions.submitPaymentRequest,
    reviewPaymentRequest: actions.reviewPaymentRequest,
    approvePaymentRequest: actions.approvePaymentRequest,
    rejectPaymentRequest: noop, schedulePaymentRequest: noop,
    payPaymentRequest: actions.payPaymentRequest,
    cancelPaymentRequest: actions.cancelPaymentRequest,
    deletePaymentRequest: noop, settleAdvance: noop, reverseSettlementEvent: noop,
    updatePaymentRequest: noop, createResourceSettlement: noop, signResourceSettlement: noop,
    ...over,
  } satisfies Partial<AppState>);
}

function renderSection() {
  render(<ResourcePayablesSection projectId={PROJECT_ID} projectName="مشروع" />);
}

function openTab(name: RegExp) {
  const trigger = screen.getByRole('tab', { name });
  fireEvent.mouseDown(trigger);
  fireEvent.click(trigger);
}

/** The card a request's description sits in, on the requests tab. */
function requestCard(description: string): HTMLElement {
  const card = screen.getByText(description).closest('div.p-4');
  if (!card) throw new Error(`"${description}" is not inside a request card`);
  return card as HTMLElement;
}

function buttonNames(scope: HTMLElement): string[] {
  return within(scope).queryAllByRole('button').map((b) => b.textContent?.trim() ?? '');
}

beforeEach(() => {
  roleState.role = 'admin';
  Object.values(actions).forEach((fn) => fn.mockClear());
  seedStore();
});

describe('request actions follow status and role', () => {
  it('lets an admin start review, approve or reject a submitted request', () => {
    renderSection();
    openTab(/طلبات الصرف/);
    expect(buttonNames(requestCard('طلب مُرسل')))
      .toEqual(['بدء المراجعة', 'اعتماد', 'رفض', 'إلغاء', 'تعديل الربط']);
  });

  it('wires approve to the row it sits in', () => {
    renderSection();
    openTab(/طلبات الصرف/);

    fireEvent.click(within(requestCard('طلب مُرسل')).getByRole('button', { name: 'اعتماد' }));

    expect(actions.approvePaymentRequest).toHaveBeenCalledWith('req-submitted');
    expect(actions.approvePaymentRequest).toHaveBeenCalledTimes(1);
  });

  it('withholds review, approve and reject from an editor', () => {
    roleState.role = 'editor';
    renderSection();
    openTab(/طلبات الصرف/);
    // An editor can withdraw their own submitted request, and nothing else.
    expect(buttonNames(requestCard('طلب مُرسل'))).toEqual(['إلغاء']);
  });

  it('offers scheduling and payment once a request is approved', () => {
    roleState.role = 'editor';
    seedStore({ paymentRequests: [paymentRequest({ id: 'approved', status: 'approved', description: 'طلب معتمد', amount: 600 })] });
    renderSection();
    openTab(/طلبات الصرف/);
    expect(buttonNames(requestCard('طلب معتمد'))).toEqual(['جدولة', 'تأكيد الدفع']);
  });

  it('exposes no action at all on a paid reimbursement', () => {
    roleState.role = 'editor';
    renderSection();
    openTab(/طلبات الصرف/);
    // Paid money has left the building; there is nothing left to press.
    expect(buttonNames(requestCard('طلب مدفوع'))).toEqual([]);
  });

  it('offers delete to an admin only on a draft, cancelled or rejected request', () => {
    seedStore({
      paymentRequests: [
        paymentRequest({ id: 'd', status: 'draft', description: 'طلب مسودة' }),
        paymentRequest({ id: 'p', status: 'paid', description: 'طلب مدفوع' }),
      ],
    });
    renderSection();
    openTab(/طلبات الصرف/);

    // A paid request can be re-linked by an admin, never deleted. Checked
    // first: once the confirmation below opens, everything behind it is
    // aria-hidden and the role query would report an empty card.
    expect(buttonNames(requestCard('طلب مدفوع'))).toEqual(['تعديل الربط']);

    // The delete trigger is an icon-only button; the proof that it is the
    // delete control is the confirmation it opens.
    const [deleteTrigger] = within(requestCard('طلب مسودة')).getAllByRole('button')
      .filter((b) => b.textContent?.trim() === '');
    fireEvent.click(deleteTrigger);
    expect(screen.getByRole('alertdialog')).toHaveTextContent('حذف طلب الصرف');
  });

  it('shows the settle action on an outstanding advance and a badge once it is settled', () => {
    roleState.role = 'editor';
    seedStore({
      paymentRequests: [
        partlyRefundedAdvance,
        paymentRequest({
          id: 'settled', requestType: 'advance', status: 'paid', amount: 1000,
          isAdvanceOutstanding: false, advanceSettledAt: '2026-04-01T00:00:00Z',
          settlementType: 'cash_refund', description: 'سلفة مسوّاة',
        }),
      ],
    });
    renderSection();
    openTab(/طلبات الصرف/);

    expect(buttonNames(requestCard('سلفة مدفوعة'))).toEqual(['تسوية السلفة']);
    const settled = requestCard('سلفة مسوّاة');
    expect(buttonNames(settled)).toEqual([]);
    expect(within(settled).getByText(/رد نقدي — 2026-04-01/)).toBeInTheDocument();
  });
});

describe('creating a request from approved reimbursements', () => {
  it('opens the request dialog from the balances table, pre-filled for that resource', () => {
    renderSection();
    // Deliberately on the default (reimbursements) tab: the button lives on the
    // balances card above the tabs, so it has to work whichever tab is open.
    const balances = screen.getByText('أرصدة الموارد').closest('div.p-4') as HTMLElement;
    fireEvent.click(within(balances).getByRole('button', { name: /دفع المستحقات/ }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('طلب صرف دفعة جديدة')).toBeInTheDocument();
    // The one approved-and-unpaid row is pre-selected, so the total is its amount.
    expect(within(dialog).getByText(/المجموع: 1,500\.00 ر\.س/)).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue(`دفع مستحقات ${resource.name}`)).toBeInTheDocument();
  });

  it('submits the selected rows and their sum, then sends the request for approval', async () => {
    renderSection();
    const balances = screen.getByText('أرصدة الموارد').closest('div.p-4') as HTMLElement;
    fireEvent.click(within(balances).getByRole('button', { name: /دفع المستحقات/ }));

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'إنشاء وإرسال للاعتماد' }));

    await waitFor(() => expect(actions.submitPaymentRequest).toHaveBeenCalledWith('new-request-id'));
    expect(actions.createPaymentRequest).toHaveBeenCalledWith(expect.objectContaining({
      projectId: PROJECT_ID,
      resourceId: RESOURCE_ID,
      requestType: 'reimbursement',
      amount: 1500,
      linkedReimbursementIds: ['res-approved'],
    }));
  });

  it('only counts the rows that are ticked', () => {
    renderSection();
    const balances = screen.getByText('أرصدة الموارد').closest('div.p-4') as HTMLElement;
    fireEvent.click(within(balances).getByRole('button', { name: /دفع المستحقات/ }));

    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('checkbox'));

    expect(within(dialog).getByText(/المجموع: 0\.00 ر\.س/)).toBeInTheDocument();
  });
});

describe('paying an approved request', () => {
  const approved = paymentRequest({ id: 'approved', status: 'approved', description: 'طلب معتمد', amount: 600 });

  function openPayDialog() {
    openTab(/طلبات الصرف/);
    fireEvent.click(within(requestCard('طلب معتمد')).getByRole('button', { name: 'تأكيد الدفع' }));
    return screen.getByRole('dialog');
  }

  it('pays out of the selected fund and names no custody', async () => {
    seedStore({ paymentRequests: [approved], projectFunds: [fundedFund] });
    renderSection();
    const dialog = openPayDialog();

    fireEvent.click(within(dialog).getByRole('button', { name: 'تأكيد الدفع' }));

    await waitFor(() => expect(actions.payPaymentRequest).toHaveBeenCalledTimes(1));
    expect(actions.payPaymentRequest).toHaveBeenCalledWith('approved', expect.objectContaining({
      paidFromFundId: 'fund-1',
      paidFromCustodyId: null,
      paymentMethod: 'bank_transfer',
    }));
  });

  it('refuses to confirm a payment with no source to draw from', () => {
    seedStore({ paymentRequests: [approved] });
    renderSection();
    const dialog = openPayDialog();

    // No fund and no custody has a balance. The confirm control must be
    // disabled, and the dialog must not offer a source the handler rejects.
    expect(within(dialog).getByRole('button', { name: 'تأكيد الدفع' })).toBeDisabled();
    expect(within(dialog).queryByText(/خارج النظام/)).not.toBeInTheDocument();
    expect(actions.payPaymentRequest).not.toHaveBeenCalled();
  });
});
