import type {
  ResourceReimbursement,
  PaymentRequest,
  ResourceSettlement,
  Resource,
} from '@/types/project';

/**
 * Employee/resource reimbursements vs vendor payables are two distinct
 * ledgers stored in the same table. Every aggregate MUST declare which
 * one it means — never mix them silently.
 */
export function isResourceReimbursement(r: ResourceReimbursement): boolean {
  return (r.sourceKind ?? 'resource') === 'resource';
}

export function isVendorReimbursement(r: ResourceReimbursement): boolean {
  return (r.sourceKind ?? 'resource') === 'vendor';
}

export function filterResourceReimbursements(rs: ResourceReimbursement[]): ResourceReimbursement[] {
  return rs.filter(isResourceReimbursement);
}

export function filterVendorReimbursements(rs: ResourceReimbursement[]): ResourceReimbursement[] {
  return rs.filter(isVendorReimbursement);
}

export interface ResourceBalance {
  resourceId: string;
  totalApprovedReimbursements: number;
  totalPaidReimbursements: number;
  pendingReview: number;
  rejected: number;
  outstandingBalance: number; // approved - paid (ما هو مستحق ولم يُدفع)
  pendingPaymentRequests: number;
  hasOpenSettlement: boolean;
}

/**
 * يحسب الرصيد المستحق لكل مورد بشري في مشروع معين.
 * يستثني مستحقات الموردين الخارجيين (vendor) صراحةً.
 */
export function getResourceBalance(
  resourceId: string,
  reimbursements: ResourceReimbursement[],
  paymentRequests: PaymentRequest[],
  settlements: ResourceSettlement[],
): ResourceBalance {
  const myReimbs = reimbursements.filter(
    (r) => r.resourceId === resourceId && isResourceReimbursement(r),
  );

  const totalApproved = myReimbs
    .filter((r) => r.status === 'approved' || r.status === 'reimbursed')
    .reduce((s, r) => s + r.amount, 0);

  const totalPaid = myReimbs
    .filter((r) => r.status === 'reimbursed')
    .reduce((s, r) => s + r.amount, 0);

  const pendingReview = myReimbs
    .filter((r) => r.status === 'pending_review')
    .reduce((s, r) => s + r.amount, 0);

  const rejected = myReimbs
    .filter((r) => r.status === 'rejected')
    .reduce((s, r) => s + r.amount, 0);

  const outstanding = Math.max(0, totalApproved - totalPaid);


  const pendingReqs = paymentRequests.filter(
    (p) => p.resourceId === resourceId
      && (p.status === 'submitted' || p.status === 'under_review'
        || p.status === 'approved' || p.status === 'scheduled'),
  ).length;

  const openSettlement = settlements.some(
    (s) => s.resourceId === resourceId && s.status === 'draft',
  );

  return {
    resourceId,
    totalApprovedReimbursements: totalApproved,
    totalPaidReimbursements: totalPaid,
    pendingReview,
    rejected,
    outstandingBalance: outstanding,
    pendingPaymentRequests: pendingReqs,
    hasOpenSettlement: openSettlement,
  };
}

export interface ProjectPayablesSummary {
  /** Which ledger these numbers describe — never mixed. */
  scope: 'resource' | 'vendor';
  totalReimbursementsCount: number;
  totalApprovedAmount: number;
  totalPaidAmount: number;
  totalOutstandingAmount: number;
  totalPendingReview: number;
  pendingRequestsCount: number;
  paidRequestsCount: number;
  resourcesWithBalance: number;
}

function summarizeReimbursements(rs: ResourceReimbursement[]) {
  return {
    totalReimbursementsCount: rs.length,
    totalApprovedAmount: rs
      .filter((r) => r.status === 'approved' || r.status === 'reimbursed')
      .reduce((s, r) => s + r.amount, 0),
    totalPaidAmount: rs
      .filter((r) => r.status === 'reimbursed')
      .reduce((s, r) => s + r.amount, 0),
    totalOutstandingAmount: rs
      .filter((r) => r.status === 'approved')
      .reduce((s, r) => s + r.amount, 0),
    totalPendingReview: rs
      .filter((r) => r.status === 'pending_review')
      .reduce((s, r) => s + r.amount, 0),
  };
}

/**
 * ملخص مستحقات الفريق (الموارد البشرية) فقط.
 * مستحقات الموردين الخارجيين لها `getVendorPayablesSummary`.
 */
