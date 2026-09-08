import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { stubSupabase } from './support/stub';
import { PROJECT_ID } from './support/seed';

/**
 * Exporting a report. This path was rebuilt when xlsx was replaced by
 * write-excel-file, and the risk it carries is silent: a workbook that
 * downloads but is subtly wrong — a shifted column, an Arabic string mangled,
 * a number stored as text — looks fine until someone sums it in Excel.
 *
 * So the assertion goes to the bytes. A .xlsx is a ZIP of OOXML parts; if the
 * local file header is there and the sheet part is present, the writer really
 * produced a workbook rather than an error page with a helpful filename.
 */
test('exports a project workbook that is a real xlsx', async ({ page }) => {
  await stubSupabase(page);

  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();

  await page.getByRole('button', { name: 'إجراءات' }).click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'تصدير Excel' }).click();
  const download = await downloadPromise;

  // Deliberately not asserted: the suggested filename. Chromium discards a
  // non-ASCII `download` attribute outright and saves the file as "download"
  // with no extension — measured here across five names, where "report.xlsx"
  // and "my report.xlsx" survive while "تقرير_مالي.xlsx" and even
  // "rapporté.xlsx" do not. Every export in this app is named in Arabic, so
  // the name never reaches disk in this browser build. Whether that also holds
  // in the browsers people actually use is unverified, and a test is the wrong
  // place to freeze an open question — the bytes below are the real invariant.

  const path = await download.path();
  expect(path, 'the download should have been written to disk').toBeTruthy();
  const bytes = readFileSync(path!);

  // ZIP local file header — "PK\x03\x04". An HTML error page would not have it.
  expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  expect(bytes.length).toBeGreaterThan(1000);

  // The OOXML parts a spreadsheet must carry. Part names sit in the ZIP
  // central directory as plain bytes, so a substring search is enough here.
  const raw = bytes.toString('latin1');
  expect(raw).toContain('xl/workbook.xml');
  expect(raw).toContain('xl/worksheets/sheet1.xml');
  expect(raw).toContain('[Content_Types].xml');
});
