import { describe, it, expect } from 'vitest';
import { formatCurrency, formatPercent, formatNumber } from '@/lib/finance';
import { SSOT_TOLERANCE } from '@/lib/ssot-report';

describe('formatCurrency', () => {
  it('always renders two decimal places', () => {
    expect(formatCurrency(1000)).toBe('1,000.00 ر.س');
    expect(formatCurrency(1000.5)).toBe('1,000.50 ر.س');
    expect(formatCurrency(0)).toBe('0.00 ر.س');
  });

  it('keeps a halala visible — the unit the reconciliation engine judges on', () => {
    // Regression guard for P0-02: the UI used to round to whole units while
    // buildReconciliation flagged anything above SSOT_TOLERANCE as a conflict,
    // so a real mismatch was reported over two figures that rendered alike.
    const a = 1000;
    const b = a + SSOT_TOLERANCE;
    expect(formatCurrency(a)).not.toBe(formatCurrency(b));
  });

  it('groups thousands and honours a custom currency label', () => {
    expect(formatCurrency(1234567.89)).toBe('1,234,567.89 ر.س');
    expect(formatCurrency(50, 'USD')).toBe('50.00 USD');
  });

  it('keeps the sign on negative amounts', () => {
    expect(formatCurrency(-250.25)).toBe('-250.25 ر.س');
  });

  it('rounds half-up at the third decimal rather than truncating', () => {
    expect(formatCurrency(10.005)).toBe('10.01 ر.س');
    expect(formatCurrency(10.004)).toBe('10.00 ر.س');
  });
});

describe('formatPercent', () => {
  it('renders one decimal place', () => {
    expect(formatPercent(12.34)).toBe('12.3%');
    expect(formatPercent(100)).toBe('100.0%');
  });
});

describe('formatNumber', () => {
  it('groups thousands without forcing decimals', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });
});
