import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID } from './support/seed';

/**
 * Recording an expense. The assertion that matters is not that a row was
 * written but what number was in it: the database stores VAT-exclusive amounts
 * (Net Storage Policy), so a total captured as VAT-inclusive must be divided by
 * 1.15 before it leaves the browser. Getting that backwards overstates every
 * cost in the project by 15% and nothing downstream would flag it.
 */
test('records an expense and stores the VAT-exclusive amount', async ({ page }) => {
  const wire = await stubSupabase(page);

  await page.goto('/m/expense/new');
  await page.getByRole('button', { name: 'إدخال يدوي بدون صورة' }).click();

  await page.getByRole('combobox').first().click();
  await page.getByRole('option', { name: 'مشروع الاختبار' }).click();

  await page.getByRole('textbox').filter({ hasText: '' }).first().fill('قرطاسية للمكتب');
  await page.locator('input[type="number"]').fill('1150');
  await page.getByText('المبلغ شامل ضريبة القيمة المضافة').click();

  await page.getByRole('button', { name: 'حفظ وإغلاق' }).click();

  // The app navigates to the project on success — proof the save resolved.
  await expect(page).toHaveURL(new RegExp(`/project/${PROJECT_ID}$`));

  const write = wire.writes.find((w) => w.table === 'expenses' && w.method === 'POST');
  expect(write, 'an expense row should have been posted').toBeTruthy();

  const row = (Array.isArray(write!.body) ? write!.body[0] : write!.body) as Record<string, unknown>;
  expect(row.project_id).toBe(PROJECT_ID);
  expect(row.description).toBe('قرطاسية للمكتب');
  // 1150 gross → 1000.00 net. Not 1150, and not 1000.0000000001.
  expect(Number(row.amount)).toBe(1000);
});

test('refuses to save an expense with no amount', async ({ page }) => {
  const wire = await stubSupabase(page);

  await page.goto('/m/expense/new');
  await page.getByRole('button', { name: 'إدخال يدوي بدون صورة' }).click();
  await page.getByRole('combobox').first().click();
  await page.getByRole('option', { name: 'مشروع الاختبار' }).click();
  await page.getByRole('textbox').first().fill('بلا مبلغ');
  await page.getByRole('button', { name: 'حفظ وإغلاق' }).click();

  await expect(page.getByText('أدخل مبلغاً صحيحاً')).toBeVisible();
  expect(wire.writes.filter((w) => w.table === 'expenses')).toHaveLength(0);
});
