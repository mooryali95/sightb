import { describe, it, expect } from 'vitest';
import { buildSsotAudit, buildReconciliation, buildSsotReportCSV, SSOT_LABELS } from '@/lib/ssot-report';

const P = 'p1';
const base = {
  projectId: P,
  contractValue: 100000,
  expenses: [
    { id: 'e1', projectId: P, amount: 3000, approvalStatus: 'approved', custodyId: 'c1' },
    { id: 'e2', projectId: P, amount: 500, approvalStatus: 'rejected' },
  ],
  custodies: [
    { id: 'c1', projectId: P, amount: 10000, status: 'active', sourceFundId: 'f1' },
  ],
  paymentRequests: [
    {
      id: 'pr1', projectId: P, requestType: 'advance', status: 'paid',
      amount: 2000, refundedAmount: 0, isAdvanceOutstanding: true, paidFromFundId: 'f1',
    },
  ],
  cashTransfers: [
    { id: 't1', projectId: P, fromFundId: 'f1', toCustodyId: 'c1', amount: 1000 },
  ],
  funds: [{ id: 'f1', projectId: P, fundNumber: 1, amount: 50000, status: 'transferred' }],
  settlements: [],
  changeOrders: [{ id: 'co1', projectId: P, status: 'approved', amountImpact: 5000 }],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

describe('ssot-report', () => {
  const audit = buildSsotAudit(base);

  it('excludes rejected expenses from actual expenses', () => {
    expect(audit.totalActualExpenses.value).toBe(3000);
  });

  it('computes custody in hand = base + transfers - spent', () => {
    expect(audit.custodyInHand.value).toBe(10000 + 1000 - 3000);
  });

  it('tracks outstanding advances net of refunds', () => {
    expect(audit.outstandingAdvances.value).toBe(2000);
  });

  it('includes approved change orders in profit', () => {
    expect(audit.profit.value).toBe(100000 + 5000 - 3000);
  });

  it('attaches components and a formula to every figure', () => {
    for (const key of Object.keys(SSOT_LABELS) as Array<keyof typeof SSOT_LABELS>) {
      expect(audit[key].formula.length).toBeGreaterThan(0);
      expect(Array.isArray(audit[key].components)).toBe(true);
    }
  });

  it('flags no mismatch when the server agrees', () => {
    const server = Object.fromEntries(
      Object.entries(audit).map(([k, f]) => [k, f.value]),
    ) as Record<string, number>;
    const rows = buildReconciliation(server, audit);
    expect(rows.every((r) => !r.mismatch)).toBe(true);
    expect(rows.every((r) => r.reason === null)).toBe(true);
  });

  it('explains the reason when the server disagrees', () => {
    const server = Object.fromEntries(
      Object.entries(audit).map(([k, f]) => [k, f.value]),
    ) as Record<string, number>;
    server.totalActualExpenses += 250;
    const rows = buildReconciliation(server, audit);
    const row = rows.find((r) => r.key === 'totalActualExpenses')!;
    expect(row.mismatch).toBe(true);
    expect(Math.abs(row.diff)).toBeCloseTo(250);
    expect(row.reason).toBeTruthy();
  });

  it('ignores sub-cent floating noise', () => {
    const server = Object.fromEntries(
      Object.entries(audit).map(([k, f]) => [k, f.value]),
    ) as Record<string, number>;
    server.profit += 0.001;
    expect(buildReconciliation(server, audit).some((r) => r.mismatch)).toBe(false);
  });

  it('builds a CSV containing all report sections', () => {
    const server = Object.fromEntries(
      Object.entries(audit).map(([k, f]) => [k, f.value]),
    ) as Record<string, number>;
    const csv = buildSsotReportCSV({
      profitability: {
        projectName: 'Test', currency: 'SAR', contractValue: 100000,
        approvedChangeOrders: 5000, revenues: [], totalActualExpenses: 3000,
      },
      reconciliation: buildReconciliation(server, audit),
      settlements: [],
      computedAt: new Date().toISOString(),
    });
    expect(csv).toContain('Test');
    expect(csv.split('\n').length).toBeGreaterThan(5);
  });
});
