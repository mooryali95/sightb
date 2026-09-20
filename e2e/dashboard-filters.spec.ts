import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { COMPANY_ID, USER_ID, seed } from './support/seed';

/**
 * The dashboard's filter bar. By default it shows the live projects of
 * live companies only, with no count line; showing the finished ones
 * counts n of m with the wider denominator; a status filter reaches a finished project on
 * its own; the search narrows by name; the badge counts the filters in
 * force and "clear" drops them all; and the period filter keeps the
 * expense card to the chosen span.
 */
const ARCHIVED_COMPANY = '22222222-2222-4222-8222-222222222277';
const project = (id: string, name: string, over: Record<string, unknown>) => ({ ...seed.projects[0], id, name, ...over });
const rows = {
  companies: [{ ...seed.companies[0], id: ARCHIVED_COMPANY, name: 'شركة مؤرشفة', status: 'archived' }],
  projects: [
    project('p-done', 'مشروع الأرشيف', { status: 'completed' }),
    project('p-gone', 'مشروع الشركة المؤرشفة', { company_id: ARCHIVED_COMPANY }),
  ],
};
async function openDashboard(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'إدارة الشركات' })).toBeVisible();
}
// The line may carry a suffix about active projects; the names show on the cards and in the table alike.
const count = (page: Page) => page.getByText(/^عرض \d+ من \d+ مشروع/);
const card = (page: Page, name: string) => page.getByText(name, { exact: true }).first();

test('shows live projects of live companies by default, and widens or narrows on request', async ({ page }) => {
  await stubSupabase(page, rows);
  await openDashboard(page);
  // No filter in force: no count line and no clear button, just the live project of the live company.
  await expect(card(page, 'مشروع الاختبار')).toBeVisible();
  await expect(card(page, 'مشروع الأرشيف')).toHaveCount(0);
  await expect(card(page, 'مشروع الشركة المؤرشفة')).toHaveCount(0);
  await expect(count(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'مسح' })).toHaveCount(0);

  await page.getByRole('button', { name: 'عرض المنتهية' }).click();
  await expect(count(page)).toContainText('عرض 2 من 3 مشروع');
  await expect(card(page, 'مشروع الأرشيف')).toBeVisible();
  await expect(card(page, 'مشروع الشركة المؤرشفة')).toHaveCount(0);

  await page.getByLabel('بحث عن المشاريع').fill('الأرشيف');
  await expect(count(page)).toContainText('عرض 1 من 3 مشروع');
  await expect(card(page, 'مشروع الاختبار')).toHaveCount(0);
  await expect(page.locator('span.rounded-full', { hasText: /^2$/ })).toBeVisible();

  await page.getByRole('button', { name: 'مسح' }).click();
  await expect(count(page)).toHaveCount(0);
  await expect(card(page, 'مشروع الاختبار')).toBeVisible();
  await expect(card(page, 'مشروع الأرشيف')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'مسح' })).toHaveCount(0);
});

test('a status filter reaches a finished project on its own, and the period keeps the expense card to the span', async ({ page }) => {
  await stubSupabase(page, rows);
  await openDashboard(page);
  await page.getByRole('combobox').filter({ hasText: 'جميع الحالات' }).click();
  await page.getByRole('option', { name: 'مكتمل' }).click();
  await expect(count(page)).toContainText('عرض 1 من 3 مشروع');
  await expect(card(page, 'مشروع الأرشيف')).toBeVisible();
  await expect(card(page, 'مشروع الاختبار')).toHaveCount(0);
  await page.getByRole('button', { name: 'مسح' }).click();

  // The seed's one expense is dated 2026-03-01: counted over all time, not this month.
  const expenses = page.getByText('إجمالي المصروفات', { exact: true }).locator('..').locator('..').locator('..');
  await expect(expenses).toContainText('12,000.00 ر.س');
  await page.getByRole('combobox').filter({ hasText: 'كل الفترات' }).click();
  await page.getByRole('option', { name: 'هذا الشهر' }).click();
  await expect(expenses).toContainText(/(^|[^\d,])0\.00 ر\.س/);
  await expect(expenses).not.toContainText('12,000.00 ر.س');
});
