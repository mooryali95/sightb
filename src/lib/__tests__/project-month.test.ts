/**
 * getProjectMonth turns a calendar date into the project's month, which is
 * what every monthly figure buckets by. A writer that used the calendar
 * month put a May receipt on a March project in month 5, and past the
 * project's duration it fell out of every chart.
 */
import { describe, it, expect } from 'vitest';
import { getProjectMonth, getCurrentMonth } from '@/lib/finance';

describe('getProjectMonth', () => {
  it('counts from the month the project started', () => {
    expect(getProjectMonth('2026-03-01', '2026-03-31', 6)).toBe(1);
    expect(getProjectMonth('2026-03-01', '2026-05-10', 6)).toBe(3);
    expect(getProjectMonth('2026-11-15', '2027-01-02', 6)).toBe(3);
  });

  it('clamps to the project\'s duration on both ends', () => {
    expect(getProjectMonth('2026-03-01', '2026-01-10', 6)).toBe(1);
    expect(getProjectMonth('2026-03-01', '2027-03-10', 6)).toBe(6);
  });

  it('is what getCurrentMonth reports for today', () => {
    expect(getCurrentMonth('2026-03-01', 6)).toBe(getProjectMonth('2026-03-01', new Date(), 6));
  });
});
