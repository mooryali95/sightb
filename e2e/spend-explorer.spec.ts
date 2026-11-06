import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID, FUND_ID, USER_ID } from './support/seed';
import { readFileSync } from 'node:fs';

/**
 * The spend explorer on the expenses tab. It groups the project's spend
 * by resource, then category, then plan line, showing each node's total,
 * count and share with pending spend called out and rejected spend kept
 * out; the search narrows the tree; sharing puts the view in the URL so
 * a reload restores it; the CSV export carries the same tree with its
 * totals.
 */
const RESOURCE_ID = '99999999-9999-4999-8999-999999999901';
const expense = (id: string, description: string, amount: number, over: Record<string, unknown> = {}) => ({
  id, project_id: PROJECT_ID, category: 'travel', description, amount, date: '2026-03-10', month: 3, approval_status: 'approved',
  is_vat_exempt: true, fund_id: FUND_ID, custody_id: null, resource_id: RESOURCE_ID, user_id: USER_ID, created_at: '2026-03-10T00:00:00Z', ...over,
});
const rows = {
  resources: [{ id: RESOURCE_ID, project_id: PROJECT_ID, name: 'سارة المهندسة', role: 'مهندسة', monthly_cost: 9000, user_id: USER_ID, created_at: '2026-01-01T00:00:00Z' }],
  expenses: [
    expense('ex-t1', 'تذاكر سفر', 5000),
    expense('ex-t2', 'فندق', 2000, { approval_status: 'pending' }),
    expense('ex-t3', 'مرفوض', 1000, { approval_status: 'rejected' }),
  ],
};
async function openExplorer(page: Page) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'المالية' }).click();
  // The explorer's own card: the consistency chart beside it names the same resources.
  const region = page.getByRole('region', { name: 'المصروفات' }).locator('div.stat-card', { hasText: 'مستكشف الصرف — تجميع متعدد المستويات' });
  await expect(region.getByText('مستكشف الصرف — تجميع متعدد المستويات')).toBeVisible();
  return region;
}
// A node's toggle names the label and its meta line; the card is two levels above the toggle.
const node = (region: ReturnType<Page['getByRole']>, label: string) =>
  region.getByRole('button', { name: new RegExp(`^${label} `) }).locator('..').locator('..');

test('groups the spend by resource with totals, counts, pending called out and rejected kept out, and the search narrows it', async ({ page }) => {
  await stubSupabase(page, rows);
  const region = await openExplorer(page);
  const sara = node(region, 'سارة المهندسة');
  await expect(sara).toContainText('المورد (الفريق) · 3 مصروفات');
  await expect(sara).toContainText('7,000.00 ر.س');
  await expect(sara).toContainText('قيد الاعتماد: 2,000.00 ر.س');
  const none = node(region, 'غير محدّد');
  await expect(none).toContainText('مصروف واحد');
  await expect(none).toContainText('12,000.00 ر.س');
  await expect(region.getByText('مرفوض (خارج الإجمالي)').locator('..')).toContainText('1,000.00 ر.س');

  await sara.getByRole('button').first().click();
  await expect(node(region, 'سفر وتنقل')).toContainText('الفئة · 3 مصروفات');

  await region.getByPlaceholder('اسم مورد، جهة، وصف، رقم فاتورة…').fill('فندق');
  await expect(node(region, 'سارة المهندسة')).toContainText('مصروف واحد');
  await expect(node(region, 'سارة المهندسة')).toContainText('2,000.00 ر.س');
  await expect(region.getByRole('button', { name: /^غير محدّد / })).toHaveCount(0);
});

test('sharing puts the view in the URL so a reload restores it, and the export carries the tree', async ({ page }) => {
  await stubSupabase(page, rows);
  const region = await openExplorer(page);
  await region.getByPlaceholder('اسم مورد، جهة، وصف، رقم فاتورة…').fill('فندق');
  await region.getByRole('button', { name: 'نسخ رابط التقرير' }).click();
  await expect(page).toHaveURL(/sv=1/);
  await expect(page).toHaveURL(/dims=resource%2Ccategory%2CbudgetItem/);
  await expect(page).toHaveURL(/q=%D9%81%D9%86%D8%AF%D9%82/);
  // The address must also say where the explorer is, or the link opens on the summary tab without it.
  await expect(page).toHaveURL(/group=finance/);
  await expect(page).toHaveURL(/tab=expenses/);

  await page.reload();
  const again = page.getByRole('region', { name: 'المصروفات' }).locator('div.stat-card', { hasText: 'مستكشف الصرف — تجميع متعدد المستويات' });
  await expect(again.getByText('مستكشف الصرف — تجميع متعدد المستويات')).toBeVisible();
  await expect(again.getByPlaceholder('اسم مورد، جهة، وصف، رقم فاتورة…')).toHaveValue('فندق');
  await expect(node(again, 'سارة المهندسة')).toContainText('2,000.00 ر.س');

  const download = page.waitForEvent('download');
  await again.getByRole('button', { name: /تصدير CSV/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^spend-resource-category-budgetItem-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = readFileSync(await file.path() as string, 'utf8');
  expect(csv).toContain('مشروع الاختبار,المورد (الفريق) ← الفئة ← بند الموازنة,');
  expect(csv).toContain('المستوى,البُعد,المسار,الاسم,الإجمالي,معتمد,قيد الاعتماد,مرفوض,عدد,النسبة %,من,إلى');
  expect(csv).toContain('1,المورد (الفريق),سارة المهندسة,سارة المهندسة,2000,0,2000,0,1,100.0,2026-03-10,2026-03-10');
  expect(csv).toContain('الإجمالي العام,2000');
});
