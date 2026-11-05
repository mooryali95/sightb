import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { seed } from './support/seed';

/**
 * The health matrix on the dashboard: every live project with any spend
 * or progress is a point at its spend rate against its completion,
 * coloured green when completion keeps pace with spend, amber within
 * seven tenths of it, red below; a project with neither is left out; the
 * matrix needs two points to show at all and follows the filter bar.
 */
const project = (id: string, name: string, percent_complete: number) => ({ ...seed.projects[0], id, name, percent_complete });
const budget = (id: string, project_id: string, planned_amount: number) => ({ id, project_id, category: 'other', description: 'خطة', planned_amount, month: null, created_at: '2026-01-01T00:00:00Z' });
const expense = (id: string, project_id: string, amount: number) => ({ ...seed.expenses[0], id, project_id, fund_id: null, amount, description: 'صرف' });
const rows = {
  projects: [project('p-green', 'مشروع أخضر', 60), project('p-amber', 'مشروع كهرماني', 75), project('p-red', 'مشروع أحمر', 50), project('p-idle', 'مشروع ساكن', 0)],
  budget_items: [budget('b-g', 'p-green', 100000), budget('b-a', 'p-amber', 100000), budget('b-r', 'p-red', 100000)],
  expenses: [expense('e-g', 'p-green', 50000), expense('e-a', 'p-amber', 100000), expense('e-r', 'p-red', 100000)],
};
const GREEN = 'hsl(160, 60%, 42%)';
const AMBER = 'hsl(38, 92%, 50%)';
const RED = 'hsl(0, 72%, 51%)';

async function openDashboard(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'إدارة الشركات' })).toBeVisible();
}
const matrix = (page: Page) => page.locator('div.stat-card', { has: page.getByRole('heading', { name: 'مصفوفة صحة المشاريع' }) }).first();
const points = (page: Page) => matrix(page).locator('path.recharts-symbols');

test('plots each live project with spend or progress at its rates, coloured by how completion keeps pace with spend', async ({ page }) => {
  await stubSupabase(page, rows);
  await openDashboard(page);
  await expect(matrix(page)).toBeVisible();
  await expect(matrix(page)).toContainText('المحور الأفقي: نسبة الصرف — المحور الرأسي: نسبة الإنجاز');
  // The seed's project and the three planned ones; the idle one is left out.
  await expect(points(page)).toHaveCount(4);
  // The points are coloured from the spend, which arrives after the projects: wait for the total to land.
  await expect(page.locator('div.stat-card', { has: page.getByText('إجمالي المصروفات', { exact: true }) }).first()).toContainText('262,000.00 ر.س');
  const fills = () => points(page).evaluateAll((els) => els.map((e) => e.getAttribute('fill')));
  await expect.poll(async () => (await fills()).filter((f) => f === GREEN).length).toBe(2);
  expect((await fills()).filter((f) => f === AMBER)).toHaveLength(1);
  expect((await fills()).filter((f) => f === RED)).toHaveLength(1);

  const tooltip = matrix(page).locator('div.rounded-lg.border.bg-card.text-xs');
  const hoverPoint = async (fill: string, nth = 0) => {
    await points(page).locator(`xpath=self::*[@fill="${fill}"]`).nth(nth).hover({ force: true });
  };
  await hoverPoint(AMBER);
  await expect(tooltip).toContainText('مشروع كهرماني');
  await expect(tooltip).toContainText('الصرف: 100% · الإنجاز: 75%');
  // The two points share a spend rate, so the amber tooltip can sit over the
  // red point; leave the chart before pointing at the next one.
  await page.mouse.move(0, 0);
  await hoverPoint(RED);
  await expect(tooltip).toContainText('مشروع أحمر');
  await expect(tooltip).toContainText('الصرف: 100% · الإنجاز: 50%');
  await page.mouse.move(0, 0);
});

test('needs two points, and follows the filter bar', async ({ page }) => {
  await stubSupabase(page, rows);
  await openDashboard(page);
  await expect(points(page)).toHaveCount(4);
  await page.getByLabel('بحث عن المشاريع').fill('أحمر');
  await expect(matrix(page)).toHaveCount(0);
  // Search ignores hamza, so "مشروع أ" also finds the seed's «مشروع الاختبار».
  await page.getByLabel('بحث عن المشاريع').fill('مشروع أ');
  await expect(points(page)).toHaveCount(3);
  await page.getByLabel('بحث عن المشاريع').fill('مشروع أح');
  await expect(matrix(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'مسح' }).click();
  await expect(points(page)).toHaveCount(4);
});

test('the seed alone is one point, so no matrix shows', async ({ page }) => {
  await stubSupabase(page);
  await openDashboard(page);
  await expect(page.getByRole('heading', { name: 'أداء المحافظ' }).or(page.getByRole('heading', { name: 'إدارة الشركات' })).first()).toBeVisible();
  await expect(matrix(page)).toHaveCount(0);
});
