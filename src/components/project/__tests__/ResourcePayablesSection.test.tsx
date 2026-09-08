/**
 * Component tests for the payables section.
 *
 * These exist to make splitting this 2000-line file safe. A split moves markup
 * and state between modules, and the two ways that goes wrong silently are: a
 * figure on screen starts counting the wrong rows, or a control that should be
 * hidden from a read-only user is rendered anyway. Both are money bugs and
 * neither is visible in a diff.
 *
 * So these tests drive the real store and the real derivation chain
 * (usePayablesScope -> lib/resource-payables) and assert on rendered text.
 * Mocking the derivation would only test the mock.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useStore } from '@/store/useStore';
import { ResourcePayablesSection } from '../ResourcePayablesSection';
import {
  PROJECT_ID,
  foreignReimbursement,
  paymentRequests,
  resource,
  resourceReimbursements,
  settlements,
  vendorReimbursements,
} from './payables-fixtures';

const roleState = { admin: true, editor: true };

vi.mock('@/hooks/useRole', () => ({
  useRole: () => ({
    roles: [],
    isOwner: false,
    isAdmin: roleState.admin,
    isScopedAdmin: roleState.admin,
    isAdminFor: () => roleState.admin,
    canEdit: () => roleState.editor,
    hasAccess: () => true,
    loading: false,
  }),
}));

// Exports pull in jsPDF and the workbook writer; neither is what these tests
// are about, and both are covered elsewhere.
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

/**
 * Seed real state, and replace only the async actions — the component must not
 * reach the network, but everything it derives from state stays genuine.
 */
function seedStore(over: Partial<Parameters<typeof useStore.setState>[0]> = {}) {
  const noop = vi.fn().mockResolvedValue(undefined);
  useStore.setState({
    resources: [resource],
    reimbursements: [...resourceReimbursements, ...vendorReimbursements, foreignReimbursement],
    paymentRequests,
    resourceSettlements: settlements,
    projectFunds: [],
    custodies: [],
    expenses: [],
    budgetItems: [],
    settlementEvents: {},
    loadSettlementEventsForRequest: noop,
    settleAdvanceWithSplit: noop,
    createReimbursement: noop,
    approveReimbursement: noop,
    rejectReimbursement: noop,
    deleteReimbursement: noop,
    createPaymentRequest: noop,
    submitPaymentRequest: noop,
    reviewPaymentRequest: noop,
    approvePaymentRequest: noop,
    rejectPaymentRequest: noop,
    schedulePaymentRequest: noop,
    payPaymentRequest: noop,
    cancelPaymentRequest: noop,
    deletePaymentRequest: noop,
    settleAdvance: noop,
    reverseSettlementEvent: noop,
    updatePaymentRequest: noop,
    createResourceSettlement: noop,
    signResourceSettlement: noop,
    ...over,
  } as Parameters<typeof useStore.setState>[0]);
}

/**
 * The figure inside a summary card, found by the card's own label.
 *
 * Some labels ("طلبات معلقة") appear twice — once on a card and once as a
 * table column header — so the match is narrowed to the one sitting inside a
 * card rather than assuming the label is unique.
 */
function cardValue(label: string): string {
  const heading = screen
    .getAllByText(label)
    .find((el) => el.tagName !== 'TH' && el.closest('div.p-4'));
  if (!heading) throw new Error(`no summary card found for "${label}"`);
  const card = heading.closest('div.p-4') as HTMLElement;
  return within(card).getByText(/[\d,]+\.\d{2}|^\d+$/).textContent ?? '';
}

function renderSection(readOnly = false) {
  return render(
    <ResourcePayablesSection projectId={PROJECT_ID} projectName="مشروع" readOnly={readOnly} />,
  );
}

beforeEach(() => {
  roleState.admin = true;
  roleState.editor = true;
  seedStore();
});

describe('the two ledgers stay separate', () => {
  it('shows only team rows in the team ledger', () => {
    renderSection();

    // 1500 approved + 400 reimbursed = 1900. If a vendor row leaked in, this
    // would read 10,900 — and if the other project's row leaked, 9,677.
    expect(cardValue('إجمالي المعتمد')).toBe('1,900.00 ر.س');
    expect(cardValue('إجمالي المدفوع')).toBe('400.00 ر.س');
    expect(cardValue('المستحق غير المدفوع')).toBe('1,500.00 ر.س');
  });

  it('shows only vendor rows after switching scope', () => {
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: /مستحقات الموردين/ }));

    expect(cardValue('إجمالي المعتمد')).toBe('12,000.00 ر.س');
    expect(cardValue('إجمالي المدفوع')).toBe('3,000.00 ر.س');
    expect(cardValue('المستحق غير المدفوع')).toBe('9,000.00 ر.س');
  });

  it('counts each ledger separately in the scope toggle', () => {
    renderSection();

    // Three team rows and two vendor rows — the foreign project's row is in
    // neither, which is the assertion that catches a dropped project filter.
    expect(screen.getByRole('button', { name: /مستحقات الفريق \(3\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /مستحقات الموردين \(2\)/ })).toBeInTheDocument();
  });

  it('treats a row with no sourceKind as a team row, not a vendor row', () => {
    const untagged = { ...resourceReimbursements[0], id: 'untagged', amount: 100 };
    delete (untagged as { sourceKind?: unknown }).sourceKind;
    seedStore({ reimbursements: [untagged] } as never);

    renderSection();

    // The default is 'resource'. Were it read as a vendor row, the team ledger
    // would show zero and the vendor count would be 1.
    expect(cardValue('إجمالي المعتمد')).toBe('100.00 ر.س');
    expect(screen.getByRole('button', { name: /مستحقات الفريق \(1\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /مستحقات الموردين \(0\)/ })).toBeInTheDocument();
  });
});

describe('summary arithmetic', () => {
  it('counts requests awaiting action, and not the settled ones', () => {
    renderSection();

    // submitted + approved count; paid and draft do not.
    expect(cardValue('طلبات معلقة')).toBe('2');
  });
});

describe('permission gating', () => {
  it('offers the create action to an editor', () => {
    renderSection();
    expect(screen.getByRole('button', { name: /تسجيل استرداد/ })).toBeInTheDocument();
  });

  it('withholds it from a read-only viewer', () => {
    renderSection(true);
    expect(screen.queryByRole('button', { name: /تسجيل استرداد/ })).not.toBeInTheDocument();
  });

  it('withholds it from someone without edit rights on this project', () => {
    roleState.admin = false;
    roleState.editor = false;
    renderSection();
    expect(screen.queryByRole('button', { name: /تسجيل استرداد/ })).not.toBeInTheDocument();
  });
});
