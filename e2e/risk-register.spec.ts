import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID } from './support/seed';

/**
 * Registering a risk. The register's headline is the financial exposure,
 * the sum of what the open risks could cost, and it feeds the portfolio
 * health score. So a risk's impact must reach the wire as typed, an open
 * risk must count, a closed one must not, and a risk without a title must
 * never be written.
 */
async function openRiskForm(page: import('@playwright/test').Page) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'الإدارة' }).click();
  await page.getByRole('button', { name: 'المخاطر', exact: true }).click();
  await page.getByRole('button', { name: /إضافة خطر/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByPlaceholder('وصف مختصر للخطر')).toBeVisible();
  return dialog;
}
const posted = (wire: { writes: { method: string; table: string; body: unknown }[] }) => {
  const w = wire.writes.find((x) => x.table === 'risks' && x.method === 'POST');
  if (!w) return null;
  return (Array.isArray(w.body) ? w.body[0] : w.body) as Record<string, unknown>;
};

test('an open risk is written with its impact and counted in the exposure', async ({ page }) => {
  const wire = await stubSupabase(page);
  const dialog = await openRiskForm(page);
  await dialog.getByPlaceholder('وصف مختصر للخطر').fill('تأخر توريد المعدات');
  await dialog.locator('input[type="number"]').fill('25000');
  await dialog.getByRole('button', { name: 'إضافة', exact: true }).click();

  await expect(page.getByText('تم إضافة الخطر')).toBeVisible();
  await expect.poll(() => posted(wire)).not.toBeNull();
  expect(posted(wire)).toMatchObject({ project_id: PROJECT_ID, title: 'تأخر توريد المعدات', status: 'open' });
  expect(Number(posted(wire)!.financial_impact)).toBe(25000);
  const exposure = page.getByText('إجمالي التعرض المالي', { exact: false }).first().locator('..');
  await expect(exposure).toContainText('25,000.00');
});

test('a closed risk is kept on the register but left out of the exposure', async ({ page }) => {
  const wire = await stubSupabase(page);
  const dialog = await openRiskForm(page);
  await dialog.getByPlaceholder('وصف مختصر للخطر').fill('خطر مغلق');
  await dialog.locator('input[type="number"]').fill('40000');
  await dialog.getByRole('combobox').filter({ hasText: 'مفتوح' }).click();
  await page.getByRole('option', { name: 'مغلق', exact: true }).click();
  await dialog.getByRole('button', { name: 'إضافة', exact: true }).click();

  await expect(page.getByText('تم إضافة الخطر')).toBeVisible();
  await expect.poll(() => posted(wire)).not.toBeNull();
  expect(posted(wire)).toMatchObject({ status: 'closed' });
  await expect(page.getByText('خطر مغلق')).toBeVisible();
  const exposure = page.getByText('إجمالي التعرض المالي', { exact: false }).first().locator('..');
  await expect(exposure).toContainText('0.00');
  await expect(exposure).not.toContainText('40,000.00');
});

test('a risk without a title is refused before the wire', async ({ page }) => {
  const wire = await stubSupabase(page);
  const dialog = await openRiskForm(page);
  await dialog.locator('input[type="number"]').fill('5000');
  await dialog.getByRole('button', { name: 'إضافة', exact: true }).click();
  await expect(page.getByText('العنوان مطلوب')).toBeVisible();
  expect(posted(wire)).toBeNull();
});
