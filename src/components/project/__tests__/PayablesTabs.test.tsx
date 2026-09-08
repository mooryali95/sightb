/**
 * The second layer of component tests: the tab contents.
 *
 * The first layer guards the section's head — summary figures, the scope
 * toggle, one permission gate. It says nothing about the rows underneath, so a
 * split that moved the tabs would sail straight past it. These tests close
 * that gap before the tabs are touched.
 *
 * Two classes of regression are in scope here, and both cost money silently:
 * a row list that stops following the active ledger, and a row action that
 * appears for someone who should not have it.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useStore, type AppState } from '@/store/useStore';
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

/**
 * One role, not two independent flags.
 *
 * The real useRole derives isAdminFor('project', id) from canEdit for project
 * scope, so an admin is never read-only and a read-only user is never an
 * admin. A mock with separate booleans can express that impossible pair, and
 * a test written against it asserts behaviour the app can never reach — which
 * is what the first draft of the read-only case did.
 */
type Role = 'admin' | 'editor' | 'viewer';
const roleState: { role: Role } = { role: 'admin' };
const actions = {
  approveReimbursement: vi.fn().mockResolvedValue(undefined),
  deleteReimbursement: vi.fn().mockResolvedValue(undefined),
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

function seedStore() {
  const noop = vi.fn().mockResolvedValue(undefined);
  useStore.setState({
    resources: [resource],
    reimbursements: [...resourceReimbursements, ...vendorReimbursements, foreignReimbursement],
    paymentRequests,
    resourceSettlements: settlements,
    projectFunds: [], custodies: [], expenses: [], budgetItems: [],
    settlementEvents: [],
    loadSettlementEventsForRequest: noop, settleAdvanceWithSplit: noop,
    createReimbursement: noop,
    approveReimbursement: actions.approveReimbursement,
    rejectReimbursement: noop,
    deleteReimbursement: actions.deleteReimbursement,
    createPaymentRequest: noop, submitPaymentRequest: noop, reviewPaymentRequest: noop,
    approvePaymentRequest: noop, rejectPaymentRequest: noop, schedulePaymentRequest: noop,
    payPaymentRequest: noop, cancelPaymentRequest: noop, deletePaymentRequest: noop,
    settleAdvance: noop, reverseSettlementEvent: noop, updatePaymentRequest: noop,
    createResourceSettlement: noop, signResourceSettlement: noop,
  } satisfies Partial<AppState>);
}

function renderSection(readOnly = false) {
  render(<ResourcePayablesSection projectId={PROJECT_ID} projectName="مشروع" readOnly={readOnly} />);
}

/** The table row a reimbursement's description sits in. */
function rowFor(description: string): HTMLElement {
  const cell = screen.getByText(description);
  const row = cell.closest('tr');
  if (!row) throw new Error(`"${description}" is not inside a table row`);
  return row;
}

function switchToVendors() {
  fireEvent.click(screen.getByRole('button', { name: /مستحقات الموردين/ }));
}

/**
 * Radix activates a tab on mouseDown (or focus), not on a synthesised click,
 * so a bare fireEvent.click leaves the panel unchanged and the assertions
 * would silently run against the first tab.
 */
function openTab(name: RegExp) {
  const trigger = screen.getByRole('tab', { name });
  fireEvent.mouseDown(trigger);
  fireEvent.click(trigger);
}

beforeEach(() => {
  roleState.role = 'admin';
  actions.approveReimbursement.mockClear();
  actions.deleteReimbursement.mockClear();
  seedStore();
});

describe('the reimbursements tab follows the active ledger', () => {
  it('lists team rows and withholds vendor rows', () => {
    renderSection();

    expect(screen.getByText('سفر معتمد')).toBeInTheDocument();
    expect(screen.getByText('قرطاسية قيد المراجعة')).toBeInTheDocument();
    expect(screen.queryByText('توريد مواد')).not.toBeInTheDocument();
  });

  it('swaps the rows when the ledger changes', () => {
    renderSection();
    switchToVendors();

    expect(screen.getByText('توريد مواد')).toBeInTheDocument();
    expect(screen.queryByText('سفر معتمد')).not.toBeInTheDocument();
  });

  it('names the vendor on a vendor row, not a team member', () => {
    renderSection();
    switchToVendors();

    // The row carries the supplier's name. Falling back to the resource name
    // here would attribute a supplier's invoice to an employee.
    const row = rowFor('توريد مواد');
    expect(within(row).getByText('مؤسسة التوريد')).toBeInTheDocument();
    expect(within(row).queryByText(resource.name)).not.toBeInTheDocument();
  });

  it('keeps another project\'s rows off the screen entirely', () => {
    renderSection();
    expect(screen.queryByText('بند')).not.toBeInTheDocument();
    switchToVendors();
    expect(screen.queryByText('بند')).not.toBeInTheDocument();
  });
});

describe('row actions are gated by role and by status', () => {
  it('offers an admin approve, reject and delete on a row awaiting review', () => {
    renderSection();
    expect(within(rowFor('قرطاسية قيد المراجعة')).getAllByRole('button')).toHaveLength(3);
  });

  it('wires the approve control to the row it sits in', () => {
    renderSection();

    const [approve] = within(rowFor('قرطاسية قيد المراجعة')).getAllByRole('button');
    fireEvent.click(approve);

    expect(actions.approveReimbursement).toHaveBeenCalledWith('res-pending');
  });

  it('withholds approve and reject from a non-admin, leaving only delete', () => {
    roleState.role = 'editor';
    renderSection();
    expect(within(rowFor('قرطاسية قيد المراجعة')).getAllByRole('button')).toHaveLength(1);
  });

  it('offers nothing on an already-approved row', () => {
    renderSection();
    // Deleting an approved payable is a money event, not a correction — the
    // row must expose no action at all once it has cleared review.
    expect(within(rowFor('سفر معتمد')).queryAllByRole('button')).toHaveLength(0);
  });

  it('offers nothing at all to a read-only viewer', () => {
    // Read-only and admin cannot co-occur: isReadOnly is !canEdit, and
    // isAdminFor falls through to canEdit for project scope. So a read-only
    // user is a viewer, and the fixture says so rather than pairing the
    // readOnly prop with an admin role the app would never produce.
    roleState.role = 'viewer';
    renderSection(true);
    expect(within(rowFor('قرطاسية قيد المراجعة')).queryAllByRole('button')).toHaveLength(0);
  });
});

describe('the payment requests tab', () => {
  it('lists this project\'s requests with their amounts', () => {
    renderSection();
    openTab(/طلبات الصرف/);

    // The amount is asserted inside the request's own card: the same figure
    // also appears in the balances table above, and a page-wide match would
    // pass even if the card showed nothing.
    const card = screen.getByText('طلب مُرسل').closest('div.p-4') as HTMLElement;
    expect(card).toBeTruthy();
    expect(within(card).getByText(/500\.00 ر\.س/)).toBeInTheDocument();
    expect(screen.getByText('طلب مدفوع')).toBeInTheDocument();
  });

  it('counts every request on the tab, whatever its status', () => {
    renderSection();
    // Four requests exist; the pending-count card shows two. The tab counts
    // them all, and conflating the two numbers is the mistake this catches.
    expect(screen.getByRole('tab', { name: /طلبات الصرف \(4\)/ })).toBeInTheDocument();
  });
});
