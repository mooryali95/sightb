/**
 * The sixth layer: the four dialogs still living in the section — pay,
 * edit-links, reject and final settlement.
 *
 * Layer four covered the pay dialog on its main path only (one fund with a
 * balance). What was still open: the custody path, the balance guard, the
 * scheduled date carried into the dialog, the amount recomputed when a
 * request's linked rows change (and left alone once it is paid), the reject
 * dialog routing to the right ledger, and the settlement draft's totals.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { useStore, type AppState } from '@/store/useStore';
import type { Custody, ProjectFund } from '@/types/project';
import { ResourcePayablesSection } from '../ResourcePayablesSection';
import {
  PROJECT_ID,
  RESOURCE_ID,
  paymentRequest,
  paymentRequests,
  resource,
  resourceReimbursements,
} from './payables-fixtures';

type Role = 'admin' | 'editor' | 'viewer';
const roleState: { role: Role } = { role: 'admin' };

const actions = {
  payPaymentRequest: vi.fn().mockResolvedValue(undefined),
  updatePaymentRequest: vi.fn().mockResolvedValue(undefined),
  rejectPaymentRequest: vi.fn().mockResolvedValue(undefined),
  rejectReimbursement: vi.fn().mockResolvedValue(undefined),
  createResourceSettlement: vi.fn().mockResolvedValue('settlement-id'),
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

function fund(over: Partial<ProjectFund>): ProjectFund {
  return {
    id: 'fund-1',
    projectId: PROJECT_ID,
    fundNumber: 1,
    amount: 10000,
    transferDate: '2026-02-01',
    status: 'transferred',
    createdBy: 'user-1',
    createdAt: '2026-02-01T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
    ...over,
  };
}

/** An active custody holding 5,000 with nothing spent from it yet. */
const custody: Custody = {
  id: 'custody-1',
  projectId: PROJECT_ID,
  resourceName: 'أمين العهدة',
  amount: 5000,
  spent: 0,
  remaining: 5000,
  status: 'active',
  createdAt: '2026-02-01T00:00:00Z',
};

const approved = paymentRequest({ id: 'approved', status: 'approved', description: 'طلب معتمد', amount: 600 });

function seedStore(over: Partial<AppState> = {}) {
  const noop = vi.fn().mockResolvedValue(undefined);
  useStore.setState({
    resources: [resource],
    reimbursements: resourceReimbursements,
    paymentRequests,
    resourceSettlements: [],
    projectFunds: [], custodies: [], expenses: [], budgetItems: [], cashTransfers: [],
    settlementEvents: [],
    loadSettlementEventsForRequest: noop, settleAdvanceWithSplit: noop, settleAdvance: noop,
    reverseSettlementEvent: noop,
    createReimbursement: noop, approveReimbursement: noop,
    rejectReimbursement: actions.rejectReimbursement,
    deleteReimbursement: noop, createPaymentRequest: noop, submitPaymentRequest: noop,
    reviewPaymentRequest: noop, approvePaymentRequest: noop,
    rejectPaymentRequest: actions.rejectPaymentRequest,
    schedulePaymentRequest: noop,
    payPaymentRequest: actions.payPaymentRequest,
    cancelPaymentRequest: noop, deletePaymentRequest: noop,
    updatePaymentRequest: actions.updatePaymentRequest,
    createResourceSettlement: actions.createResourceSettlement,
    signResourceSettlement: noop,
    ...over,
  } satisfies Partial<AppState>);
}

function renderSection() {
  render(<ResourcePayablesSection projectId={PROJECT_ID} projectName="مشروع" companyName="الشركة" />);
}

function openTab(name: RegExp) {
  const trigger = screen.getByRole('tab', { name });
  fireEvent.mouseDown(trigger);
  fireEvent.click(trigger);
}

function requestCard(description: string): HTMLElement {
  const card = screen.getByText(description).closest('div.p-4');
  if (!card) throw new Error(`"${description}" is not inside a request card`);
  return card as HTMLElement;
}

/** Click a named action on a request card and return the dialog it opens. */
function openFromCard(description: string, action: string): HTMLElement {
  openTab(/طلبات الصرف/);
  fireEvent.click(within(requestCard(description)).getByRole('button', { name: action }));
  return screen.getByRole('dialog');
}

/** Radix radios are buttons; pick one by the label text next to it. */
function chooseSource(dialog: HTMLElement, label: RegExp) {
  const radio = within(dialog).getByText(label).closest('div.flex')?.querySelector('button[role="radio"]');
  if (!radio) throw new Error(`no radio for ${label}`);
  fireEvent.click(radio);
}

