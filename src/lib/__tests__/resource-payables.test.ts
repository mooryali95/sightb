import { describe, it, expect } from 'vitest';
import {
  getResourceBalance,
  getProjectPayablesSummary,
  buildTimeline,
  calcSettlementTotals,
  defaultSettlementText,
} from '../resource-payables';
import type {
  ResourceReimbursement,
  PaymentRequest,
  ResourceSettlement,
  Resource,
} from '@/types/project';

const PID = 'p1';
const RID = 'r1';
const RID2 = 'r2';

const baseReimb = (over: Partial<ResourceReimbursement> = {}): ResourceReimbursement => ({
  id: 'rb-' + Math.random(),
  projectId: PID,
  resourceId: RID,
  category: 'equipment',
  description: 'lap',
  amount: 100,
  expenseDate: '2026-04-01',
  receiptAttachments: [],
  status: 'pending_review',
  createdAt: '2026-04-01',
  updatedAt: '2026-04-01',
  ...over,
});

const baseReq = (over: Partial<PaymentRequest> = {}): PaymentRequest => ({
  id: 'pr-' + Math.random(),
  projectId: PID,
  resourceId: RID,
  requestType: 'reimbursement',
  amount: 100,
  currency: 'ر.س',
  description: 'pay',
  linkedReimbursementIds: [],
  paymentAttachments: [],
  priority: 'normal',
  status: 'draft',
  requestedBy: 'u1',
  createdAt: '2026-04-01',
  updatedAt: '2026-04-01',
  ...over,
});

describe('getResourceBalance', () => {
  it('returns zero balance when no reimbursements', () => {
    const b = getResourceBalance(RID, [], [], []);
    expect(b.outstandingBalance).toBe(0);
    expect(b.totalApprovedReimbursements).toBe(0);
    expect(b.pendingPaymentRequests).toBe(0);
  });

  it('sums approved reimbursements correctly', () => {
    const reimbs = [
      baseReimb({ status: 'approved', amount: 100 }),
      baseReimb({ status: 'approved', amount: 50 }),
      baseReimb({ status: 'pending_review', amount: 30 }),
    ];
    const b = getResourceBalance(RID, reimbs, [], []);
    expect(b.totalApprovedReimbursements).toBe(150);
    expect(b.outstandingBalance).toBe(150);
    expect(b.pendingReview).toBe(30);
  });

  it('subtracts paid (reimbursed) from outstanding', () => {
    const reimbs = [
      baseReimb({ status: 'approved', amount: 100 }),
      baseReimb({ status: 'reimbursed', amount: 200 }),
    ];
    const b = getResourceBalance(RID, reimbs, [], []);
    expect(b.totalApprovedReimbursements).toBe(300);
    expect(b.totalPaidReimbursements).toBe(200);
    expect(b.outstandingBalance).toBe(100);
  });

  it('counts only this resource', () => {
    const reimbs = [
      baseReimb({ resourceId: RID, status: 'approved', amount: 100 }),
      baseReimb({ resourceId: RID2, status: 'approved', amount: 999 }),
    ];
    const b = getResourceBalance(RID, reimbs, [], []);
    expect(b.outstandingBalance).toBe(100);
  });

  it('counts pending payment requests', () => {
    const reqs = [
      baseReq({ status: 'submitted' }),
      baseReq({ status: 'approved' }),
      baseReq({ status: 'paid' }),
      baseReq({ status: 'cancelled' }),
    ];
    const b = getResourceBalance(RID, [], reqs, []);
    expect(b.pendingPaymentRequests).toBe(2);
  });

  it('detects open draft settlement', () => {
    const sts: ResourceSettlement[] = [{
      id: 's1', resourceId: RID, totalOwed: 0, totalPaid: 0, balance: 0,
      linkedReimbursementIds: [], linkedPaymentIds: [], status: 'draft',
      signedByResource: false, createdBy: 'u', createdAt: '', updatedAt: '',
    }];
    const b = getResourceBalance(RID, [], [], sts);
    expect(b.hasOpenSettlement).toBe(true);
  });
});

