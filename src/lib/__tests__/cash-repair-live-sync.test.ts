import { describe, it, expect } from 'vitest';
import { applyCashTransferRealtimeEvent } from '@/store/slices/cashTransferSlice';
import { auditCashIntegrity } from '@/lib/cash-integrity';
import { getCustodyBreakdown } from '@/lib/funds';

const P = 'p1';

const funds = [
  { id: 'f1', projectId: P, fundNumber: 1, amount: 50000, status: 'acknowledged' },
] as any[];

const custodies = [
  { id: 'c1', projectId: P, resourceName: 'عمر', amount: 5000, status: 'active', sourceFundId: 'f1' },
] as any[];

const expenses = [
  { id: 'e1', projectId: P, custodyId: 'c1', amount: 1000, approvalStatus: 'approved' },
] as any[];

const orphanRow = {
  id: 't-orphan', project_id: P, from_fund_id: 'f-missing', to_custody_id: 'c1',
  amount: 5000, transfer_date: '2026-08-02', created_at: '2026-08-02T00:00:00Z',
};

const orphan = {
  id: 't-orphan', projectId: P, fromFundId: 'f-missing', toCustodyId: 'c1',
  amount: 5000, transferDate: '2026-08-02',
} as any;

describe('repair of an orphan transfer syncs live (no page reload)', () => {
  it('starts flagged as orphan with an inflated custody balance', () => {
    const report = auditCashIntegrity({ custodies, cashTransfers: [orphan], funds, expenses });
    expect(report.clean).toBe(false);
    expect(report.orphanTransfers.map((o) => o.transferId)).toEqual(['t-orphan']);
    const b = getCustodyBreakdown(custodies[0], [orphan], expenses, []);
    expect(b.available).toBe(10000);
  });

  it('realtime DELETE removes it from the orphan list and recomputes balances instantly', () => {
    const next = applyCashTransferRealtimeEvent([orphan], {
      eventType: 'DELETE',
      old: { id: 't-orphan' },
    });
    expect(next).toHaveLength(0);

    const report = auditCashIntegrity({ custodies, cashTransfers: next, funds, expenses });
    expect(report.clean).toBe(true);
    expect(report.orphanTransfers).toHaveLength(0);
    expect(report.inflatedAmount).toBe(0);

    const b = getCustodyBreakdown(custodies[0], next, expenses, []);
    expect(b.available).toBe(5000);
    expect(b.spent).toBe(1000);
    expect(b.remaining).toBe(4000);
  });

  it('ignores a duplicate DELETE (no repeated "transfer not found" state change)', () => {
    const once = applyCashTransferRealtimeEvent([orphan], { eventType: 'DELETE', old: { id: 't-orphan' } });
    const twice = applyCashTransferRealtimeEvent(once, { eventType: 'DELETE', old: { id: 't-orphan' } });
    expect(twice).toEqual(once);
  });

  it('applies INSERT/UPDATE without duplicating rows', () => {
    const inserted = applyCashTransferRealtimeEvent([], { eventType: 'INSERT', new: orphanRow });
    expect(inserted).toHaveLength(1);
    const again = applyCashTransferRealtimeEvent(inserted, { eventType: 'INSERT', new: orphanRow });
    expect(again).toHaveLength(1);
    const updated = applyCashTransferRealtimeEvent(inserted, {
      eventType: 'UPDATE', new: { ...orphanRow, amount: 2500 },
    });
    expect(updated[0].amount).toBe(2500);
  });
});
