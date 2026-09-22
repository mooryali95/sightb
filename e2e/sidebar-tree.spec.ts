import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { COMPANY_ID, PROJECT_ID, USER_ID, seed } from './support/seed';

/**
 * The sidebar's company tree. A live company opens to its portfolios and
 * standalone projects; an archived company is left out; finished projects
 * stay behind a count until asked for and read struck through; the search
 * narrows the tree to matching names; a project opens its page; signing
 * out returns to the login page.
 */
const ARCHIVED = '22222222-2222-4222-8222-222222222255';
const PORTFOLIO_ID = '77777777-7777-4777-8777-777777777722';
const rows = {
  companies: [{ ...seed.companies[0], id: ARCHIVED, name: 'شركة مؤرشفة', status: 'archived' }],
  portfolios: [{ id: PORTFOLIO_ID, company_id: COMPANY_ID, user_id: USER_ID, name: 'محفظة التطوير', description: null, target_revenue: 0, target_margin: 0, fiscal_year: null, notes: null, created_at: '2026-01-01T00:00:00Z' }],
  projects: [
    { ...seed.projects[0], id: 'p-pf', portfolio_id: PORTFOLIO_ID, name: 'مشروع المحفظة' },
    { ...seed.projects[0], id: 'p-done', name: 'مشروع منتهٍ', status: 'completed' },
  ],
};
// The sidebar is the aside holding its own search box; a page may render asides of its own.
const sidebar = (page: Page) => page.locator('aside').filter({ has: page.getByLabel('بحث في القائمة الجانبية') });
async function openDashboard(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'إدارة الشركات' })).toBeVisible();
}
/** Opens a folded row; a row already open, or one that folds a moment after a page change, is waited for briefly. */
async function expand(page: Page, name: string) {
  const row = sidebar(page).getByRole('button', { name, exact: true }).locator('..');
  const toggle = row.getByRole('button', { name: 'توسيع' });
  await toggle.waitFor({ timeout: 3000 }).then(() => toggle.click()).catch(() => undefined);
}

test('opens a live company to its portfolio and projects, keeps the finished behind a count, and leaves the archived out', async ({ page }) => {
  await stubSupabase(page, rows);
  await openDashboard(page);
  const bar = sidebar(page);
  await expect(bar.getByRole('button', { name: 'شركة الاختبار', exact: true })).toBeVisible();
  await expect(bar.getByText('شركة مؤرشفة')).toHaveCount(0);

  await expand(page, 'شركة الاختبار');
  await expect(bar.getByRole('button', { name: 'محفظة التطوير', exact: true })).toBeVisible();
  await expect(bar.getByRole('button', { name: /^مشروع الاختبار/ })).toBeVisible();
  await expect(bar.getByText('مشروع منتهٍ')).toHaveCount(0);

  await bar.getByRole('button', { name: 'عرض المنتهية (1)' }).click();
  await expect(bar.getByText('مشروع منتهٍ')).toBeVisible();
  await expect(bar.getByText('مشروع منتهٍ')).toHaveClass(/line-through/);
  await bar.getByRole('button', { name: 'إخفاء المنتهية' }).click();
  await expect(bar.getByText('مشروع منتهٍ')).toHaveCount(0);

  await expand(page, 'محفظة التطوير');
  await expect(bar.getByRole('button', { name: /^مشروع المحفظة/ })).toBeVisible();
  await bar.getByRole('button', { name: /^مشروع المحفظة/ }).click();
  await expect(page).toHaveURL(/\/project\/p-pf$/);
  // The tree folds again on the new page; open the company back up to reach the portfolio.
  await expand(page, 'شركة الاختبار');
  await bar.getByRole('button', { name: 'محفظة التطوير', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/portfolio/${PORTFOLIO_ID}$`));
  await bar.getByRole('button', { name: 'شركة الاختبار', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/company/${COMPANY_ID}$`));
});

test('the search narrows the tree to matching names, and signing out returns to the login page', async ({ page }) => {
  await stubSupabase(page, rows);
  await openDashboard(page);
  const bar = sidebar(page);
  await bar.getByLabel('بحث في القائمة الجانبية').fill('المحفظة');
  await expect(bar.getByRole('button', { name: /^مشروع المحفظة/ })).toBeVisible();
  await expect(bar.getByRole('button', { name: /^مشروع الاختبار/ })).toHaveCount(0);
  await bar.getByLabel('بحث في القائمة الجانبية').fill('لا شيء');
  await expect(bar.getByRole('button', { name: 'شركة الاختبار', exact: true })).toHaveCount(0);

  await bar.getByRole('button', { name: 'تسجيل الخروج' }).click();
  await expect(page).toHaveURL(/\/login$/);
});
