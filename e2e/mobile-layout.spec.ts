import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { COMPANY_ID, PROJECT_ID, USER_ID, seed } from './support/seed';

/**
 * The layout on a phone. The header's search opens a bottom sheet with its
 * own query box that narrows the same results, clears on request, goes to
 * the chosen page, and forgets the query once closed. The menu button
 * slides the sidebar in and the overlay slides it out. On a project, a
 * floating button names the open group's primary action and opens its
 * section, absent on the summary and for a viewer.
 */
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const PORTFOLIO_ID = '77777777-7777-4777-8777-777777777741';
const rows = {
  portfolios: [{ id: PORTFOLIO_ID, company_id: COMPANY_ID, user_id: USER_ID, name: 'محفظة التطوير', description: null, target_revenue: 0, target_margin: 0, fiscal_year: null, notes: null, created_at: '2026-01-01T00:00:00Z' }],
  projects: [{ ...seed.projects[0], id: 'p-2', portfolio_id: PORTFOLIO_ID, name: 'مشروع الميناء' }],
};
const sidebar = (page: Page) => page.locator('aside').filter({ has: page.getByLabel('بحث في القائمة الجانبية') });
// The floating button is the page's one fixed round button; the sections carry add buttons of their own.
const fab = (page: Page) => page.locator('button.fixed.rounded-full');
const sheet = (page: Page) => page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'بحث سريع' }) });

async function openDashboard(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'إدارة الشركات' })).toBeVisible();
}

test('the search opens a bottom sheet that narrows, clears, goes to the chosen page and forgets the query', async ({ page }) => {
  await stubSupabase(page, rows);
  await openDashboard(page);
  await expect(page.getByRole('button', { name: /بحث\.\.\./ })).toBeHidden();
  await page.getByRole('button', { name: 'بحث', exact: true }).click();
  const box = sheet(page).getByPlaceholder('ابحث عن شركة، محفظة أو مشروع...');
  await expect(box).toBeVisible();
  await expect(box).toBeFocused();
  await expect(sheet(page).getByRole('option', { name: /^مشروع الميناء/ })).toContainText('شركة الاختبار');
  await expect(sheet(page).getByRole('option', { name: /^محفظة التطوير/ })).toBeVisible();
  await expect(sheet(page).getByRole('option', { name: /^شركة الاختبار/ })).toHaveCount(1);

  await box.fill('الميناء');
  await expect(sheet(page).getByRole('option')).toHaveCount(1);
  await expect(sheet(page).getByRole('option', { name: /^مشروع الميناء/ })).toBeVisible();
  await box.fill('لا شيء');
  await expect(sheet(page).getByText('لا توجد نتائج')).toBeVisible();
  await sheet(page).getByRole('button', { name: 'مسح' }).click();
  await expect(box).toHaveValue('');
  await expect(sheet(page).getByRole('option', { name: /^محفظة التطوير/ })).toBeVisible();

  // Closed without choosing, the sheet forgets the query; the page stays.
  await box.fill('الميناء');
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'بحث', exact: true }).click();
  await expect(sheet(page).getByPlaceholder('ابحث عن شركة، محفظة أو مشروع...')).toHaveValue('');
  await expect(sheet(page).getByRole('option', { name: /^مشروع الاختبار/ })).toBeVisible();

  await sheet(page).getByPlaceholder('ابحث عن شركة، محفظة أو مشروع...').fill('الميناء');
  await sheet(page).getByRole('option', { name: /^مشروع الميناء/ }).click();
  await expect(page).toHaveURL(/\/project\/p-2$/);
  await expect(sheet(page)).toHaveCount(0);
});

test('the menu button slides the sidebar in and the overlay slides it out', async ({ page }) => {
  await stubSupabase(page);
  await openDashboard(page);
  await expect(sidebar(page)).not.toBeInViewport();
  await page.getByRole('button', { name: 'القائمة', exact: true }).click();
  await expect(sidebar(page)).toBeInViewport();
  await expect(sidebar(page).getByRole('button', { name: 'شركة الاختبار', exact: true })).toBeVisible();
  await page.mouse.click(20, 400);
  await expect(sidebar(page)).not.toBeInViewport();
});

test("a project's floating button names the open group's action and opens its section, absent on the summary and for a viewer", async ({ page }) => {
  await stubSupabase(page);
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByRole('heading', { name: /مشروع الاختبار/ }).first()).toBeVisible();
  // The phone layout is detected after the first paint; its search button marks it settled.
  await expect(page.getByRole('button', { name: 'بحث', exact: true })).toBeVisible();
  await expect(fab(page)).toHaveCount(0);

  await page.getByRole('tab', { name: 'المالية' }).click();
  await expect(fab(page)).toHaveAttribute('aria-label', 'إضافة مصروف');
  await page.getByRole('tab', { name: 'الإدارة' }).click();
  await expect(fab(page)).toHaveAttribute('aria-label', 'إضافة خطر');
  await expect(page.getByRole('button', { name: 'المخاطر', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await fab(page).click();
  await expect(page).toHaveURL(/group=management&tab=risks|tab=risks&group=management/);
  await expect(page.getByRole('button', { name: 'المخاطر', exact: true })).toHaveAttribute('aria-expanded', 'true');
  // The tab strip has scrolled to its end; the summary tab is activated on press without scrolling back.
  await page.getByRole('tab', { name: 'الملخص' }).dispatchEvent('mousedown');
  await expect(page.getByRole('tab', { name: 'الملخص' })).toHaveAttribute('aria-selected', 'true');
  await expect(fab(page)).toHaveCount(0);

  await page.route('**/rest/v1/user_roles**', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify([{ id: 'r-viewer', user_id: USER_ID, role: 'viewer', scope_type: 'project', scope_id: PROJECT_ID }]),
  }));
  await page.goto(`/project/${PROJECT_ID}?group=finance&tab=expenses`);
  await expect(page.getByRole('heading', { name: /مشروع الاختبار/ }).first()).toBeVisible();
  await expect(page.getByRole('tab', { name: 'المالية' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'المصروفات', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await expect(fab(page)).toHaveCount(0);
});
