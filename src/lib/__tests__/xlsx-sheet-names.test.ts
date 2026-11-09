import { describe, it, expect, vi } from 'vitest';

vi.mock('write-excel-file/browser', () => ({ default: vi.fn() }));

import { bookNew, appendGrid, appendSheet, sheetName } from '../xlsx-writer';

describe('sheet names stay unique in one workbook', () => {
  it('numbers a second project with the same name', () => {
    const wb = bookNew();
    appendGrid(wb, [[1]], sheetName('برج الرياض'));
    appendGrid(wb, [[2]], sheetName('برج الرياض'));
    expect(wb.sheets.map((s) => s.name)).toEqual(['برج الرياض', 'برج الرياض (2)']);
  });

  it('keeps two long names that share their first 31 characters apart, within 31', () => {
    const wb = bookNew();
    const a = 'مشروع تطوير المجمع السكني الشمالي المرحلة الأولى';
    const b = 'مشروع تطوير المجمع السكني الشمالي المرحلة الثانية';
    appendGrid(wb, [[1]], sheetName(a));
    appendGrid(wb, [[2]], sheetName(b));
    const names = wb.sheets.map((s) => s.name);
    expect(new Set(names).size).toBe(2);
    for (const n of names) expect(n.length).toBeLessThanOrEqual(31);
    expect(names[1].endsWith(' (2)')).toBe(true);
  });

  it('does not let a project named like a fixed sheet clash with it', () => {
    const wb = bookNew();
    appendGrid(wb, [[1]], sheetName('التحصيل'));
    appendGrid(wb, [[2]], 'التحصيل');
    appendSheet(wb, [{ a: 1 }], 'التحصيل');
    expect(wb.sheets.map((s) => s.name)).toEqual(['التحصيل', 'التحصيل (2)', 'التحصيل (3)']);
  });

  it('treats names differing only in case as the same, like Excel', () => {
    const wb = bookNew();
    appendSheet(wb, [{ a: 1 }], 'Summary');
    appendSheet(wb, [{ a: 1 }], 'summary');
    expect(wb.sheets[1].name).toBe('summary (2)');
  });
});