describe('getProjectPayablesSummary', () => {
  it('aggregates by project', () => {
    const resources: Resource[] = [
      { id: RID, projectId: PID, name: 'omar', monthlyCost: 0, createdAt: '' },
      { id: RID2, projectId: PID, name: 'ali', monthlyCost: 0, createdAt: '' },
    ];
    const reimbs = [
      baseReimb({ resourceId: RID, status: 'approved', amount: 100 }),
      baseReimb({ resourceId: RID2, status: 'reimbursed', amount: 50 }),
      baseReimb({ resourceId: RID, status: 'pending_review', amount: 25 }),
    ];
    const summary = getProjectPayablesSummary(PID, resources, reimbs, [], []);
    expect(summary.totalReimbursementsCount).toBe(3);
    expect(summary.totalApprovedAmount).toBe(150); // approved + reimbursed
    expect(summary.totalPaidAmount).toBe(50);
    expect(summary.totalOutstandingAmount).toBe(100); // approved only
    expect(summary.totalPendingReview).toBe(25);
    expect(summary.resourcesWithBalance).toBe(1); // RID has 100 outstanding
  });

  it('ignores other projects', () => {
    const reimbs = [
      baseReimb({ projectId: 'OTHER', amount: 999 }),
    ];
    const summary = getProjectPayablesSummary(PID, [], reimbs, [], []);
    expect(summary.totalReimbursementsCount).toBe(0);
  });
});

describe('buildTimeline', () => {
  it('marks current step correctly for normal flow', () => {
    const req = baseReq({ status: 'approved', requestedAt: '2026-04-02', approvedAt: '2026-04-05' });
    const tl = buildTimeline(req);
    expect(tl).toHaveLength(6);
    const approved = tl.find((s) => s.key === 'approved')!;
    expect(approved.current).toBe(true);
    expect(approved.done).toBe(true);
    const paid = tl.find((s) => s.key === 'paid')!;
    expect(paid.done).toBe(false);
  });

  it('shows cancelled as terminal', () => {
    const req = baseReq({ status: 'cancelled' });
    const tl = buildTimeline(req);
    expect(tl[tl.length - 1].key).toBe('cancelled');
    expect(tl[tl.length - 1].current).toBe(true);
  });

  it('shows rejected as terminal', () => {
    const req = baseReq({ status: 'rejected', rejectionReason: 'no' });
    const tl = buildTimeline(req);
    expect(tl[tl.length - 1].key).toBe('rejected');
  });
});

describe('calcSettlementTotals', () => {
  it('computes totals and balance', () => {
    const reimbs = [
      baseReimb({ id: 'a', amount: 100 }),
      baseReimb({ id: 'b', amount: 200 }),
      baseReimb({ id: 'c', amount: 999 }),
    ];
    const reqs = [
      baseReq({ id: 'p1', amount: 250, status: 'paid' }),
      baseReq({ id: 'p2', amount: 100, status: 'paid' }),
      baseReq({ id: 'p3', amount: 50, status: 'submitted' }),
    ];
    const t = calcSettlementTotals(reimbs, reqs, ['a', 'b'], ['p1', 'p2', 'p3']);
    expect(t.totalOwed).toBe(300);
    expect(t.totalPaid).toBe(350); // p3 not paid → excluded
    expect(t.balance).toBe(-50);
  });
});

describe('defaultSettlementText', () => {
  it('contains key components', () => {
    const txt = defaultSettlementText('عمر', 'Basserh', 'مشروع 1', '2026-01-01', '2026-04-30', 4500);
    expect(txt).toContain('عمر');
    expect(txt).toContain('Basserh');
    expect(txt).toContain('مشروع 1');
    expect(txt).toContain('4,500');
  });
});
