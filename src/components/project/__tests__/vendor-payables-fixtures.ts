/**
 * Fixtures for the vendor payables panel's component tests.
 *
 * Three vendor payables on the project: 9,000 still owed, 3,000 settled
 * through an expense, and 1,000 marked reimbursed with no expense link. A
 * resource reimbursement and a payable on another project must not show.
 *
 * Two open funds: fund 1 holds 12,000 with 1,000 spent and a 3,000 advance
 * still out, so 8,000 is really left (11,000 if the advance is ignored);
 * fund 2 holds 15,000 untouched. Both custodies and the transfer were
 * drawn from an older, settled fund 0, so they do not draw on either.
 * Custody 1 says it holds 10,000 on its row, but 2,000 came in by transfer
 * and a 4,000 advance is out, so 8,000 is really left; custody 2 holds
 * 12,000 untouched.
 *
 * The project started long ago and runs thirteen months, so its clamped
 * month (13) can never coincide with a calendar month.
 */
import type {
  CashTransfer, Custody, Expense, PaymentRequest, Project, ProjectFund, ResourceReimbursement,
} from '@/types/project';

export const PROJECT_ID = 'project-under-test';

export const project: Project = {
  id: PROJECT_ID, companyId: 'co-1', name: 'مشروع الاختبار', contractValue: 500000, currency: 'SAR',
  startDate: '2020-01-01', endDate: '2021-01-31', durationMonths: 13, resourceCount: 1,
  status: 'active', createdAt: '2020-01-01T00:00:00Z', percentComplete: 50,
  contractType: 'lump_sum', retentionPercent: 0, managementReserve: 0, taxPercent: 15, vatInclusive: false,
};

function payable(over: Partial<ResourceReimbursement>): ResourceReimbursement {
  return {
    id: 'vp', projectId: PROJECT_ID, sourceKind: 'vendor', vendorName: 'مؤسسة التوريد', category: 'equipment',
    description: 'بند', amount: 0, expenseDate: '2026-03-01', receiptAttachments: [], status: 'approved',
    createdAt: '2026-03-01T00:00:00Z', updatedAt: '2026-03-01T00:00:00Z', ...over,
  };
}

export const reimbursements: ResourceReimbursement[] = [
  payable({ id: 'vp-open', amount: 9000, description: 'توريد مواد' }),
  payable({ id: 'vp-settled', amount: 3000, description: 'توريد معدات', status: 'reimbursed', settledExpenseId: 'exp-settled' }),
  payable({ id: 'vp-paid-elsewhere', amount: 1000, description: 'نقل بضاعة', status: 'reimbursed' }),
  payable({ id: 'res-1', sourceKind: 'resource', vendorName: undefined, resourceId: 'r-1', amount: 700, description: 'سفر موظف' }),
  payable({ id: 'vp-foreign', projectId: 'another-project', amount: 5555, description: 'ذمة مشروع آخر' }),
];

function fund(over: Partial<ProjectFund>): ProjectFund {
  return {
    id: 'f', projectId: PROJECT_ID, fundNumber: 1, amount: 0, transferDate: '2026-02-01', status: 'acknowledged',
    acknowledgedAt: '2026-02-02T00:00:00Z', createdBy: 'user-1', createdAt: '2026-02-01T00:00:00Z', updatedAt: '2026-02-02T00:00:00Z',
    ...over,
  };
}

export const funds: ProjectFund[] = [
  fund({ id: 'fund-0', fundNumber: 0, amount: 30000, status: 'settled' }),
  fund({ id: 'fund-1', fundNumber: 1, amount: 12000 }),
  fund({ id: 'fund-2', fundNumber: 2, amount: 15000 }),
];

export const custodies: Custody[] = [
  {
    id: 'cust-1', projectId: PROJECT_ID, companyId: 'co-1', resourceName: 'عمر', amount: 10000, spent: 0, remaining: 10000,
    status: 'active', receivedDate: '2026-02-05', createdAt: '2026-02-05T00:00:00Z', sourceFundId: 'fund-0',
  },
  {
    id: 'cust-2', projectId: PROJECT_ID, companyId: 'co-1', resourceName: 'ليلى', amount: 12000, spent: 0, remaining: 12000,
    status: 'active', receivedDate: '2026-02-05', createdAt: '2026-02-05T00:00:00Z', sourceFundId: 'fund-0',
  },
];

export const expenses: Expense[] = [
  {
    id: 'exp-fund1', projectId: PROJECT_ID, category: 'other', description: 'مصروف من الدفعة 1', amount: 1000, date: '2026-03-05',
    month: 3, approvalStatus: 'approved', isVatExempt: false, fundId: 'fund-1',
  },
];

export const cashTransfers: CashTransfer[] = [
  { id: 'ct-1', projectId: PROJECT_ID, fromFundId: 'fund-0', toCustodyId: 'cust-1', amount: 2000, transferDate: '2026-03-01', createdAt: '2026-03-01T00:00:00Z' },
];

function advance(over: Partial<PaymentRequest>): PaymentRequest {
  return {
    id: 'adv', projectId: PROJECT_ID, resourceId: 'r-1', requestType: 'advance', amount: 0, currency: 'SAR',
    description: 'سلفة', linkedReimbursementIds: [], priority: 'normal', status: 'paid', requestedBy: 'user-1',
    paymentAttachments: [], isAdvanceOutstanding: true, refundedAmount: 0,
    createdAt: '2026-03-10T00:00:00Z', updatedAt: '2026-03-10T00:00:00Z', ...over,
  };
}

export const paymentRequests: PaymentRequest[] = [
  advance({ id: 'adv-fund1', amount: 3000, paidFromFundId: 'fund-1' }),
  advance({ id: 'adv-cust1', amount: 4000, paidFromCustodyId: 'cust-1' }),
];