beforeEach(() => {
  roleState.role = 'admin';
  Object.values(actions).forEach((fn) => fn.mockClear());
  vi.mocked(toast.error).mockClear();
  seedStore();
});

describe('the pay dialog', () => {
  it('pays out of a custody when that is the only source, and names no fund', async () => {
    seedStore({ paymentRequests: [approved], custodies: [custody] });
    renderSection();
    const dialog = openFromCard('طلب معتمد', 'تأكيد الدفع');

    // With no fund in balance the dialog lands on the custody by itself.
    fireEvent.click(within(dialog).getByRole('button', { name: 'تأكيد الدفع' }));

    await waitFor(() => expect(actions.payPaymentRequest).toHaveBeenCalledTimes(1));
    expect(actions.payPaymentRequest).toHaveBeenCalledWith('approved', expect.objectContaining({
      paidFromCustodyId: 'custody-1',
      paidFromFundId: null,
    }));
  });

  it('will not pay from a custody until one is actually chosen', () => {
    seedStore({ paymentRequests: [approved], projectFunds: [fund({})], custodies: [custody] });
    renderSection();
    const dialog = openFromCard('طلب معتمد', 'تأكيد الدفع');

    // The fund was pre-picked. Switching the radio to "custody" opens the
    // custody picker but selects nothing, and confirm must wait for a pick
    // rather than fall back to the fund id still sitting in state.
    expect(within(dialog).getByRole('button', { name: 'تأكيد الدفع' })).toBeEnabled();
    chooseSource(dialog, /من عهدة قائمة/);

    expect(within(dialog).getByText('اختر العهدة')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'تأكيد الدفع' })).toBeDisabled();
    expect(actions.payPaymentRequest).not.toHaveBeenCalled();
  });

  it('refuses a fund that cannot cover the amount', async () => {
    // 100 in the fund against a 600 request: the fund is listed (it has a
    // balance) but the payment must not go through.
    seedStore({ paymentRequests: [approved], projectFunds: [fund({ amount: 100 })] });
    renderSection();
    const dialog = openFromCard('طلب معتمد', 'تأكيد الدفع');

    fireEvent.click(within(dialog).getByRole('button', { name: 'تأكيد الدفع' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/رصيد الدفعة غير كافٍ/)));
    expect(actions.payPaymentRequest).not.toHaveBeenCalled();
  });

  it('carries a scheduled request\'s date into the dialog', async () => {
    seedStore({
      paymentRequests: [paymentRequest({ id: 'sched', status: 'scheduled', scheduledDate: '2026-04-15', description: 'طلب مجدول', amount: 600 })],
      projectFunds: [fund({})],
    });
    renderSection();
    const dialog = openFromCard('طلب مجدول', 'تأكيد الدفع');

    expect((dialog.querySelector('input[type="date"]') as HTMLInputElement).value).toBe('2026-04-15');
    fireEvent.click(within(dialog).getByRole('button', { name: 'تأكيد الدفع' }));

    await waitFor(() => expect(actions.payPaymentRequest).toHaveBeenCalledWith('sched', expect.objectContaining({ paidDate: '2026-04-15' })));
  });
});

