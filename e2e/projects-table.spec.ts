import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID, USER_ID, seed } from './support/seed';

/**
 * The projects table on the dashboard. Each row sets the effective
 * contract (change orders included), the counted spend, the spend rate
 * against the contract and the planned profit, a loss marked as one; the
 * title counts the rows under a filter; a filter that matches nothing
 * says so and offers to clear; a row opens the project.
 */
const project = (id: string, name: string, over: Record<string, unknown>) => ({ ...seed.projects[0], id, name, ...over });
const rows = {
  projects: [project('p-loss', 'مشروع خاسر', { contract_value: 200000 })],
  budget_items: [{ id: 'bi-loss', project_id: 'p-loss', category: 'other', description: 'خطة', planned_amount: 300000, month: null, created_at: '2026-01-01T00:00:00Z' }],
  change_orders: [{ id: 'co-1', project_id: PROJECT_ID, user_id: USER_ID, title: 'توسعة', description: null, amount_impact: 50000, schedule_impact_days: 0,
    status: 'approved', requested_by: null, approved_by: USER_ID, approved_at: '2026-04-01T00:00:00Z', skip_baseline: false, created_at: '2026-04-01T00:00:00Z' }],
  expenses: [
    // Rejected: never counted. Pending: counted.
    { id: 'ex-rej', project_id: PROJECT_ID, category: 'other', description: 'مرفوض', amount: 99000, date: '2026-03-02', month: 3, approval_status: 'rejected', is_vat_exempt: true, user_id: USER_ID, created_at: '2026-03-02T00:00:00Z' },
    { id: 'ex-pen', project_id: PROJECT_ID, category: 'other', description: 'معلّق', amount: 9000, date: '2026-03-03', month: 3, approval_status: 'pending', is_vat_exempt: true, user_id: USER_ID, created_at: '2026-03-03T00:00:00Z' },
  ],
};
async function openDashboard(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'إدارة الشركات' })).toBeVisible();
}
const table = (page: Page) => page.getByRole('heading', { name: /^(جميع المشاريع|المشاريع المصفاة)/ }).locator('..');
const row = (page: Page, name: string) => table(page).getByRole('row').filter({ hasText: name });

test('each row sets the effective contract, the counted spend, the spend rate and the profit, a loss marked', async ({ page }) => {
  await stubSupabase(page, rows);
  await openDashboard(page);
  await expect(page.getByRole('heading', { name: 'جميع المشاريع' })).toBeVisible();

  // 1,000,000 plus the approved 50,000; 12,000 plus the pending 9,000, never the rejected 99,000; 2% of the contract.
  const main = row(page, 'مشروع الاختبار');
  await expect(main).toContainText('1,050,000.00 ر.س');
  await expect(main).toContainText('21,000.00 ر.س');
  await expect(main).toContainText('2%');
  await expect(main.locator('.badge-profit')).toHaveText('650,000.00 ر.س');

  const loss = row(page, 'مشروع خاسر');
  await expect(loss).toContainText('200,000.00 ر.س');
  await expect(loss.locator('.badge-loss')).toHaveText('-100,000.00 ر.س');
  await expect(loss).toContainText('تشغيل');

  await main.click();
  await expect(page).toHaveURL(new RegExp(`/project/${PROJECT_ID}$`));
});

test('a filter counts the rows in the title, and one that matches nothing offers to clear', async ({ page }) => {
  await stubSupabase(page, rows);
  await openDashboard(page);
  await page.getByLabel('بحث عن المشاريع').fill('خاسر');
  await expect(page.getByRole('heading', { name: 'المشاريع المصفاة (1)' })).toBeVisible();
  await expect(row(page, 'مشروع الاختبار')).toHaveCount(0);

  await page.getByLabel('بحث عن المشاريع').fill('لا شيء');
  await expect(page.getByRole('heading', { name: 'المشاريع المصفاة (0)' })).toBeVisible();
  await expect(page.getByText('لا توجد مشاريع تطابق التصفية')).toBeVisible();
  await table(page).getByRole('button', { name: /مسح|إزالة/ }).click();
  await expect(page.getByRole('heading', { name: 'جميع المشاريع' })).toBeVisible();
  await expect(row(page, 'مشروع الاختبار')).toHaveCount(1);
});
