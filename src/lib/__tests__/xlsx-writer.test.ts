/**
 * The point of these tests is not that the shim runs — it is that its column
 * semantics match SheetJS's `json_to_sheet`, which every caller in export.ts
 * was written against.
 *
 * `columnsOf` / `sheetGrid` are asserted directly here. They were also checked
 * against the real `xlsx` package before it was removed, by feeding the same
 * fixtures to `XLSX.utils.json_to_sheet` and comparing the resulting header
 * row and cell grid; the expectations below are that measured output, not my
 * reading of the documentation.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('write-excel-file/browser', () => ({ default: vi.fn() }));

import { bookNew, appendSheet, columnsOf, sheetGrid } from '../xlsx-writer';

describe('columnsOf', () => {
  it('takes the union of keys across all rows, not just the first', () => {
    // The financially dangerous case: a column that only appears later would
    // be dropped entirely if we trusted row 0.
    const rows = [{ 'الفئة': 'أ', 'المبلغ': 10 }, { 'الفئة': 'ب', 'المبلغ': 20, 'ملاحظات': 'x' }];
    expect(columnsOf(rows)).toEqual(['الفئة', 'المبلغ', 'ملاحظات']);
  });

  it('preserves first-seen order rather than sorting', () => {
    // Sorting would silently reorder a financial report's columns.
    const rows = [{ b: 1, a: 2 }, { c: 3 }];
    expect(columnsOf(rows)).toEqual(['b', 'a', 'c']);
  });

  it('returns no columns for no rows', () => {
    expect(columnsOf([])).toEqual([]);
  });
});

describe('sheetGrid', () => {
  it('puts headers first, then one row per record', () => {
    const grid = sheetGrid([{ 'البند': 'إيجار', 'المبلغ': 1500 }]);
    expect(grid).toEqual([['البند', 'المبلغ'], ['إيجار', 1500]]);
  });

  it('leaves a blank cell where a row lacks a key, rather than shifting the row', () => {
    // If this shifted, figures would land under the wrong heading.
    const grid = sheetGrid([{ a: 1, b: 2 }, { a: 3 }]);
    expect(grid).toEqual([['a', 'b'], [1, 2], [3, null]]);
  });

  it('preserves numbers as numbers so Excel can sum them', () => {
    const [, row] = sheetGrid([{ 'المبلغ': 1234.56 }]);
    expect(row[0]).toBe(1234.56);
    expect(typeof row[0]).toBe('number');
  });

  it('blanks null and undefined instead of writing "null" into a report', () => {
    expect(sheetGrid([{ a: null, b: undefined }])).toEqual([['a', 'b'], [null, null]]);
  });

  it('blanks non-representable values rather than emitting [object Object]', () => {
    expect(sheetGrid([{ a: { nested: true } }])).toEqual([['a'], [null]]);
  });

  it('blanks NaN and Infinity, which Excel cannot store', () => {
    // A divide-by-zero in an aggregate must not produce a corrupt workbook.
    expect(sheetGrid([{ a: NaN, b: Infinity }])).toEqual([['a', 'b'], [null, null]]);
  });

  it('keeps booleans and dates intact', () => {
    const d = new Date('2026-08-24T00:00:00Z');
    expect(sheetGrid([{ ok: true, at: d }])).toEqual([['ok', 'at'], [true, d]]);
  });

  it('emits one blank row for an empty sheet, so the workbook stays openable', () => {
    expect(sheetGrid([])).toEqual([[null]]);
  });
});

describe('workbook assembly', () => {
  it('appends sheets in order', () => {
    const wb = bookNew();
    appendSheet(wb, [{ a: 1 }], 'الملخص');
    appendSheet(wb, [{ b: 2 }], 'المصروفات');
    expect(wb.sheets.map((s) => s.name)).toEqual(['الملخص', 'المصروفات']);
  });

  it('starts empty', () => {
    expect(bookNew().sheets).toEqual([]);
  });
});