describe('the edit-links dialog', () => {
  it('recomputes an unpaid reimbursement request\'s amount from the rows now linked', async () => {
    renderSection();
    const dialog = openFromCard('طلب مُرسل', 'تعديل الربط');

    // The submitted request links nothing yet; tick the 1,500 approved row.
    fireEvent.click(within(dialog).getByLabelText(/سفر معتمد/));
    expect(within(dialog).getByText(/المجموع الجديد/)).toHaveTextContent('1,500.00 ر.س');
    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ' }));

    await waitFor(() => expect(actions.updatePaymentRequest).toHaveBeenCalledTimes(1));
    expect(actions.updatePaymentRequest).toHaveBeenCalledWith('req-submitted', expect.objectContaining({
      linkedReimbursementIds: ['res-approved'],
      amount: 1500,
    }));
  });

  it('leaves a paid request\'s amount alone, whatever is re-linked', async () => {
    renderSection();
    const dialog = openFromCard('طلب مدفوع', 'تعديل الربط');

    expect(within(dialog).getByText(/المبلغ ثابت لأن الطلب مدفوع/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByLabelText(/سفر معتمد/));
    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ' }));

    await waitFor(() => expect(actions.updatePaymentRequest).toHaveBeenCalledTimes(1));
    const [, updates] = actions.updatePaymentRequest.mock.calls[0];
    expect(updates.linkedReimbursementIds).toEqual(['res-approved']);
    expect(updates).not.toHaveProperty('amount');
  });

  it('will not let a row already linked to another request be taken', () => {
    seedStore({
      reimbursements: [
        ...resourceReimbursements,
        { ...resourceReimbursements[0], id: 'taken', description: 'سفر مربوط', paymentRequestId: 'some-other-request' },
      ],
    });
    renderSection();
    const dialog = openFromCard('طلب مُرسل', 'تعديل الربط');

    expect(within(dialog).getByLabelText(/سفر مربوط/)).toBeDisabled();
    expect(within(dialog).getByText('· مربوط بطلب آخر')).toBeInTheDocument();
  });
});

describe('the reject dialog', () => {
  it('insists on a reason', async () => {
    renderSection();
    const dialog = openFromCard('طلب مُرسل', 'رفض');

    fireEvent.click(within(dialog).getByRole('button', { name: 'رفض' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('سبب الرفض مطلوب'));
    expect(actions.rejectPaymentRequest).not.toHaveBeenCalled();
  });

  it('rejects the payment request it was opened from', async () => {
    renderSection();
    const dialog = openFromCard('طلب مُرسل', 'رفض');

    fireEvent.change(within(dialog).getByPlaceholderText(/اكتب سبباً/), { target: { value: 'بلا مستندات' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'رفض' }));

    await waitFor(() => expect(actions.rejectPaymentRequest).toHaveBeenCalledWith('req-submitted', 'بلا مستندات'));
    expect(actions.rejectReimbursement).not.toHaveBeenCalled();
  });

  it('routes a reimbursement rejection to the reimbursement ledger', async () => {
    renderSection();
    // Second button on the pending row is reject (approve, reject, delete).
    const row = screen.getByText('قرطاسية قيد المراجعة').closest('tr') as HTMLElement;
    fireEvent.click(within(row).getAllByRole('button')[1]);
    const dialog = screen.getByRole('dialog');

    fireEvent.change(within(dialog).getByPlaceholderText(/اكتب سبباً/), { target: { value: 'مكرر' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'رفض' }));

    await waitFor(() => expect(actions.rejectReimbursement).toHaveBeenCalledWith('res-pending', 'مكرر'));
    expect(actions.rejectPaymentRequest).not.toHaveBeenCalled();
  });
});

describe('the final-settlement dialog', () => {
  function openSettlement(): HTMLElement {
    const balances = screen.getByText('أرصدة الموارد').closest('div.p-4') as HTMLElement;
    fireEvent.click(within(balances).getByRole('button', { name: 'مخالصة' }));
    return screen.getByRole('dialog');
  }

  it('totals what is owed, what was paid, and the balance between them', () => {
    renderSection();
    const dialog = openSettlement();

    // Owed: 1,500 approved + 400 reimbursed. Paid: the one paid request, 700.
    const figure = (label: string) =>
      within(dialog).getByText(label, { selector: 'div.text-muted-foreground' }).nextElementSibling?.textContent;
    expect(figure('المستحق')).toBe('1,900.00 ر.س');
    expect(figure('المدفوع')).toBe('700.00 ر.س');
    expect(figure('الرصيد')).toBe('1,200.00 ر.س');
  });

  it('drafts the settlement with the rows and payments it totalled', async () => {
    renderSection();
    const dialog = openSettlement();

    fireEvent.click(within(dialog).getByRole('button', { name: 'إنشاء كمسودة' }));

    await waitFor(() => expect(actions.createResourceSettlement).toHaveBeenCalledTimes(1));
    expect(actions.createResourceSettlement).toHaveBeenCalledWith(expect.objectContaining({
      resourceId: RESOURCE_ID,
      projectId: PROJECT_ID,
      linkedReimbursementIds: ['res-approved', 'res-paid'],
      linkedPaymentIds: ['req-paid'],
      totalOwed: 1900,
      totalPaid: 700,
    }));
    // The declaration text names the resource, the company and the balance.
    const [input] = actions.createResourceSettlement.mock.calls[0];
    expect(input.settlementTextAr).toContain(resource.name);
    expect(input.settlementTextAr).toContain('الشركة');
    expect(input.settlementTextAr).toContain('1,200');
  });
});
