/**
 * The fourth layer: the payment-requests tab.
 *
 * This tab is not a display, it is a state machine — status and role together
 * decide which money actions appear. Schedule, confirm-payment, settle and
 * delete are all irreversible, so a refactor that flattens any row of that
 * matrix hands someone a button they should not have, and no other test in the
 * suite would notice.
 *
 * It is the largest and most stateful piece still in the parent, and these
 * tests exist so it can be moved out safely rather than hopefully.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useStore, type AppState } from '@/store/useStore';
import { ResourcePayablesSection } from '../ResourcePayablesSection';
import {
  PROJECT_ID,
  paidOrdinaryRequest,
  paidOutstandingAdvance,
  requestInStatus,
  resource,
  resourceReimbursements,
} from './payables-fixtures';
import type { PaymentRequest } from '@/types/project';

type Role = 'admin' | 'editor' | 'viewer';
const roleState: { role: Role } = { role: 'admin' };
const approve = vi.fn().mockResolvedValue(undefined);

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

function seedStore(requests: PaymentRequest[]) {
  const noop = vi.fn().mockResolvedValue(undefined);
  useStore.setState({
    resources: [resource],
    reimbursements: resourceReimbursements,
    paymentRequests: requests,
    resourceSettlements: [],
    projectFunds: [], custodies: [], expenses: [], budgetItems: [],
    settlementEvents: [],
    loadSettlementEventsForRequest: noop, settleAdvanceWithSplit: noop,
    createReimbursement: noop, approveReimbursement: noop, rejectReimbursement: noop,
    deleteReimbursement: noop, createPaymentRequest: noop, submitPaymentRequest: noop,
    reviewPaymentRequest: noop, approvePaymentRequest: approve, rejectPaymentRequest: noop,
    schedulePaymentRequest: noop, payPaymentRequest: noop, cancelPaymentRequest: noop,
    deletePaymentRequest: noop, settleAdvance: noop, reverseSettlementEvent: noop,
    updatePaymentRequest: noop, createResourceSettlement: noop, signResourceSettlement: noop,
  } satisfies Partial<AppState>);
}

function openRequestsTab() {
  render(<ResourcePayablesSection projectId={PROJECT_ID} projectName="مشروع" />);
  const trigger = screen.getByRole('tab', { name: /طلبات الصرف/ });
  fireEvent.mouseDown(trigger);
  fireEvent.click(trigger);
}

/** The card a request's description sits in. */
function requestCard(description: string): HTMLElement {
  const card = screen.getByText(description).closest('div.p-4');
  if (!card) throw new Error(`"${description}" is not inside a request card`);
  return card as HTMLElement;
}

/** Visible action labels on a request card, in DOM order. */
function actionsOn(description: string): string[] {
  return within(requestCard(description))
    .queryAllByRole('button')
    .map((b) => (b.textContent ?? '').trim())
    .filter(Boolean);
}

/**
 * ConfirmDeleteDialog's trigger is an icon with no accessible name, so it is
 * the only unlabelled control a request card can carry. Counting it directly
 * is the difference between asserting deletion is absent and merely asserting
 * this card has fewer buttons than another one.
 */
function deleteControlsOn(description: string): number {
  return within(requestCard(description))
    .queryAllByRole('button')
    .filter((b) => (b.textContent ?? '').trim() === '').length;
}

beforeEach(() => {
  roleState.role = 'admin';
  approve.mockClear();
});

describe('what an admin may do at each status', () => {
  it('offers review, approve and reject on a submitted request', () => {
    seedStore([requestInStatus('submitted')]);
    openRequestsTab();
    const actions = actionsOn('طلب submitted');
    expect(actions).toContain('بدء المراجعة');
    expect(actions).toContain('اعتماد');
    expect(actions).toContain('رفض');
    // Not yet payable: it has not been approved.
    expect(actions).not.toContain('تأكيد الدفع');
  });

  it('drops review once the request is already under review', () => {
    seedStore([requestInStatus('under_review')]);
    openRequestsTab();
    const actions = actionsOn('طلب under_review');
    expect(actions).toContain('اعتماد');
    expect(actions).toContain('رفض');
    expect(actions).not.toContain('بدء المراجعة');
  });

  it('offers scheduling and payment only after approval', () => {
    seedStore([requestInStatus('approved')]);
    openRequestsTab();
    const actions = actionsOn('طلب approved');
    expect(actions).toContain('جدولة');
    expect(actions).toContain('تأكيد الدفع');
    expect(actions).not.toContain('اعتماد');
  });

  it('offers payment but no second scheduling once scheduled', () => {
    seedStore([requestInStatus('scheduled')]);
    openRequestsTab();
    const actions = actionsOn('طلب scheduled');
    expect(actions).toContain('تأكيد الدفع');
    expect(actions).not.toContain('جدولة');
  });

  it('wires approve to the request it sits on', () => {
    seedStore([requestInStatus('submitted')]);
    openRequestsTab();

    const button = within(requestCard('طلب submitted'))
      .getAllByRole('button')
      .find((b) => b.textContent?.trim() === 'اعتماد');
    fireEvent.click(button!);

    expect(approve).toHaveBeenCalledWith('req-submitted');
  });
});

describe('settlement belongs to advances alone', () => {
  it('offers it on a paid advance still owed back', () => {
    seedStore([paidOutstandingAdvance]);
    openRequestsTab();
    expect(actionsOn('سلفة قائمة')).toContain('تسوية السلفة');
  });

  it('withholds it from an ordinary paid request', () => {
    seedStore([paidOrdinaryRequest]);
    openRequestsTab();
    // Money already out the door on a reimbursement is not an advance to
    // settle; offering the action would invite a second, unbacked movement.
    expect(actionsOn('صرف عادي مدفوع')).not.toContain('تسوية السلفة');
  });
});

describe('approval is the admin\'s alone', () => {
  it('withholds approve and reject from an editor', () => {
    roleState.role = 'editor';
    seedStore([requestInStatus('submitted')]);
    openRequestsTab();
    const actions = actionsOn('طلب submitted');
    expect(actions).not.toContain('اعتماد');
    expect(actions).not.toContain('رفض');
    // An editor may still withdraw their own request.
    expect(actions).toContain('إلغاء');
  });

  it('leaves a viewer no action at all on an approved request', () => {
    roleState.role = 'viewer';
    seedStore([requestInStatus('approved')]);
    openRequestsTab();
    expect(actionsOn('طلب approved')).toHaveLength(0);
  });

  it('offers deletion only before money moved', () => {
    seedStore([requestInStatus('draft'), requestInStatus('paid')]);
    openRequestsTab();

    // Deleting a request that has already been paid would erase the record of
    // money that actually left, so the control must be absent outright — not
    // merely rarer than on a draft. Comparing the two cards' button counts was
    // the first attempt and it passed even with deletion wired to paid, since
    // the draft card still carried more.
    expect(deleteControlsOn('طلب draft')).toBe(1);
    expect(deleteControlsOn('طلب paid')).toBe(0);
  });

  it('withholds deletion from an editor even on a draft', () => {
    roleState.role = 'editor';
    seedStore([requestInStatus('draft')]);
    openRequestsTab();
    expect(deleteControlsOn('طلب draft')).toBe(0);
  });
});
