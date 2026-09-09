/**
 * Fixtures for the payables section's component tests.
 *
 * The numbers are chosen so that a resource total and a vendor total can never
 * be confused for one another: if the two ledgers ever bleed together, the
 * rendered figure lands on neither expected value rather than coincidentally
 * matching one of them.
 */
import type {
  PaymentRequest,
  Resource,
  ResourceReimbursement,
  ResourceSettlement,
} from '@/types/project';

export const PROJECT_ID = 'project-under-test';
export const OTHER_PROJECT_ID = 'a-different-project';
export const RESOURCE_ID = 'resource-1';

export const resource: Resource = {
  id: RESOURCE_ID,
  projectId: PROJECT_ID,
  name: 'سالم',
  role: 'مهندس',
  monthlyCost: 10000,
  createdAt: '2026-01-01T00:00:00Z',
};

function reimbursement(over: Partial<ResourceReimbursement>): ResourceReimbursement {
  return {
    id: 'r',
    projectId: PROJECT_ID,
    resourceId: RESOURCE_ID,
    sourceKind: 'resource',
    category: 'other',
    description: 'بند',
    amount: 0,
    expenseDate: '2026-03-01',
    receiptAttachments: [],
    status: 'approved',
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z',
    ...over,
  };
}

/**
 * Team ledger: 1,500 approved-but-unpaid + 400 already reimbursed.
 * So approved = 1,900 · paid = 400 · outstanding = 1,500.
 */
export const resourceReimbursements: ResourceReimbursement[] = [
  reimbursement({ id: 'res-approved', amount: 1500, status: 'approved', description: 'سفر معتمد' }),
  reimbursement({ id: 'res-paid', amount: 400, status: 'reimbursed', description: 'اتصالات مدفوعة' }),
  reimbursement({ id: 'res-pending', amount: 250, status: 'pending_review', description: 'قرطاسية قيد المراجعة' }),
];

/**
 * Vendor ledger: deliberately larger and differently shaped, so a leak between
 * the two shows up as a wrong number rather than a plausible one.
 */
export const vendorReimbursements: ResourceReimbursement[] = [
  reimbursement({
    id: 'vendor-approved',
    sourceKind: 'vendor',
    vendorName: 'مؤسسة التوريد',
    resourceId: undefined,
    amount: 9000,
    status: 'approved',
    description: 'توريد مواد',
  }),
  reimbursement({
    id: 'vendor-paid',
    sourceKind: 'vendor',
    vendorName: 'مؤسسة التوريد',
    resourceId: undefined,
    amount: 3000,
    status: 'reimbursed',
    description: 'توريد معدات',
  }),
];

/** Belongs to another project entirely; must never reach this screen. */
export const foreignReimbursement = reimbursement({
  id: 'foreign',
  projectId: OTHER_PROJECT_ID,
  amount: 7777,
  status: 'approved',
});

export function paymentRequest(over: Partial<PaymentRequest>): PaymentRequest {
  return {
    id: 'req',
    projectId: PROJECT_ID,
    resourceId: RESOURCE_ID,
    requestType: 'reimbursement',
    amount: 0,
    currency: 'SAR',
    description: 'طلب',
    linkedReimbursementIds: [],
    priority: 'normal',
    status: 'submitted',
    requestedBy: 'user-1',
    paymentAttachments: [],
    createdAt: '2026-03-02T00:00:00Z',
    updatedAt: '2026-03-02T00:00:00Z',
    ...over,
  } as PaymentRequest;
}

/** Two count as pending (submitted, approved); paid and draft do not. */
export const paymentRequests: PaymentRequest[] = [
  paymentRequest({ id: 'req-submitted', amount: 500, status: 'submitted', description: 'طلب مُرسل' }),
  paymentRequest({ id: 'req-approved', amount: 600, status: 'approved' }),
  paymentRequest({ id: 'req-paid', amount: 700, status: 'paid', description: 'طلب مدفوع' }),
  paymentRequest({ id: 'req-draft', amount: 800, status: 'draft' }),
];

export const settlements: ResourceSettlement[] = [];
