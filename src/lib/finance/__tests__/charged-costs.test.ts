import { describe, it, expect } from 'vitest';
import { chargedCostTotals } from '../company-ledger';

/**
 * Manzouma's administrative expenses on Albania: Dr Saleh paid 4,611 from his
 * pocket, the company charged it to Albania, and Albania repaid him from its
 * own fund, so the repayment is already in Albania's direct spend. Charged and
 * settled in the project, it must show, and must not be counted again.
 */
describe('chargedCostTotals', () => {
  const settled = { amount: 4611, settledInProject: true };
  const rent = { amount: 3000, settledInProject: false };

  it('adds to the full cost only what the project has not already paid itself', () => {
    expect(chargedCostTotals([settled, rent], 199133.16)).toEqual({
      charged: 7611, settledInProject: 4611, onTop: 3000, fullCost: 202133.16,
    });
  });

  it('leaves the full cost equal to the direct spend when everything charged was settled in the project', () => {
    expect(chargedCostTotals([settled], 199133.16).fullCost).toBe(199133.16);
  });

  it('counts an ordinary charge on top, as before', () => {
    expect(chargedCostTotals([rent], 1000)).toEqual({ charged: 3000, settledInProject: 0, onTop: 3000, fullCost: 4000 });
  });
});
