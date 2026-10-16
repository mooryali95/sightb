import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { COMPANY_ID, PROJECT_ID, USER_ID, seed } from './support/seed';

/**
 * The company page's figures and its project lists. The contracts, the
 * spend and the net profit after indirect costs roll the company's
 * projects up; a project on hold counts as troubled; the standalone
 * cards read each project's counted spend; finished projects stay hidden
 * behind their count until asked for; a card opens the project.
 */
const project = (id: string, name: string, over: Record<string, unknown>) => ({ ...seed.projects[0], id, name, ...over });
const rows = {
  projects: [
    project('p-hold', 'مشروع معلق', { status: 'on-hold', contract_value: 300000 }),
    project('p-done', 'مشروع منتهٍ', { status: 'completed', contract_value: 100000 }),
  ],
  budget_items: [{ id: 'bi-hold', project_id: 'p-hold', category: 'other', description: 'خطة', planned_amount: 100000, month: null, created_at: '2026-01-01T00:00:00Z' }],
  expenses: [
    { id: 'ex-hold', project_id: 'p-hold', category: 'other', description: 'صرف', amount: 40000, date: '2026-03-05', month: 3, approval_status: 'approved', is_vat_exempt: true, user_id: USER_ID, created_at: '2026-03-05T00:00:00Z' },
    { id: 'ex-rej', project_id: PROJECT_ID, category: 'other', description: 'مرفوض', amount: 70000, date: '2026-03-06', month: 3, approval_status: 'rejected', is_vat_exempt: true, user_id: USER_ID, created_at: '2026-03-06T00:00:00Z' },
  ],
  indirect_costs: [{ id: 'ic-1', company_id: COMPANY_ID, user_id: USER_ID, name: 'إيجار المكتب', category: 'rent', amount: 50000, period: '2026-03', notes: null, created_at: '2026-03-01T00:00:00Z' }],
};
async function openCompany(page: Page) {
  await page.goto(`/company/${COMPANY_ID}`);
  await expect(page.getByRole('heading', { name: 'شركة الاختبار' })).toBeVisible();
}
const stat = (page: Page, title: string) => page.getByText(title, { exact: true }).locator('..').locator('..').locator('..');

test('rolls the projects up, nets the indirect costs off the profit, and counts the project on hold as troubled', async ({ page }) => {
  await stubSupabase(page, rows);
  await openCompany(page);
  // 1,000,000 + 300,000 + 100,000 of contracts; 12,000 + 40,000 counted, the rejected 70,000 not.
  await expect(stat(page, 'قيمة العقود الفعّالة')).toContainText('1,400,000.00 ر.س');
  await expect(stat(page, 'المصروف الفعلي')).toContainText('52,000.00 ر.س');
  // Planned profit 600,000 + 200,000 + 100,000 (no plan) less 50,000 of rent.
  await expect(stat(page, 'صافي الربح بعد غير المباشرة')).toContainText('850,000.00 ر.س');
  await expect(stat(page, 'مشاريع متعثرة')).toContainText('1');
});

test('the standalone cards read each project\'s counted spend, hide the finished until asked, and open the project', async ({ page }) => {
  await stubSupabase(page, rows);
  await openCompany(page);
  await expect(page.getByRole('heading', { name: 'مشاريع مستقلة (2)' })).toBeVisible();
  await expect(page.getByText('(1 منتهي)')).toBeVisible();
  await expect(page.getByText('مشروع منتهٍ', { exact: true })).toHaveCount(0);
  const hold = page.getByText('مشروع معلق', { exact: true }).locator('..').locator('..').locator('..');
  await expect(hold).toContainText('40,000.00 ر.س');
  await expect(hold).toContainText('معلق');
  const main = page.getByText('مشروع الاختبار', { exact: true }).locator('..').locator('..').locator('..');
  await expect(main).toContainText('12,000.00 ر.س');

  await page.getByRole('button', { name: 'عرض المنتهية' }).click();
  await expect(page.getByRole('heading', { name: 'مشاريع مستقلة (3)' })).toBeVisible();
  await expect(page.getByText('مشروع منتهٍ', { exact: true })).toBeVisible();
  await expect(page.getByText('(1 منتهي)')).toHaveCount(0);

  await page.getByText('مشروع معلق', { exact: true }).click();
  await expect(page).toHaveURL(/\/project\/p-hold$/);
});
