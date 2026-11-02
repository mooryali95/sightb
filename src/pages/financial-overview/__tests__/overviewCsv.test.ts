import { describe, it, expect } from 'vitest';
import { buildOverviewCsv, csvCell } from '../overviewCsv';

describe('finance screen CSV', () => {
  it('neutralises formula text but keeps numbers numeric', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell(-500)).toBe('-500');
  });
  it('writes rows in the given order with spend rate', () => {
    const base = { parent: '', currency: 'SAR', contract: 100, collected: 0, profit: 0, margin: 0, actualProfit: 0, actualMargin: 0 };
    const csv = buildOverviewCsv([{ ...base, name: 'ب', planned: 200, actual: 50 }, { ...base, name: 'أ', planned: 0, actual: 10 }], 'الشركة');
    const lines = csv.split('\r\n');
    expect(lines[1].startsWith('ب,')).toBe(true);
    expect(lines[1].split(',')[6]).toBe('25');
    expect(lines[2].split(',')[6]).toBe('0');
  });
});
