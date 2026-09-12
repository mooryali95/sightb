/**
 * Fixtures for the custody section's component tests.
 *
 * One acknowledged 50,000 fund. One custody drawn from it holding 5,000, with
 * a 1,000 expense against it and a 500 advance paid out of it still
 * outstanding. So the custody has 3,500 left, not 4,000: the advance is cash
 * that has left the custody even though no expense documents it yet.
 */
import type { Custody, Expense, PaymentRequest, ProjectFund } from '@/types/project';

export const PROJECT_ID = 'project-under-test';
export const COMPANY_ID = 'company-1';
export const FUND_ID = 'fund-1';
export const CUSTODY_ID = 'custody-1';

export function fund(over: Partial<ProjectFund> = {}): ProjectFund {
  return {
    id: FUND_ID,
    projectId: PROJECT_ID,
    fundNumber: 1,
    amount: 50000,
    transferDate: '2026-02-01',
    status: 'acknowledged',
    acknowledgedAt: '2026-02-02T00:00:00Z',
    createdBy: 'user-1',
    createdAt: '2026-02-01T00:00:00Z',
    updatedAt: '2026-02-02T00:00:00Z',
    ...over,
  };
}

export function custody(over: Partial<Custody> = {}): Custody {
  return {
    id: CUSTODY_ID,
    projectId: PROJECT_ID,
    companyId: COMPANY_ID,
    resourceName: 'عمر',
    amount: 5000,
    spent: 0,
    remaining: 5000,
    status: 'active',
    receivedDate: '2026-02-05',
    createdAt: '2026-02-05T00:00:00Z',
    sourceFundId: FUND_ID,
    ...over,
  };
}

export function expense(over: Partial<Expense> = {}): Expense {
  return {
    id: 'exp',
    projectId: PROJECT_ID,
    category: 'consulting',
    description: 'بند',
    amount: 0,
    date: '2026-02-10',
    month: 2,
    approvalStatus: 'approved',
    isVatExempt: false,
    custodyId: CUSTODY_ID,
    ...over,
  };
}

export const custodyExpenses: Expense[] = [
  expense({ id: 'exp-1', amount: 1000, description: 'قرطاسية من العهدة' }),
];

/** A 500 advance paid out of the custody and not yet settled. */
export const outstandingAdvance: PaymentRequest = {
  id: 'req-advance',
  projectId: PROJECT_ID,
  resourceId: 'res-1',
  requestType: 'advance',
  amount: 500,
  currency: 'SAR',
  description: 'سلفة من العهدة',
  linkedReimbursementIds: [],
  priority: 'normal',
  status: 'paid',
  requestedBy: 'user-1',
  paymentAttachments: [],
  paidFromCustodyId: CUSTODY_ID,
  isAdvanceOutstanding: true,
  refundedAmount: 0,
  createdAt: '2026-02-12T00:00:00Z',
  updatedAt: '2026-02-12T00:00:00Z',
};
