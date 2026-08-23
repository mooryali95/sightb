import { describe, it, expect } from 'vitest';
import { auditCashIntegrity, findOrphanTransfers, simulateRepair } from '@/lib/cash-integrity';
import { getCustodyBreakdown } from '@/lib/funds';
import type { Custody, CashTransfer, Expense, ProjectFund, PaymentRequest } from '@/types/project';

/**
 * These fixtures carry only the fields the function under test reads. The helper
 * keeps them typed at each call site instead of scattering `as any`, so a field
 * renamed in the real type still shows up here as a compile error.
 */
const fixture = <T,>(rows: Partial<T>[]): T[] => rows as T[];
const one = <T,>(row: Partial<T>): T => row as T;

const P = 'p1';

const funds = fixture<ProjectFund>([
  { id: 'f1', projectId: P, fundNumber: 1, amount: 50000, status: 'acknowledged' },
]);

const custodies = fixture<Custody>([
  { id: 'c1', projectId: P, resourceName: 'عمر', amount: 5000, status: 'active', sourceFundId: 'f1' },
]);

const expenses = fixture<Expense>([
  { id: 'e1', projectId: P, custodyId: 'c1', amount: 4000, approvalStatus: 'approved' },
  { id: 'e2', projectId: P, custodyId: 'c1', amount: 500, approvalStatus: 'rejected' },
]);

const validTransfer = one<CashTransfer>({ id: 't1', projectId: P, fromFundId: 'f1', toCustodyId: 'c1', amount: 1000, transferDate: '2026-08-01' });
const orphanTransfer = one<CashTransfer>({ id: 't2', projectId: P, fromFundId: 'f-missing', toCustodyId: 'c1', amount: 5000, transferDate: '2026-08-02' });

describe('cash-integrity', () => {
  it('detects a transfer whose source fund no longer exists', () => {
    const orphans = findOrphanTransfers([validTransfer, orphanTransfer], funds);
    expect(orphans).toHaveLength(1);
    expect(orphans[0].transferId).toBe('t2');
    expect(orphans[0].missingFundId).toBe('f-missing');
  });

  it('reports zero orphans when every transfer has a parent fund', () => {
    const report = auditCashIntegrity({ custodies, cashTransfers: [validTransfer], funds, expenses });
    expect(report.orphanTransfers).toHaveLength(0);
    expect(report.custodyMismatches).toHaveLength(0);
    expect(report.clean).toBe(true);
  });

  it('flags the inflated custody numbers caused by an orphan transfer', () => {
    const report = auditCashIntegrity({
      custodies, cashTransfers: [validTransfer, orphanTransfer], funds, expenses,
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
      { custodies, cashTransfers: [validTransfer, orphanTransfer], funds, expenses },
      't2',
    );
    expect(before.clean).toBe(false);
    expect(after.clean).toBe(true);
    expect(after.orphanTransfers).toHaveLength(0);
    expect(after.inflatedAmount).toBe(0);

    // available = base + valid transfers; remaining = available - approved spend
    const bd = getCustodyBreakdown(custodies[0], expenses, [validTransfer], []);
    expect(bd.availableAmount).toBe(5000 + 1000);
    expect(bd.spent).toBe(4000);
    expect(bd.remaining).toBe(2000);
  });

  it('keeps advances subtracted from remaining after a repair', () => {
    const prs = fixture<PaymentRequest>([{
      id: 'pr1', projectId: P, requestType: 'advance', status: 'paid',
      amount: 800, refundedAmount: 0, isAdvanceOutstanding: true, paidFromCustodyId: 'c1',
    }]);
    const report = auditCashIntegrity({
      custodies, cashTransfers: [validTransfer], funds, expenses, paymentRequests: prs,
    });
    expect(report.clean).toBe(true);
    const bd = getCustodyBreakdown(custodies[0], expenses, [validTransfer], prs);
    expect(bd.remaining).toBe(5000 + 1000 - 4000 - 800);
  });

  it('never counts rejected expenses as custody spend', () => {
    const bd = getCustodyBreakdown(custodies[0], expenses, [validTransfer], []);
    expect(bd.spent).toBe(4000);
  });
});
