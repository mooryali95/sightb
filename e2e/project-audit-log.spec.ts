import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID, USER_ID } from './support/seed';

/**
 * The project's own operations log on the management tab, for admins.
 * It asks for the project's rows alone, newest first, and reads each in
 * words: a deletion with what the row held, an insertion likewise, an
 * update by the fields that changed with the old value struck through,
 * and an update without snapshots as unavailable.
 */
const OTHER_PROJECT = '11111111-1111-4111-8111-111111111199';
const row = (id: string, action: string, table_name: string, record_data: unknown, created_at: string, project_id = PROJECT_ID) => ({
  id, user_id: USER_ID, action, table_name, record_id: `${id}-rec`, record_data, project_id, created_at,
});
const LOG = [
  row('al-1', 'delete', 'expenses', { description: 'وقود قديم', amount: 800, category: 'travel', resource_name: 'سامي' }, '2026-09-18T09:00:00Z'),
  row('al-2', 'update', 'budget_items', { old: { id: 'b', planned_amount: 400000, description: 'بند المواد' }, new: { id: 'b', planned_amount: 350000, description: 'بند المواد' } }, '2026-09-17T09:00:00Z'),
  row('al-3', 'insert', 'custodies', { resource_name: 'عهدة سامي', amount: 8000 }, '2026-09-16T09:00:00Z'),
  row('al-4', 'update', 'expenses', {}, '2026-09-15T09:00:00Z'),
  row('al-5', 'delete', 'revenues', { description: 'إيراد مشروع آخر', amount: 5 }, '2026-09-19T09:00:00Z', OTHER_PROJECT),
];

async function openLog(page: Page) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'الإدارة' }).click();
  const header = page.getByRole('button', { name: 'السجل', exact: true });
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
  const region = page.getByRole('region', { name: 'السجل' });
  await expect(region.getByText('سجل العمليات')).toBeVisible();
  return region;
}

test('reads the project\'s own operations in words, newest first', async ({ page }) => {
  await stubSupabase(page, { audit_log: LOG });
  const region = await openLog(page);
  const entries = region.locator('div.rounded-lg.border');
  await expect(entries).toHaveCount(4);
  await expect(region.getByText('إيراد مشروع آخر')).toHaveCount(0);

  await expect(entries.nth(0)).toContainText('حذف مصروف');
  await expect(entries.nth(0)).toContainText('الوصف: وقود قديم');
  await expect(entries.nth(0)).toContainText('المستلم: سامي');
  await expect(entries.nth(0)).toContainText('المبلغ: 800.00 ر.س');
  await expect(entries.nth(0)).toContainText('الفئة: سفر وتنقل');

  await expect(entries.nth(1)).toContainText('تعديل بند موازنة');
  await expect(entries.nth(1)).toContainText('المبلغ المخطط:');
  await expect(entries.nth(1).locator('span.line-through')).toHaveText('400,000');
  await expect(entries.nth(1).locator('span.font-medium').last()).toHaveText('350,000');
  await expect(entries.nth(1)).not.toContainText('الوصف:');

  await expect(entries.nth(2)).toContainText('إضافة عهدة');
  await expect(entries.nth(2)).toContainText('المستلم: عهدة سامي');
  await expect(entries.nth(2)).toContainText('المبلغ: 8,000.00 ر.س');

  await expect(entries.nth(3)).toContainText('تعديل مصروف');
  await expect(entries.nth(3)).toContainText('بيانات التعديل غير متوفرة');
});

test('says so when the project has no operations yet', async ({ page }) => {
  await stubSupabase(page, { audit_log: [LOG[4]] });
  const region = await openLog(page);
  await expect(region.getByText('لا توجد عمليات مسجلة')).toBeVisible();
});