export function getProjectPayablesSummary(
  projectId: string,
  resources: Resource[],
  reimbursements: ResourceReimbursement[],
  paymentRequests: PaymentRequest[],
  settlements: ResourceSettlement[],
): ProjectPayablesSummary {
  const projReimbs = filterResourceReimbursements(
    reimbursements.filter((r) => r.projectId === projectId),
  );
  const projReqs = paymentRequests.filter((p) => p.projectId === projectId);
  const projResources = resources.filter((r) => r.projectId === projectId);

  let resourcesWithBalance = 0;
  for (const r of projResources) {
    const bal = getResourceBalance(r.id, projReimbs, projReqs, settlements);
    if (bal.outstandingBalance > 0) resourcesWithBalance++;
  }

  return {
    scope: 'resource',
    ...summarizeReimbursements(projReimbs),
    pendingRequestsCount: projReqs.filter(
      (p) => p.status === 'submitted' || p.status === 'under_review'
        || p.status === 'approved' || p.status === 'scheduled',
    ).length,
    paidRequestsCount: projReqs.filter((p) => p.status === 'paid').length,
    resourcesWithBalance,
  };
}

/** ملخص مستحقات الموردين الخارجيين (vendor payables) فقط. */
export function getVendorPayablesSummary(
  projectId: string,
  reimbursements: ResourceReimbursement[],
): ProjectPayablesSummary {
  const vendorReimbs = filterVendorReimbursements(
    reimbursements.filter((r) => r.projectId === projectId),
  );
  return {
    scope: 'vendor',
    ...summarizeReimbursements(vendorReimbs),
    pendingRequestsCount: 0,
    paidRequestsCount: 0,
    resourcesWithBalance: 0,
  };
}


export interface PaymentRequestTimelineStep {
  key: string;
  label: string;
  date?: string;
  by?: string;
  done: boolean;
  current: boolean;
}

export function buildTimeline(req: PaymentRequest): PaymentRequestTimelineStep[] {
  const order = ['draft', 'submitted', 'under_review', 'approved', 'scheduled', 'paid'] as const;
  const labels: Record<string, string> = {
    draft: 'مسودة',
    submitted: 'تم الإرسال',
    under_review: 'قيد المراجعة',
    approved: 'تم الاعتماد',
    scheduled: 'تمت الجدولة',
    paid: 'تم الدفع',
  };
  const dates: Record<string, string | undefined> = {
    draft: req.createdAt,
    submitted: req.requestedAt,
    under_review: req.reviewedAt,
    approved: req.approvedAt,
    scheduled: req.scheduledDate,
    paid: req.paidDate,
  };
  const actors: Record<string, string | undefined> = {
    draft: req.requestedBy,
    submitted: req.requestedBy,
    under_review: req.reviewedBy,
    approved: req.approvedBy,
    scheduled: req.approvedBy,
    paid: req.approvedBy,
  };

  // Cancelled / Rejected: show terminal state
  if (req.status === 'cancelled' || req.status === 'rejected') {
    return [
      ...order.slice(0, order.indexOf('submitted') + 1).map((k) => ({
        key: k, label: labels[k], date: dates[k], by: actors[k],
        done: true, current: false,
      })),
      {
        key: req.status,
        label: req.status === 'cancelled' ? 'ملغي' : 'مرفوض',
        date: req.updatedAt,
        by: req.status === 'rejected' ? req.approvedBy : undefined,
        done: true,
        current: true,
      },
    ];
  }

  const currentIdx = (order as readonly string[]).indexOf(req.status);
  return order.map((k, i) => ({
    key: k,
    label: labels[k],
    date: dates[k],
    by: actors[k],
    done: i <= currentIdx,
    current: i === currentIdx,
  }));
}

export function calcSettlementTotals(
  reimbursements: ResourceReimbursement[],
  paymentRequests: PaymentRequest[],
  reimbIds: string[],
  paymentIds: string[],
): { totalOwed: number; totalPaid: number; balance: number } {
  const owed = reimbursements
    .filter((r) => reimbIds.includes(r.id))
    .reduce((s, r) => s + r.amount, 0);
  const paid = paymentRequests
    .filter((p) => paymentIds.includes(p.id) && p.status === 'paid')
    .reduce((s, p) => s + p.amount, 0);
  return {
    totalOwed: owed,
    totalPaid: paid,
    balance: owed - paid,
  };
}

export function defaultSettlementText(
  resourceName: string,
  companyName: string,
  projectName: string,
  periodFrom: string,
  periodTo: string,
  amount: number,
  currency: string = 'ر.س',
): string {
  return `أُقرّ أنا الموقّع أدناه / ${resourceName}، بأنني استلمت كامل مستحقاتي المالية من شركة ${companyName} عن مشروع ${projectName} للفترة من ${periodFrom} إلى ${periodTo}، وقدرها (${amount.toLocaleString('en-US')}) ${currency}، مقابل جميع الأعمال والاستردادات والمطالبات.

وأُقرّ بأنه لا يحق لي مطالبة الشركة بأي مبالغ إضافية أو حقوق مالية تخص الفترة المذكورة بعد توقيعي على هذه المخالصة، وأخلي طرف الشركة من أي مطالبات لاحقة.

وعلى ذلك جرى التوقيع.`;
}
