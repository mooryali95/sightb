import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { COMPANY_ID, PROJECT_ID, USER_ID, seed } from './support/seed';

/**
 * The dashboard's headline figures over a period, on a fixed calendar
 * date. The contract card adds the approved change orders and names the
 * original sum; the expenses card and the company chart count the same
 * counted expenses inside the period and compare with the period before;
 * the collected revenue card appears only under a period and compares
 * the same way, or says it has no previous figure; the projects card
 * counts the visible projects and the companies; the status pie counts
 * the visible projects by status.
 */
const PLAN_ID = 'dddddddd-1111-4111-8111-dddddddd1145';
const expense = (id: string, date: string, amount: number, approval_status = 'approved') => ({
  ...seed.expenses[0], id, project_id: PROJECT_ID, fund_id: null, date, month: Number(date.slice(5, 7)), amount, approval_status, description: `صرف ${date}`,
});
const revenue = (id: string, date: string, amount: number, status: string) => ({
  id, project_id: PROJECT_ID, user_id: USER_ID, description: `دفعة ${date}`, amount, date, month: Number(date.slice(5, 7)), revenue_type: 'milestone', status,
  invoice_number: null, invoice_date: null, collection_date: status === 'collected' ? date : null, milestone_id: null, created_at: '2026-01-01T00:00:00Z',
});
const rows = {
  projects: [
    { ...seed.projects[0], id: PLAN_ID, name: 'مشروع مخطط', status: 'planning', contract_value: 500000 },
    { ...seed.projects[0], id: 'p-done', name: 'مشروع منتهٍ', status: 'completed', contract_value: 900000 },
  ],
  expenses: [expense('ex-jun', '2026-06-05', 8000), expense('ex-may', '2026-05-20', 4000), expense('ex-may-r', '2026-05-10', 9000, 'rejected'), expense('ex-apr', '2026-04-10', 3000, 'pending')],
  revenues: [revenue('rv-jun', '2026-06-10', 30000, 'collected'), revenue('rv-may', '2026-05-15', 20000, 'collected'), revenue('rv-inv', '2026-06-12', 50000, 'invoiced')],
  change_orders: [{ id: 'co-ok', project_id: PROJECT_ID, user_id: USER_ID, description: 'توسعة', change_type: 'scope_addition', amount_impact: 20000, duration_impact: 0, status: 'approved', requested_by: 'العميل', approved_by: USER_ID, approved_date: '2026-02-01', budget_items_json: '[]', auto_rebaseline: false, created_at: '2026-02-01T00:00:00Z' }],
};

async function openDashboard(page: Page) {
  await page.clock.setFixedTime(new Date('2026-06-15T09:00:00Z'));
  await stubSupabase(page, rows);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'إدارة الشركات' })).toBeVisible();
}
const stat = (page: Page, title: string) => page.locator('div.stat-card', { has: page.getByText(title, { exact: true }) }).first();
async function choosePeriod(page: Page, current: string, next: string) {
  await page.getByRole('combobox').filter({ hasText: current }).click();
  await page.getByRole('option', { name: next }).click();
}

test('over all time: the contract with its change orders, every counted expense, the visible projects and their statuses', async ({ page }) => {
  await openDashboard(page);
  await expect(stat(page, 'قيمة العقود الفعّالة')).toContainText('1,520,000.00 ر.س');
  await expect(stat(page, 'قيمة العقود الفعّالة')).toContainText('الأصلية: 1,500,000.00 ر.س');
  await expect(stat(page, 'إجمالي المصروفات')).toContainText('27,000.00 ر.س');
  await expect(stat(page, 'إجمالي المصروفات')).not.toContainText('عن الفترة السابقة');
  await expect(stat(page, 'الربح المخطط')).toContainText('1,120,000.00 ر.س');
  await expect(stat(page, 'الربح المخطط')).toContainText('هامش: 73.7%');
  await expect(stat(page, 'إجمالي المشاريع')).toContainText('2');
  await expect(stat(page, 'إجمالي المشاريع')).toContainText('1 شركة · 0 محفظة');
  // Shown over all time too since 11 October, as the cash actually received.
  await expect(stat(page, 'الإيرادات المحصّلة')).toContainText('نقد مستلم فعلياً');

  const pie = page.locator('div.stat-card', { has: page.getByRole('heading', { name: 'حالة المشاريع' }) });
  await expect(pie.getByText('تشغيل: 1')).toBeVisible();
  await expect(pie.getByText('تخطيط: 1')).toBeVisible();
  await expect(pie.getByText(/مكتمل/)).toHaveCount(0);
  await expect(page.locator('div.stat-card', { has: page.getByRole('heading', { name: 'المصروفات حسب الشركة' }) }).getByText('شركة الاختبار')).toBeVisible();
});

test('under a period the expenses and the collected revenue keep to it and compare with the period before', async ({ page }) => {
  await openDashboard(page);
  await choosePeriod(page, 'كل الفترات', 'هذا الشهر');
  await expect(stat(page, 'إجمالي المصروفات')).toContainText('8,000.00 ر.س');
  await expect(stat(page, 'إجمالي المصروفات')).toContainText('↑ 100.0% عن الفترة السابقة');
  await expect(stat(page, 'الإيرادات المحصّلة')).toContainText('30,000.00 ر.س');
  await expect(stat(page, 'الإيرادات المحصّلة')).toContainText('↑ 50.0% عن الفترة السابقة');
  await expect(stat(page, 'قيمة العقود الفعّالة')).toContainText('1,520,000.00 ر.س');

  await choosePeriod(page, 'هذا الشهر', 'هذا الربع');
  // April to June: 8,000 + 4,000 + the pending 3,000, against the first quarter's 12,000.
  await expect(stat(page, 'إجمالي المصروفات')).toContainText('15,000.00 ر.س');
  await expect(stat(page, 'إجمالي المصروفات')).toContainText('↑ 25.0% عن الفترة السابقة');
  await expect(stat(page, 'الإيرادات المحصّلة')).toContainText('50,000.00 ر.س');
  await expect(stat(page, 'الإيرادات المحصّلة')).toContainText('نقد مستلم فعلياً');

  await choosePeriod(page, 'هذا الربع', 'هذه السنة');
  await expect(stat(page, 'إجمالي المصروفات')).toContainText('27,000.00 ر.س');
  await expect(stat(page, 'إجمالي المصروفات')).not.toContainText('عن الفترة السابقة');
});
