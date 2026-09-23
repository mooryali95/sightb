import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { COMPANY_ID, PROJECT_ID, USER_ID, seed } from './support/seed';

/**
 * The global search in the header. Opened from its button or with the
 * keyboard shortcut, it lists live companies, portfolios and projects
 * under their headings, each project and portfolio with its company;
 * an archived company is left out; typing narrows the list and says
 * when nothing matches; choosing a result goes to its page.
 */
const ARCHIVED = '22222222-2222-4222-8222-222222222266';
const PORTFOLIO_ID = '77777777-7777-4777-8777-777777777711';
const rows = {
  companies: [{ ...seed.companies[0], id: ARCHIVED, name: 'شركة مؤرشفة', status: 'archived' }],
  portfolios: [{ id: PORTFOLIO_ID, company_id: COMPANY_ID, user_id: USER_ID, name: 'محفظة التطوير', description: null, target_revenue: 0, target_margin: 0, fiscal_year: null, notes: null, created_at: '2026-01-01T00:00:00Z' }],
  projects: [{ ...seed.projects[0], id: 'p-2', portfolio_id: PORTFOLIO_ID, name: 'مشروع الميناء' }],
};
async function openDashboard(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'إدارة الشركات' })).toBeVisible();
}
// The command palette is the cmdk root holding the search box; the sidebar has a search box of its own.
const dialog = (page: Page) => page.locator('[cmdk-root]').filter({ has: page.getByPlaceholder('ابحث عن شركة، محفظة أو مشروع...') });
const heading = (page: Page, text: string) => dialog(page).locator('[cmdk-group-heading]', { hasText: text });

test('lists live companies, portfolios and projects under their headings, and goes to the chosen one', async ({ page }) => {
  await stubSupabase(page, rows);
  await openDashboard(page);
  await page.getByRole('button', { name: /بحث\.\.\./ }).click();
  await expect(dialog(page).getByPlaceholder('ابحث عن شركة، محفظة أو مشروع...')).toBeVisible();

  await expect(heading(page, 'الشركات')).toBeVisible();
  await expect(heading(page, 'المحافظ')).toBeVisible();
  await expect(heading(page, 'المشاريع')).toBeVisible();
  // The company once as its own item, and again under the portfolio and the two projects.
  await expect(dialog(page).getByRole('option', { name: /^شركة الاختبار/ })).toHaveCount(1);
  await expect(dialog(page).getByText('شركة الاختبار', { exact: true })).toHaveCount(4);
  await expect(dialog(page).getByText('شركة مؤرشفة', { exact: true })).toHaveCount(0);
  await expect(dialog(page).getByRole('option', { name: /^محفظة التطوير/ })).toContainText('شركة الاختبار');
  await expect(dialog(page).getByRole('option', { name: /^مشروع الميناء/ })).toContainText('شركة الاختبار');

  await dialog(page).getByRole('option', { name: /^مشروع الميناء/ }).click();
  await expect(page).toHaveURL(/\/project\/p-2$/);
  await expect(dialog(page)).toHaveCount(0);
});

test('the shortcut opens it, typing narrows it, and nothing matching says so', async ({ page }) => {
  await stubSupabase(page, rows);
  await openDashboard(page);
  await page.keyboard.press('Control+k');
  const input = dialog(page).getByPlaceholder('ابحث عن شركة، محفظة أو مشروع...');
  await expect(input).toBeVisible();

  await input.fill('الميناء');
  await expect(dialog(page).getByRole('option')).toHaveCount(1);
  await expect(dialog(page).getByRole('option').first()).toContainText('مشروع الميناء');
  // cmdk hides an emptied group rather than removing it.
  await expect(heading(page, 'الشركات')).toBeHidden();

  await input.fill('لا شيء هنا');
  await expect(dialog(page).getByText('لا توجد نتائج')).toBeVisible();
  await expect(dialog(page).getByRole('option')).toHaveCount(0);

  await input.fill('التطوير');
  await dialog(page).getByRole('option', { name: /^محفظة التطوير/ }).click();
  await expect(page).toHaveURL(new RegExp(`/portfolio/${PORTFOLIO_ID}$`));
});
