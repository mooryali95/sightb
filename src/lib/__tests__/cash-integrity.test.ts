import { describe, it, expect } from 'vitest';
import { auditCashIntegrity, findOrphanTransfers, simulateRepair } from '@/lib/cash-integrity';
import { getCustodyBreakdown } from '@/lib/funds';

const P = 'p1';

const funds = [
  { id: 'f1', projectId: P, fundNumber: 1, amount: 50000, status: 'acknowledged' },
] as any[];

const custodies = [
  { id: 'c1', projectId: P, resourceName: 'عمر', amount: 5000, status: 'active', sourceFundId: 'f1' },
] as any[];

const expenses = [
  { id: 'e1', projectId: P, custodyId: 'c1', amount: 4000, approvalStatus: 'approved' },
  { id: 'e2', projectId: P, custodyId: 'c1', amount: 500, approvalStatus: 'rejected' },
] as any[];

const validTransfer = { id: 't1', projectId: P, fromFundId: 'f1', toCustodyId: 'c1', amount: 1000, transferDate: '2026-08-01' };
const orphanTransfer = { id: 't2', projectId: P, fromFundId: 'f-missing', toCustodyId: 'c1', amount: 5000, transferDate: '2026-08-02' };

describe('cash-integrity', () => {
  it('detects a transfer whose source fund no longer exists', () => {
    const orphans = findOrphanTransfers([validTransfer, orphanTransfer] as any, funds);
    expect(orphans).toHaveLength(1);
    expect(orphans[0].transferId).toBe('t2');
    expect(orphans[0].missingFundId).toBe('f-missing');
  });

  it('reports zero orphans when every transfer has a parent fund', () => {
    const report = auditCashIntegrity({ custodies, cashTransfers: [validTransfer] as any, funds, expenses });
    expect(report.orphanTransfers).toHaveLength(0);
    expect(report.custodyMismatches).toHaveLength(0);
    expect(report.clean).toBe(true);
  });

  it('flags the inflated custody numbers caused by an orphan transfer', () => {
    const report = auditCashIntegrity({
      custodies, cashTransfers: [validTransfer, orphanTransfer] as any, funds, expenses,
    });
    expect(report.inflatedAmount).toBe(5000);
    expect(report.clean).toBe(false);
    const available = report.custodyMismatches.find((m) => m.field === 'available')!;
    expect(available.diff).toBe(5000);
    const remaining = report.custodyMismatches.find((m) => m.field === 'remaining')!;
    expect(remaining.diff).toBe(5000);
  });

  it('returns clean numbers matching the linking rules after the repair', () => {
    const { before, after } = simulateRepair(
      { custodies, cashTransfers: [validTransfer, orphanTransfer] as any, funds, expenses },
      't2',
    );
    expect(before.clean).toBe(false);
    expect(after.clean).toBe(true);
    expect(after.orphanTransfers).toHaveLength(0);
    expect(after.inflatedAmount).toBe(0);

    // available = base + valid transfers; remaining = available - approved spend
    const bd = getCustodyBreakdown(custodies[0], expenses, [validTransfer] as any, []);
    expect(bd.availableAmount).toBe(5000 + 1000);
    expect(bd.spent).toBe(4000);
    expect(bd.remaining).toBe(2000);
  });

  it('keeps advances subtracted from remaining after a repair', () => {
    const prs = [{
      id: 'pr1', projectId: P, requestType: 'advance', status: 'paid',
      amount: 800, refundedAmount: 0, isAdvanceOutstanding: true, paidFromCustodyId: 'c1',
    }] as any[];
    const report = auditCashIntegrity({
      custodies, cashTransfers: [validTransfer] as any, funds, expenses, paymentRequests: prs,
    });
    expect(report.clean).toBe(true);
    const bd = getCustodyBreakdown(custodies[0], expenses, [validTransfer] as any, prs);
    expect(bd.remaining).toBe(5000 + 1000 - 4000 - 800);
  });

  it('never counts rejected expenses as custody spend', () => {
    const bd = getCustodyBreakdown(custodies[0], expenses, [validTransfer] as any, []);
    expect(bd.spent).toBe(4000);
  });
});
