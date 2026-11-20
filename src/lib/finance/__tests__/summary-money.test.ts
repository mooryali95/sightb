import { describe, it, expect } from 'vitest';
import { sumMoney, getCollectedRevenue, getPlannedRevenue, getRejectedExpenseTotal } from '../summary';
import { getApprovedChangeImpact, getEffectiveContractValue } from '../contract';

describe('sumMoney', () => {
  it('adds to the halala, without the float tail', () => {
    const rows = [190933.16, 119566].map((amount) => ({ amount }));
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(sumMoney([{ amount: 0.1 }, { amount: 0.2 }])).toBe(0.3);
    expect(sumMoney(rows)).toBe(310499.16);
  });

  it('reads text amounts and treats blanks as zero', () => {
    expect(sumMoney([{ amount: '1000.50' }, { amount: null }, { amount: undefined }, { amount: 'x' }])).toBe(1000.5);
  });

  it('is what the collected sum uses', () => {
    expect(getCollectedRevenue([{ status: 'collected', amount: 0.1 }, { status: 'collected', amount: 0.2 }, { status: 'invoiced', amount: 9 }])).toBe(0.3);
  });
});

describe('named sums the components used to write by hand', () => {
  it('planned revenue counts planned rows only', () => {
    expect(getPlannedRevenue([
      { status: 'planned', amount: 100.1 }, { status: 'planned', amount: 200.2 },
      { status: 'invoiced', amount: 50 }, { status: 'collected', amount: 70 },
    ])).toBe(300.3);
  });
  it('rejected spend counts rejected rows only', () => {
    expect(getRejectedExpenseTotal([
      { approvalStatus: 'rejected', amount: 40 }, { approvalStatus: 'approved', amount: 900 }, { amount: 5 },
    ])).toBe(40);
  });
  it('only approved change orders move the contract, and the effective value is built on the same sum', () => {
    const orders = [
      { status: 'approved' as const, amountImpact: 1000 }, { status: 'approved' as const, amountImpact: -250 },
      { status: 'proposed' as const, amountImpact: 7000 }, { status: 'rejected' as const, amountImpact: 9000 },
    ];
    expect(getApprovedChangeImpact(orders)).toBe(750);
    expect(getEffectiveContractValue(10000, orders)).toBe(10750);
  });
});
