import { describe, expect, it } from 'vitest';
import type { CashTransfer, Custody, Expense, ProjectFund } from '@/types/project';
import { balanceSnapshot, type BalanceState } from '../balanceSnapshot';

const fixture = <T,>(rows: Partial<T>[]): T[] => rows as T[];
const P = 'p1';

const state: BalanceState = {
  projectFunds: fixture<ProjectFund>([
    { id: 'f1', projectId: P, fundNumber: 1, amount: 50000, status: 'acknowledged', transferDate: '2026-08-01' },
    { id: 'f-other', projectId: 'p2', fundNumber: 1, amount: 900, status: 'acknowledged', transferDate: '2026-08-01' },
  ]),
  fundSettlements: [],
  custodies: fixture<Custody>([
    { id: 'c1', projectId: P, resourceName: 'عمر', amount: 5000, status: 'active', sourceFundId: 'f1' },
    { id: 'c-other', projectId: 'p2', resourceName: 'x', amount: 700, status: 'active' },
  ]),
  expenses: fixture<Expense>([
    { id: 'e1', projectId: P, custodyId: 'c1', amount: 1000, approvalStatus: 'approved' },
    { id: 'e2', projectId: P, custodyId: 'c1', amount: 400, approvalStatus: 'rejected' },
    { id: 'e3', projectId: P, fundId: 'f1', amount: 3000, approvalStatus: 'approved' },
    { id: 'e-other', projectId: 'p2', custodyId: 'c1', amount: 999, approvalStatus: 'approved' },
  ]),
  paymentRequests: [],
  cashTransfers: fixture<CashTransfer>([
    { id: 't1', projectId: P, fromFundId: 'f1', toCustodyId: 'c1', amount: 2000, transferDate: '2026-08-03' },
    { id: 't-orphan', projectId: P, fromFundId: 'f-missing', toCustodyId: 'c1', amount: 5000, transferDate: '2026-08-02' },
  ]),
};

describe('balanceSnapshot', () => {
  it('reads the custody and the fund figures from the project rows alone, counting an orphan transfer as the ledger does', () => {
    const snap = balanceSnapshot(state, P, 'c1');
    expect(snap.custodyAvailable).toBe(12000);
    expect(snap.custodySpent).toBe(1000);
    expect(snap.custodyRemaining).toBe(11000);
    expect(snap.activeFundRemaining).toBe(50000 - 3000 - 5000 - 2000);
    expect(snap.managerRemaining).toBe(snap.activeFundRemaining);
  });

  it('drops to the custody zeros for a custody it cannot find, keeping the fund figures', () => {
    const snap = balanceSnapshot(state, P, 'c-gone');
    expect(snap.custodyAvailable).toBe(0);
    expect(snap.custodySpent).toBe(0);
    expect(snap.custodyRemaining).toBe(0);
    expect(snap.activeFundRemaining).toBe(40000);
  });

  it('reads zero fund figures for a project without an active fund', () => {
    const snap = balanceSnapshot({ ...state, projectFunds: [] }, P, 'c1');
    expect(snap.activeFundRemaining).toBe(0);
    expect(snap.custodyAvailable).toBe(12000);
  });
});
