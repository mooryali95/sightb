import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID } from './support/seed';

/**
 * Planning a budget item. The seed plan is 400,000. A recurring item is a
 * monthly amount over a span of months, so what it adds to the plan is the
 * amount times the months, not the amount once; a fixed item adds itself
 * once. Getting the recurring multiplication wrong understates the plan by
 * every month but the first, and every margin reads too rosy.
 */
async function openBudget(page: import('@playwright/test').Page) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'المالية' }).click();
  await page.getByRole('button', { name: 'الموازنة', exact: true }).click();
  await expect(page.getByText(/الإجمالي المخطط: 400,000\.00/)).toBeVisible();
  await page.getByRole('button', { name: 'بند جديد' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('مثال: راتب أحمد × 4 أشهر').fill('راتب مساعد');
  await dialog.getByPlaceholder('0').fill('1000');
  return dialog;
}

test('a recurring item adds its amount for every month of its span', async ({ page }) => {
  const wire = await stubSupabase(page);
  const dialog = await openBudget(page);
  await dialog.getByRole('combobox').filter({ hasText: 'مبلغ ثابت' }).click();
  await page.getByRole('option', { name: 'متكرر شهرياً' }).click();
  await dialog.getByRole('combobox').filter({ hasText: 'موزع على الكل' }).click();
  await page.getByRole('option', { name: 'شهر 2', exact: true }).click();
  await dialog.getByRole('combobox').filter({ hasText: 'نفس الشهر' }).click();
  await page.getByRole('option', { name: 'شهر 4', exact: true }).click();
  await dialog.getByRole('button', { name: 'إضافة', exact: true }).click();

  await expect(page.getByText('تمت إضافة بند الموازنة')).toBeVisible();
  // 400,000 + 1,000 × 3 months (2, 3, 4).
  await expect(page.getByText(/الإجمالي المخطط: 403,000\.00/)).toBeVisible();
  const write = wire.writes.find((w) => w.table === 'budget_items' && w.method === 'POST');
  expect(write, 'a budget item should have been posted').toBeTruthy();
  const row = (Array.isArray(write!.body) ? write!.body[0] : write!.body) as Record<string, unknown>;
  expect(row).toMatchObject({ project_id: PROJECT_ID, description: 'راتب مساعد', cost_type: 'recurring', start_month: 2, end_month: 4 });
  expect(Number(row.planned_amount)).toBe(1000);
});

test('a fixed item adds its amount once, whatever months it sits in', async ({ page }) => {
  const wire = await stubSupabase(page);
  const dialog = await openBudget(page);
  await dialog.getByRole('combobox').filter({ hasText: 'موزع على الكل' }).click();
  await page.getByRole('option', { name: 'شهر 2', exact: true }).click();
  await dialog.getByRole('combobox').filter({ hasText: 'نفس الشهر' }).click();
  await page.getByRole('option', { name: 'شهر 4', exact: true }).click();
  await dialog.getByRole('button', { name: 'إضافة', exact: true }).click();

  await expect(page.getByText('تمت إضافة بند الموازنة')).toBeVisible();
  await expect(page.getByText(/الإجمالي المخطط: 401,000\.00/)).toBeVisible();
  const write = wire.writes.find((w) => w.table === 'budget_items' && w.method === 'POST');
  const row = (Array.isArray(write!.body) ? write!.body[0] : write!.body) as Record<string, unknown>;
  expect(row.cost_type).toBe('fixed');
});
