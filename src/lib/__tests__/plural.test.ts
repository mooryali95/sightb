import { describe, it, expect } from 'vitest';
import { countAr } from '../plural';

describe('countAr', () => {
  it('follows Arabic plural rules', () => {
    expect([0, 1, 2, 3, 10, 11, 99, 100, 101, 103].map((n) => countAr(n, 'project'))).toEqual([
      'لا مشاريع', 'مشروع واحد', 'مشروعان', '3 مشاريع', '10 مشاريع', '11 مشروعًا', '99 مشروعًا', '100 مشروع', '101 مشروع', '103 مشاريع',
    ]);
    expect(countAr(1, 'portfolio')).toBe('محفظة واحدة');
    expect(countAr(0, 'portfolio')).toBe('لا محافظ');
    expect(countAr(2, 'company')).toBe('شركتان');
  });
});
