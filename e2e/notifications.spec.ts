import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID, USER_ID, seed } from './support/seed';

/**
 * The notification bell. It counts what needs attention across live
 * projects: a plan overspent, spend waiting for approval, a delayed
 * milestone; groups them by kind with a count; opens the project from
 * an item; dismissing one drops the count and holds across a reload,
 * and dismissing all leaves the empty state. A finished project raises
 * nothing.
 */
const project = (id: string, name: string, over: Record<string, unknown>) => ({ ...seed.projects[0], id, name, ...over });
const expense = (id: string, project_id: string, amount: number, approval_status: string) => ({
  id, project_id, category: 'other', description: 'صرف', amount, date: '2026-03-05', month: 3, approval_status, is_vat_exempt: true, user_id: USER_ID, created_at: '2026-03-05T00:00:00Z',
});
const rows = {
  projects: [project('p-over', 'مشروع متجاوز', {}), project('p-done', 'مشروع مكتمل', { status: 'completed' })],
  budget_items: [
    { id: 'bi-over', project_id: 'p-over', category: 'other', description: 'خطة', planned_amount: 10000, month: null, created_at: '2026-01-01T00:00:00Z' },
    { id: 'bi-done', project_id: 'p-done', category: 'other', description: 'خطة', planned_amount: 1000, month: null, created_at: '2026-01-01T00:00:00Z' },
  ],
  expenses: [expense('ex-o1', 'p-over', 12000, 'approved'), expense('ex-o2', 'p-over', 500, 'pending'), expense('ex-o3', 'p-over', 700, 'pending'), expense('ex-d', 'p-done', 5000, 'approved')],
  milestones: [{ id: 'ms-late', project_id: PROJECT_ID, name: 'التصميم', description: null, weight: 0.5, percent_complete: 20, status: 'delayed', sort_order: 1,
    planned_start: null, planned_end: null, actual_start: null, actual_end: null, linked_revenue_id: null, user_id: USER_ID, created_at: '2026-01-01T00:00:00Z' }],
};
async function openBell(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'إدارة الشركات' })).toBeVisible();
  await page.getByRole('button', { name: 'الإشعارات' }).click();
  const panel = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: /^الإشعارات/ }) });
  await expect(panel).toBeVisible();
  return panel;
}
const bell = (page: Page) => page.getByRole('button', { name: 'الإشعارات' });

test('counts and groups what needs attention on live projects, and opens the project from an item', async ({ page }) => {
  await stubSupabase(page, rows);
  await page.goto('/');
  await expect(bell(page)).toContainText('3');
  const panel = await openBell(page);
  await expect(panel.getByRole('heading', { name: 'الإشعارات · 3' })).toBeVisible();
  await expect(panel.getByText('تحذيرات الميزانية (1)')).toBeVisible();
  await expect(panel.getByText('بانتظار الاعتماد (1)')).toBeVisible();
  await expect(panel.getByText('مراحل متأخرة (1)')).toBeVisible();
  await expect(panel.getByText('تجاوز الميزانية: مشروع متجاوز')).toBeVisible();
  // Pending spend counts: 13,200 against the 10,000 plan.
  await expect(panel.getByText('132% من الموازنة')).toBeVisible();
  // Each kind is a collapsible group; the ones after the first open on request.
  await panel.getByRole('button', { name: 'بانتظار الاعتماد (1)' }).click();
  await expect(panel.getByText('مصروفان بانتظار الاعتماد')).toBeVisible();
  await panel.getByRole('button', { name: 'مراحل متأخرة (1)' }).click();
  await expect(panel.getByText('1 مرحلة متأخرة')).toBeVisible();
  await expect(panel.getByText('مشروع مكتمل')).toHaveCount(0);

  await panel.getByText('1 مرحلة متأخرة').click();
  await expect(page).toHaveURL(new RegExp(`/project/${PROJECT_ID}$`));
});

test('dismissing one holds across a reload, and dismissing all leaves the empty state', async ({ page }) => {
  await stubSupabase(page, rows);
  let panel = await openBell(page);
  await panel.getByText('تجاوز الميزانية: مشروع متجاوز').locator('..').locator('..').getByRole('button', { name: 'تجاهل' }).click();
  await expect(panel.getByRole('heading', { name: 'الإشعارات · 2' })).toBeVisible();
  await expect(panel.getByText('تجاوز الميزانية: مشروع متجاوز')).toHaveCount(0);

  await page.reload();
  await expect(bell(page)).toContainText('2');
  panel = await openBell(page);
  await expect(panel.getByText('تجاوز الميزانية: مشروع متجاوز')).toHaveCount(0);

  await panel.getByRole('button', { name: /الكل/ }).click();
  await expect(panel.getByText('لا توجد إشعارات جديدة ✓')).toBeVisible();
  await expect(bell(page)).not.toContainText(/\d/);
});
