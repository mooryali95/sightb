import { describe, it, expect } from 'vitest';
import { sumMoney, getCollectedRevenue } from '../summary';

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
