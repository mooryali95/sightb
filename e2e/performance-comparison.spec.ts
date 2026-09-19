import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID, USER_ID } from './support/seed';

/**
 * Budget against actual on the tracking tab. The seed's 400,000 materials
 * line spreads evenly over the twelve months; a 60,000 one-off crane in
 * month 3 joins it. Over months 1 to 6 the plan is 260,000 against
 * 295,000 spent: materials within bounds, the crane half over. The
 * deviated-only filter hides the group within bounds, opening a line
 * shows the expenses behind it, and the range resets to the project's
 * current month.
 */
const BUDGET_ID = '66666666-6666-4666-8666-666666666666';
const crane = { id: 'bi-crane', project_id: PROJECT_ID, category: 'equipment', description: 'رافعة', planned_amount: 60000, cost_type: 'one_time', month: 3, created_at: '2026-01-01T00:00:00Z' };
const linked = (id: string, description: string, amount: number, month: number, budget_item_id: string) => ({
  id, project_id: PROJECT_ID, category: 'materials', description, amount, date: `2026-${String(month).padStart(2, '0')}-10`, month,
  approval_status: 'approved', is_vat_exempt: true, budget_item_id, user_id: USER_ID, created_at: '2026-03-10T00:00:00Z',
});

async function openComparison(page: Page) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'المتابعة' }).click();
  const header = page.getByRole('button', { name: 'مقارنة الأداء', exact: true });
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
  const region = page.getByRole('region', { name: 'مقارنة الأداء' });
  await expect(region.getByText('إجمالي الموازنة (BAC)')).toBeVisible();
  return region;
}
// The four stat cards are the section's first grid; the group rows below repeat the metric labels.
const stat = (region: ReturnType<Page['getByRole']>, title: string) =>
  region.locator('div.grid').first().getByText(title, { exact: true }).locator('..').locator('..').locator('..');

test('sums the plan and the spend over the chosen months, flags the line half over, and opens its expenses', async ({ page }) => {
  await stubSupabase(page, {
    budget_items: [crane],
    expenses: [linked('ex-m', 'مواد مربوطة', 205000, 5, BUDGET_ID), linked('ex-c', 'إيجار الرافعة', 90000, 3, 'bi-crane')],
  });
  const region = await openComparison(page);
  await expect(stat(region, 'إجمالي الموازنة (BAC)')).toContainText('460,000.00 ر.س');
  await expect(stat(region, 'المخطط للفترة')).toContainText(/الأشهر 1–\d+/);

  // Months 1 to 6: 200,000 of materials and the crane, against 295,000 spent.
  await region.getByRole('combobox').nth(1).click();
  await page.getByRole('option', { name: 'الشهر 6' }).click();
  await expect(stat(region, 'المخطط للفترة')).toContainText('260,000.00 ر.س');
  await expect(stat(region, 'المخطط للفترة')).toContainText('الأشهر 1–6');
  await expect(stat(region, 'الفعلي للفترة')).toContainText('295,000.00 ر.س');
  await expect(stat(region, 'الانحراف للفترة')).toContainText('+35,000.00 ر.س');

  // The group toggle names the category and its line count; the badge sits two levels up. The seed's
  // materials line uses a category the app has no label for, so the page shows the key as it is.
  const group = (label: string) => region.getByRole('button', { name: new RegExp(`^${label} `) }).locator('..').locator('..');
  await expect(group('materials')).toContainText('+5,000.00 ر.س');
  await expect(group('معدات وأجهزة')).toContainText('+30,000.00 ر.س');

  // Only the crane deviates.
  await region.getByRole('button', { name: 'المنحرف فقط' }).click();
  await expect(region.getByRole('button', { name: /^معدات وأجهزة / })).toBeVisible();
  await expect(region.getByRole('button', { name: /^materials / })).toHaveCount(0);
  await region.getByRole('button', { name: 'إظهار الكل' }).click();
  await expect(region.getByRole('button', { name: /^materials / })).toBeVisible();

  // Open every group and look behind the crane line.
  await region.getByRole('button', { name: 'فتح الكل' }).click();
  await region.getByRole('button', { name: /رافعة/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('إيجار الرافعة');
  await expect(dialog).toContainText('إجمالي: 90,000.00 ر.س');
});

test('narrowing the range drops what falls outside it, and the reset restores the current month', async ({ page }) => {
  await stubSupabase(page, {
    budget_items: [crane],
    expenses: [linked('ex-m', 'مواد مربوطة', 205000, 5, BUDGET_ID), linked('ex-c', 'إيجار الرافعة', 90000, 3, 'bi-crane')],
  });
  const region = await openComparison(page);
  const before = await stat(region, 'المخطط للفترة').textContent();

  // Months 1 to 2: a sixth of the materials line, no crane, nothing spent.
  await region.getByRole('combobox').nth(1).click();
  await page.getByRole('option', { name: 'الشهر 2' }).click();
  await expect(stat(region, 'المخطط للفترة')).toContainText('66,666.67 ر.س');
  await expect(stat(region, 'الفعلي للفترة')).toContainText(/^.*0\.00 ر\.س/);
  await expect(stat(region, 'الانحراف للفترة')).toContainText('−66,666.67 ر.س');
  await expect(stat(region, 'الانحراف للفترة')).toContainText('100.0%');

  await region.getByRole('button', { name: /^استعادة الافتراضي \(1 — \d+\)$/ }).click();
  await expect(stat(region, 'المخطط للفترة')).toHaveText(before ?? '');
});
