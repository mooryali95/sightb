import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { USER_ID, seed } from './support/seed';

/**
 * A company's life on the dashboard. Creation trims the name and lands the
 * company active; archiving and reactivating each write only the status
 * and move the card between the two lists; permanent deletion asks first,
 * then clears the company's dependents before the company row itself.
 */
const SPARE_ID = '22222222-2222-4222-8222-222222222299';
const spare = { ...seed.companies[0], id: SPARE_ID, name: 'شركة للحذف' };
const writes = (wire: { writes: { method: string; table: string; body: unknown }[] }, table: string, method: string) =>
  wire.writes.filter((w) => w.table === table && w.method === method).map((w) => w.body as Record<string, unknown>);

async function openDashboard(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'إدارة الشركات' })).toBeVisible();
}
const companyRow = (page: Page, name: string) => page.locator('div.rounded-lg.border', { hasText: name }).first();

test('creating a company trims the name and lands it active on the dashboard', async ({ page }) => {
  const wire = await stubSupabase(page);
  await page.goto('/companies/new');
  await expect(page.getByRole('heading', { name: 'إضافة شركة جديدة' })).toBeVisible();
  await page.getByPlaceholder('مثال: شركة راز للاستشارات').fill('   ');
  await page.getByRole('button', { name: 'إضافة الشركة' }).click();
  await expect(page.getByText('اسم الشركة مطلوب')).toBeVisible();
  expect(writes(wire, 'companies', 'POST')).toHaveLength(0);

  await page.getByPlaceholder('مثال: شركة راز للاستشارات').fill('  شركة الأمل  ');
  await page.getByPlaceholder('وصف مختصر عن الشركة').fill('استشارات');
  await page.getByRole('button', { name: 'إضافة الشركة' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => writes(wire, 'companies', 'POST').length).toBe(1);
  expect(writes(wire, 'companies', 'POST')[0]).toMatchObject({ user_id: USER_ID, name: 'شركة الأمل', description: 'استشارات', logo: null, status: 'active' });
  await expect(page.getByRole('heading', { name: 'إدارة الشركات' })).toBeVisible();
  await expect(companyRow(page, 'شركة الأمل')).toContainText('نشطة');
});

test('archiving and reactivating each write only the status and move the card', async ({ page }) => {
  const wire = await stubSupabase(page);
  await openDashboard(page);
  await expect(page.getByText('الشركات المؤرشفة')).toHaveCount(0);
  await companyRow(page, 'شركة الاختبار').getByRole('button', { name: 'أرشفة' }).click();
  await expect(page.getByText('تم أرشفة "شركة الاختبار"')).toBeVisible();
  await expect.poll(() => writes(wire, 'companies', 'PATCH').length).toBe(1);
  expect(writes(wire, 'companies', 'PATCH')[0]).toStrictEqual({ status: 'archived' });
  await expect(page.getByText('الشركات المؤرشفة')).toBeVisible();
  await expect(companyRow(page, 'شركة الاختبار')).toContainText('مؤرشفة');

  await companyRow(page, 'شركة الاختبار').getByRole('button', { name: 'إعادة تفعيل' }).click();
  await expect(page.getByText('تم إعادة تفعيل "شركة الاختبار"')).toBeVisible();
  await expect.poll(() => writes(wire, 'companies', 'PATCH').length).toBe(2);
  expect(writes(wire, 'companies', 'PATCH')[1]).toStrictEqual({ status: 'active' });
  await expect(companyRow(page, 'شركة الاختبار')).toContainText('نشطة');
  await expect(page.getByText('الشركات المؤرشفة')).toHaveCount(0);
  expect(writes(wire, 'companies', 'DELETE')).toHaveLength(0);
});

test('deleting asks first, then clears the dependents before the company row', async ({ page }) => {
  const wire = await stubSupabase(page, { companies: [spare] });
  await openDashboard(page);
  const row = companyRow(page, 'شركة للحذف');
  await row.getByRole('button').last().click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm.getByRole('heading', { name: 'حذف الشركة' })).toBeVisible();
  await expect(confirm).toContainText('هل أنت متأكد من حذف "شركة للحذف"؟');
  await confirm.getByRole('button', { name: 'إلغاء' }).click();
  expect(wire.writes.filter((w) => w.method === 'DELETE')).toHaveLength(0);

  await row.getByRole('button').last().click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'حذف' }).click();
  await expect(page.getByText('تم حذف "شركة للحذف"')).toBeVisible();
  await expect.poll(() => wire.writes.filter((w) => w.method === 'DELETE').length).toBe(4);
  expect(wire.writes.filter((w) => w.method === 'DELETE').map((w) => w.table)).toEqual(['portfolios', 'indirect_costs', 'custodies', 'companies']);
  await expect(companyRow(page, 'شركة للحذف')).toHaveCount(0);
  await expect(companyRow(page, 'شركة الاختبار')).toBeVisible();
});
