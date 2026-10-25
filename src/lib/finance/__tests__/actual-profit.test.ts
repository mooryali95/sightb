import { describe, it, expect } from 'vitest';
import { actualProfit } from '../actual-profit';

describe('actualProfit', () => {
  it('is what was collected less what was spent, as a share of what was collected', () => {
    // The hackathon on 25 October: 130,717.391 collected, 119,566 spent.
    const r = actualProfit(130717.391, 119566);
    expect(r.profit).toBeCloseTo(11151.391, 3);
    expect(r.margin).toBeCloseTo(8.5309, 3);
  });

  it('turns negative when spend passes what was collected, rather than hiding the loss', () => {
    // Albania on 25 October: 200,000 collected, 203,744.16 spent.
    const r = actualProfit(200000, 203744.16);
    expect(r.profit).toBeCloseTo(-3744.16, 2);
    expect(r.margin).toBeCloseTo(-1.8721, 3);
  });

  it('has no margin before anything is collected, but still shows what was spent as a loss', () => {
    expect(actualProfit(0, 5000)).toEqual({ profit: -5000, margin: 0 });
    expect(actualProfit(0, 0)).toEqual({ profit: 0, margin: 0 });
  });
});
