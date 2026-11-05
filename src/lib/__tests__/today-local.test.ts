import { describe, it, expect } from 'vitest';
import { todayLocal } from '../utils';

describe('todayLocal', () => {
  it('reads the date in Riyadh, not in UTC', () => {
    // 21:30 UTC on 31 October is 00:30 on 1 November in Riyadh.
    expect(todayLocal(new Date('2026-10-31T21:30:00Z'))).toBe('2026-11-01');
    expect(new Date('2026-10-31T21:30:00Z').toISOString().slice(0, 10)).toBe('2026-10-31');
    expect(todayLocal(new Date('2026-11-05T12:00:00Z'))).toBe('2026-11-05');
  });
});
