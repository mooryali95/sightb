/**
 * Settling an advance writes an expense (for the kinds where cash leaves and
 * does not come back). What that expense says is what the ledger and every
 * monthly figure will read, so its month must be the project's month, the
 * one the finance library buckets by, not the calendar month of the day the
 * settlement was recorded.
 *
 * Two tests were red when written: both the plain settlement and the split
 * settlement booked the calendar month. The fix commit that follows turns
 * them green without editing a test.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore, type AppState } from '@/store/useStore';
import * as svc from '@/services/resourcePayableService';
import * as paymentRequestService from '@/services/paymentRequestService';
import * as advanceSettlementService from '@/services/advanceSettlementService';
import type { PaymentRequest, Project } from '@/types/project';

vi.mock('@/store/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/store/helpers')>()),
  getUserId: vi.fn().mockResolvedValue('user-1'),
}));
vi.mock('@/services/resourcePayableService', () => ({
  createSettlementExpenseRaw: vi.fn().mockResolvedValue({ id: 'exp-new' }),
  createSettlementEventRaw: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/services/paymentRequestService', () => ({
  getPaymentRequestRaw: vi.fn().mockResolvedValue(null),
  getExpenseRaw: vi.fn().mockResolvedValue(null),
  listSettlementEventsRaw: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/services/advanceSettlementService', () => ({
  splitSettle: vi.fn().mockResolvedValue({ overflowExpenseId: 'exp-overflow', settlementEventId: 'ev-1' }),
}));

const PROJECT_ID = 'p-1';

/** Started long ago and runs thirteen months, so its clamped month can never coincide with a calendar month. */
const project: Project = {
  id: PROJECT_ID, companyId: 'co-1', name: 'مشروع', contractValue: 100000, currency: 'SAR',
  startDate: '2020-01-01', endDate: '2021-01-31', durationMonths: 13, resourceCount: 1,
  status: 'active', createdAt: '', percentComplete: 50, contractType: 'lump_sum',
  retentionPercent: 0, managementReserve: 0, taxPercent: 15, vatInclusive: false,
};

const advance: PaymentRequest = {
  id: 'adv-1', projectId: PROJECT_ID, resourceId: 'r-1', requestType: 'advance', amount: 1000, currency: 'SAR',
  description: 'سلفة سفر', linkedReimbursementIds: [], priority: 'normal', status: 'paid', requestedBy: 'user-1',
  paymentAttachments: [], paidFromFundId: 'fund-1', isAdvanceOutstanding: true, refundedAmount: 0,
  createdAt: '2020-02-01T00:00:00Z', updatedAt: '2020-02-01T00:00:00Z',
};

beforeEach(() => {
  vi.mocked(svc.createSettlementExpenseRaw).mockClear();
  vi.mocked(advanceSettlementService.splitSettle).mockClear();
  useStore.setState({
    projects: [project], paymentRequests: [advance], expenses: [], settlementEvents: [],
  } as unknown as Partial<AppState>);
});

describe('settling an advance', () => {
  it('books the settlement expense in the project\'s month, on the advance\'s fund', async () => {
    await useStore.getState().settleAdvance('adv-1', { type: 'documented', expenseCategory: 'travel' });

    expect(svc.createSettlementExpenseRaw).toHaveBeenCalledWith(expect.objectContaining({
      project_id: PROJECT_ID, amount: 1000, category: 'travel', month: 13, fund_id: 'fund-1', custody_id: null,
      approval_status: 'approved', source_payment_request_id: 'adv-1',
    }));
  });

  it('labels an advance the person keeps as an incentive or dues, as salary, so it reads as an advance that became pay', async () => {
    await useStore.getState().settleAdvance('adv-1', { type: 'payroll_deduction' });

    expect(svc.createSettlementExpenseRaw).toHaveBeenCalledWith(expect.objectContaining({
      category: 'salary', amount: 1000, description: 'سلفة تحوّلت إلى حافز أو مستحق: سلفة سفر',
      source_payment_request_id: 'adv-1',
    }));
  });

  it('hands the project\'s month to the split settlement too', async () => {
    await useStore.getState().settleAdvanceWithSplit('adv-1', {
      invoiceAmount: 1500, overflowSource: { fundId: 'fund-1' }, expenseCategory: 'travel',
    });

    expect(advanceSettlementService.splitSettle).toHaveBeenCalledWith(expect.objectContaining({
      paymentRequestId: 'adv-1', settleAmount: 1000, overflowAmount: 500, month: 13,
    }));
  });

  it('refuses to settle an advance that is not outstanding', async () => {
    useStore.setState({ paymentRequests: [{ ...advance, isAdvanceOutstanding: false }] } as Partial<AppState>);
    await expect(useStore.getState().settleAdvance('adv-1', { type: 'documented' })).rejects.toThrow('السلفة مسوّاة بالفعل');
    expect(svc.createSettlementExpenseRaw).not.toHaveBeenCalled();
  });
});
