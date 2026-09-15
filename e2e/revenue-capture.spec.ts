import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID } from './support/seed';

/**
 * Recording a revenue. The same Net Storage Policy as expenses applies on
 * the income side: the database stores VAT-exclusive amounts, so a receipt
 * captured as VAT-inclusive must be divided by 1.15 before it leaves the
 * browser. Getting it backwards overstates income by 15%, and the realized
 * margin with it. The section must then show the net as collected and the
 * gross only as the "including VAT" figure.
 */
async function openRevenue(page: import('@playwright/test').Page) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'المالية' }).click();
  await page.getByRole('button', { name: 'الإيرادات', exact: true }).click();
  await expect(page.getByRole('button', { name: /إضافة إيراد/ })).toBeVisible();
}

test('stores a VAT-inclusive revenue net and shows it collected', async ({ page }) => {
  const wire = await stubSupabase(page);
  await openRevenue(page);

  await page.getByRole('button', { name: /إضافة إيراد/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('مثال: دفعة أولى من العميل').fill('دفعة أولى');
  await dialog.locator('input[type="number"]').fill('11500');
  await dialog.getByText('المبلغ شامل الضريبة').click();
  // The preview does the arithmetic before the save: 11,500 gross is 10,000 net.
  await expect(dialog.getByText(/10,000\.00/)).toBeVisible();
  await dialog.getByRole('button', { name: 'إضافة', exact: true }).click();

  await expect(page.getByText('تمت إضافة الإيراد')).toBeVisible();
  const write = wire.writes.find((w) => w.table === 'revenues' && w.method === 'POST');
  expect(write, 'a revenue row should have been posted').toBeTruthy();
  const row = (Array.isArray(write!.body) ? write!.body[0] : write!.body) as Record<string, unknown>;
  expect(row.project_id).toBe(PROJECT_ID);
  expect(row.description).toBe('دفعة أولى');
  expect(Number(row.amount)).toBe(10000);
  expect(row.status).toBe('collected');

  // Collected reads net; only the "including VAT" line carries the gross.
  const collected = page.getByText('محصّل', { exact: true }).first().locator('..');
  await expect(collected).toContainText('10,000.00');
  await expect(page.getByText(/شامل الضريبة \(15%\): 11,500\.00/)).toBeVisible();
});

test('will not save a revenue without a description or an amount', async ({ page }) => {
  const wire = await stubSupabase(page);
  await openRevenue(page);

  await page.getByRole('button', { name: /إضافة إيراد/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[type="number"]').fill('500');
  await dialog.getByRole('button', { name: 'إضافة', exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder('مثال: دفعة أولى من العميل').fill('   ');
  await dialog.getByRole('button', { name: 'إضافة', exact: true }).click();
  await expect(dialog).toBeVisible();
  expect(wire.writes.filter((w) => w.table === 'revenues')).toHaveLength(0);
});
