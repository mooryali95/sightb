/**
 * The third layer: the balances table, the settlements tab, and the
 * outstanding-advances figure.
 *
 * Layers one and two guard the summary head and the reimbursement rows. These
 * three areas were still open, and each carries arithmetic that is wrong
 * quietly rather than loudly — a per-resource balance that counts a supplier's
 * invoice, or an advance that reports its full value after half of it came
 * back.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useStore, type AppState } from '@/store/useStore';
import { ResourcePayablesSection } from '../ResourcePayablesSection';
import {
  PROJECT_ID,
  foreignReimbursement,
  partlyRefundedAdvance,
  paymentRequests,
  resource,
  resourceReimbursements,
  signedSettlement,
  vendorReimbursements,
  vendorRowWithStrayResourceId,
} from './payables-fixtures';

type Role = 'admin' | 'editor' | 'viewer';
const roleState: { role: Role } = { role: 'admin' };

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

function seedStore(over: Partial<AppState> = {}) {
  const noop = vi.fn().mockResolvedValue(undefined);
  useStore.setState({
    resources: [resource],
    reimbursements: [...resourceReimbursements, ...vendorReimbursements, foreignReimbursement],
    paymentRequests,
    resourceSettlements: [],
    projectFunds: [], custodies: [], expenses: [], budgetItems: [],
    settlementEvents: [],
    loadSettlementEventsForRequest: noop, settleAdvanceWithSplit: noop,
    createReimbursement: noop, approveReimbursement: noop, rejectReimbursement: noop,
    deleteReimbursement: noop, createPaymentRequest: noop, submitPaymentRequest: noop,
    reviewPaymentRequest: noop, approvePaymentRequest: noop, rejectPaymentRequest: noop,
    schedulePaymentRequest: noop, payPaymentRequest: noop, cancelPaymentRequest: noop,
    deletePaymentRequest: noop, settleAdvance: noop, reverseSettlementEvent: noop,
    updatePaymentRequest: noop, createResourceSettlement: noop, signResourceSettlement: noop,
    ...over,
  } satisfies Partial<AppState>);
}

function renderSection() {
  render(<ResourcePayablesSection projectId={PROJECT_ID} projectName="مشروع" />);
}

/**
 * The balances-table row for a named resource.
 *
 * Scoped to the balances card rather than the whole page: the same resource
 * name also labels its reimbursement rows in the tab below, so a page-wide
 * lookup matches several elements and would otherwise be "fixed" by loosening
 * the assertion until it stopped meaning anything.
 */
function balanceRow(name: string): HTMLElement {
  const card = screen.getByText('أرصدة الموارد').closest('div.p-4') as HTMLElement;
  if (!card) throw new Error('the resource balances card is not on the page');
  const row = within(card).getByText(name).closest('tr');
  if (!row) throw new Error(`"${name}" is not inside a row of the balances table`);
  return row;
}

function openTab(name: RegExp) {
  const trigger = screen.getByRole('tab', { name });
  fireEvent.mouseDown(trigger);
  fireEvent.click(trigger);
}

beforeEach(() => {
  roleState.role = 'admin';
  seedStore();
});

describe('the resource balances table', () => {
  it('reports the resource\'s own approved, paid and outstanding figures', () => {
    renderSection();

    // 1500 approved + 400 reimbursed = 1900 approved, 400 paid, 1500 still owed.
    // The 12,000 of vendor invoices belongs to no resource and must not appear.
    const row = balanceRow(resource.name);
    expect(within(row).getByText('1,900.00 ر.س')).toBeInTheDocument();
    expect(within(row).getByText('400.00 ر.س')).toBeInTheDocument();
    expect(within(row).getByText('1,500.00 ر.س')).toBeInTheDocument();
    expect(within(row).queryByText(/12,000\.00|9,000\.00/)).not.toBeInTheDocument();
  });

  it('ignores a vendor invoice even when it still points at the resource', () => {
    seedStore({
      reimbursements: [...resourceReimbursements, vendorRowWithStrayResourceId],
    });
    renderSection();

    // The 7,000 supplier invoice carries this resource's id, so matching on
    // resourceId alone would fold it into a person's balance: 8,900 approved
    // instead of 1,900.
    //
    // Two filters stop that independently — usePayablesScope screens the list
    // before the table sees it, and getResourceBalance screens again inside.
    // So this test cannot single out either one: removing just one leaves the
    // other doing the work, and only removing both turns it red. That is what
    // it claims to be — an end-to-end assertion on the figure, not a guard on
    // a particular line.
    const row = balanceRow(resource.name);
    expect(within(row).getByText('1,900.00 ر.س')).toBeInTheDocument();
    expect(within(row).queryByText('8,900.00 ر.س')).not.toBeInTheDocument();
  });

  it('counts only that resource\'s requests still awaiting action', () => {
    renderSection();
    // submitted + approved count; paid and draft do not.
    expect(within(balanceRow(resource.name)).getByText('2')).toBeInTheDocument();
  });

  it('says so plainly when the project has no resources', () => {
    seedStore({ resources: [] });
    renderSection();
    expect(screen.getByText('لا يوجد موارد بشرية في هذا المشروع.')).toBeInTheDocument();
  });
});

describe('the settlements tab', () => {
  it('explains where a settlement comes from when there are none', () => {
    renderSection();
    openTab(/المخالصات/);
    expect(screen.getByText(/لا توجد مخالصات/)).toBeInTheDocument();
  });

  it('shows a settlement against its resource and status', () => {
    seedStore({ resourceSettlements: [signedSettlement] });
    renderSection();
    openTab(/المخالصات/);

    const card = screen.getByText('2026-01-01 → 2026-03-31').closest('div.p-4') as HTMLElement;
    expect(card).toBeTruthy();
    expect(within(card).getByText(resource.name)).toBeInTheDocument();
  });

  it('counts settlements on the tab', () => {
    seedStore({ resourceSettlements: [signedSettlement] });
    renderSection();
    expect(screen.getByRole('tab', { name: /المخالصات \(1\)/ })).toBeInTheDocument();
  });
});

describe('outstanding advances', () => {
  it('counts only what has not come back', () => {
    seedStore({ paymentRequests: [...paymentRequests, partlyRefundedAdvance] });
    renderSection();

    // 5,000 advanced, 2,000 refunded. The exposure is 3,000 — reporting the
    // full 5,000 would overstate a recoverable asset that does not enter CPI.
    const card = screen.getByText('سلف قائمة (غير مسوّاة)').closest('div.p-4') as HTMLElement;
    expect(within(card).getByText('3,000.00 ر.س')).toBeInTheDocument();
    expect(within(card).getByText('1 سلفة')).toBeInTheDocument();
  });

  it('shows nothing outstanding when every advance is settled', () => {
    renderSection();
    const card = screen.getByText('سلف قائمة (غير مسوّاة)').closest('div.p-4') as HTMLElement;
    expect(within(card).getByText('0.00 ر.س')).toBeInTheDocument();
    expect(within(card).getByText('0 سلفة')).toBeInTheDocument();
  });
});
