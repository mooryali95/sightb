import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID, USER_ID, seed } from './support/seed';

/**
 * The dashboard's attention list and its top open risks. A project that
 * has spent past ninety percent of its plan, or is on hold, needs
 * attention and links to its page; the risks table lists the open ones
 * by financial impact, closed ones left out, and both follow the
 * project filters.
 */
const project = (id: string, name: string, over: Record<string, unknown>) => ({ ...seed.projects[0], id, name, ...over });
const risk = (id: string, project_id: string, title: string, financial_impact: number, status: string) => ({
  id, project_id, portfolio_id: null, user_id: USER_ID, title, description: null, probability: 'high', impact: 'high',
  financial_impact, category: 'financial', status, mitigation_plan: null, owner: null, created_at: '2026-02-01T00:00:00Z',
});
const rows = {
  projects: [project('p-burn', 'مشروع مستنزف', {}), project('p-hold', 'مشروع معلق', { status: 'on-hold' })],
  budget_items: [{ id: 'bi-burn', project_id: 'p-burn', category: 'other', description: 'خطة', planned_amount: 100000, month: null, created_at: '2026-01-01T00:00:00Z' }],
  expenses: [{ id: 'ex-burn', project_id: 'p-burn', category: 'other', description: 'صرف', amount: 95000, date: '2026-03-05', month: 3,
    approval_status: 'approved', is_vat_exempt: true, fund_id: null, custody_id: null, user_id: USER_ID, created_at: '2026-03-05T00:00:00Z' }],
  risks: [
    risk('r-1', PROJECT_ID, 'تأخر التوريد', 20000, 'open'),
    risk('r-2', 'p-hold', 'نزاع تعاقدي', 50000, 'mitigating'),
    risk('r-3', 'p-burn', 'ارتفاع الأسعار', 5000, 'open'),
    risk('r-4', PROJECT_ID, 'خطر مغلق', 90000, 'closed'),
  ],
};
async function openDashboard(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'إدارة الشركات' })).toBeVisible();
}
const attention = (page: Page) => page.getByRole('heading', { name: /^مشاريع تحتاج انتباه/ }).locator('..').locator('..');
const risks = (page: Page) => page.getByRole('heading', { name: 'أعلى المخاطر المفتوحة' }).locator('..').locator('..');

test('flags the project past ninety percent and the one on hold, and lists the open risks by impact', async ({ page }) => {
  await stubSupabase(page, rows);
  await openDashboard(page);
  await expect(page.getByRole('heading', { name: 'مشاريع تحتاج انتباه (2)' })).toBeVisible();
  await expect(attention(page)).toContainText('مشروع مستنزف');
  await expect(attention(page)).toContainText('95% صرف');
  await expect(attention(page)).toContainText('مشروع معلق');
  await expect(attention(page)).toContainText('معلق');
  await expect(attention(page)).not.toContainText('مشروع الاختبار');

  await expect(risks(page).getByRole('row').filter({ hasText: /خطر|نزاع|تأخر|ارتفاع/ })).toHaveCount(3);
  await expect(risks(page).getByRole('row').filter({ hasText: /نزاع|تأخر|ارتفاع/ }).locator('td:first-child')).toHaveText(['نزاع تعاقدي', 'تأخر التوريد', 'ارتفاع الأسعار']);
  await expect(risks(page)).toContainText('50,000.00 ر.س');
  await expect(risks(page)).not.toContainText('خطر مغلق');

  await attention(page).getByText('مشروع مستنزف').click();
  await expect(page).toHaveURL(new RegExp('/project/p-burn$'));
});

test('both follow the project filters', async ({ page }) => {
  await stubSupabase(page, rows);
  await openDashboard(page);
  await page.getByLabel('بحث عن المشاريع').fill('معلق');
  await expect(page.getByRole('heading', { name: 'مشاريع تحتاج انتباه (1)' })).toBeVisible();
  await expect(attention(page)).not.toContainText('مشروع مستنزف');
  await expect(risks(page).getByRole('row').filter({ hasText: /نزاع|تأخر|ارتفاع/ })).toHaveCount(1);
  await expect(risks(page)).toContainText('نزاع تعاقدي');
});
