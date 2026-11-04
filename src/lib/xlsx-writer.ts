/**
 * xlsx-writer
 * ---------------------------------------------------------------
 * Writes `.xlsx` workbooks from arrays of plain objects.
 *
 * This replaces `xlsx` (SheetJS), which carried two unfixable high advisories
 * — prototype pollution and ReDoS — with no published patch. Both live in its
 * *parsing* code, and this application only ever wrote workbooks: there was no
 * `XLSX.read`, no `sheet_to_json`, and no spreadsheet upload anywhere in the
 * UI. So the exposure was never exploitable here, but an unfixable high in a
 * financial system's dependency list blocks the audit from becoming a gate,
 * and a write-only need does not justify carrying a full parser.
 *
 * `write-excel-file` is a browser-first writer with a single dependency
 * (`fflate`), about a twelfth the unpacked size of `exceljs` — which pulls
 * `archiver`, `unzipper` and `readable-stream` and needs Node polyfills to
 * run in a browser at all.
 *
 * The column semantics below deliberately reproduce SheetJS's
 * `json_to_sheet`, because the callers were written against it:
 *
 *   - the header row is the union of keys across every row,
 *   - in first-seen order (NOT sorted, and not just the first row's keys),
 *   - a row missing a key yields a blank cell rather than a shifted column.
 *
 * That last point is the one that matters financially. Rows here are built by
 * `.map()` over heterogeneous records, so a key absent from row 1 but present
 * in row 40 is normal. Taking only the first row's keys would silently drop a
 * column of figures; sorting them would silently reorder the report.
 */

import writeXlsxFile from 'write-excel-file/browser';

/** A single output row: Arabic column header -> value. */
export type SheetRow = Record<string, unknown>;

interface WorkbookSheet {
  name: string;
  rows: SheetRow[];
  /** A laid-out sheet (title, blocks, side tables) instead of one table; see appendGrid. */
  grid?: GridCell[][];
  widths?: number[];
}

/** One cell of a laid-out sheet: a value, or a value with its look. */
export type GridCell =
  | string | number | null
  | {
      value: string | number | null;
      bold?: boolean;
      /** Excel number format, e.g. '#,##0.00' or '0.0%'. */
      format?: string;
      fill?: string;
      color?: string;
      size?: number;
      span?: number;
    };

export interface Workbook {
  sheets: WorkbookSheet[];
}

export const bookNew = (): Workbook => ({ sheets: [] });

/**
 * Append one sheet built from an array of objects.
 *
 * Replaces the `json_to_sheet` + `book_append_sheet` pair, which was always
 * called together, so the two-step dance served no purpose.
 */
export function appendSheet(wb: Workbook, rows: SheetRow[], name: string): void {
  wb.sheets.push({ name, rows });
}

/** Excel refuses a sheet name over 31 characters or holding : \\ / ? * [ ]. */
export function sheetName(raw: string): string {
  return raw.replace(/[:\\/?*[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'ورقة';
}

/** Append a laid-out sheet: rows of cells, with optional column widths in characters. */
export function appendGrid(wb: Workbook, grid: GridCell[][], name: string, widths?: number[]): void {
  wb.sheets.push({ name, rows: [], grid, widths });
}

function gridCell(c: GridCell) {
  if (c === null || typeof c !== 'object') return c === null || c === undefined ? null : { value: c };
  return {
    value: c.value ?? undefined,
    ...(c.bold ? { fontWeight: 'bold' as const } : {}),
    ...(c.format ? { format: c.format } : {}),
    ...(c.fill ? { backgroundColor: c.fill } : {}),
    ...(c.color ? { textColor: c.color } : {}),
    ...(c.size ? { fontSize: c.size } : {}),
    ...(c.span && c.span > 1 ? { columnSpan: c.span } : {}),
  };
}

/** Column headers: union of all keys, in first-seen order. See the note above. */
export function columnsOf(rows: SheetRow[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) seen.add(key);
  }
  return [...seen];
}

/**
 * Excel cell values are limited to string / number / boolean / date. Anything
 * else — null, undefined, a nested object left in by a caller — becomes blank
 * rather than the string "[object Object]" or "undefined" appearing in a
 * financial report.
 */
function toCell(value: unknown): string | number | boolean | Date | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value;
  return null;
}

/** Build the 2-D cell grid for one sheet: header row, then one row per record. */
export function sheetGrid(rows: SheetRow[]): (string | number | boolean | Date | null)[][] {
  const columns = columnsOf(rows);
  // A sheet with no columns at all still needs one row, or the writer emits a
  // structurally invalid worksheet that Excel refuses to open.
  if (columns.length === 0) return [[null]];
  return [columns, ...rows.map((row) => columns.map((col) => toCell(row[col])))];
}

/**
 * Write the workbook and hand it to the browser as a download.
 *
 * Asynchronous, where SheetJS's `writeFile` was synchronous. Callers already
 * reach these exports through the async wrappers in `export-lazy.ts`, so this
 * is invisible to them — but it is now awaited rather than fired and
 * forgotten, so a failed export surfaces instead of silently producing nothing.
 */
export async function writeWorkbook(wb: Workbook, fileName: string): Promise<void> {
  // Multiple sheets must be passed as an array of sheet objects. The library
  // detects this by the first element being an object rather than an array,
  // and throws outright on the older "array of grids" form.
  const sheets = wb.sheets.map((s) => ({
    data: s.grid ? s.grid.map((row) => row.map(gridCell)) : sheetGrid(s.rows),
    ...(s.widths ? { columns: s.widths.map((width) => ({ width })) } : {}),
    sheet: s.name,
    // These reports are Arabic. SheetJS offered no equivalent, so every
    // workbook it produced opened left-to-right with column A on the wrong
    // side of the page.
    rightToLeft: true,
  }));
  // The browser build returns { toBlob, toFile } and does not download on its
  // own — there is no `fileName` option to pass.
  await writeXlsxFile(sheets, {}).toFile(fileName);
}
