import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { COMPANY_ID, PROJECT_ID, USER_ID, seed } from './support/seed';

/**
 * The smart alerts above the budget. The seed's project, 3% spent with a
 * 60% margin, is declared within healthy bounds. A project that has spent
 * 120% of its plan, holds a proposed change order and an open high-impact
 * risk raises one alert of each severity, counted in the chips; a chip
 * narrows the list to its severity, an empty severity says so, the header
 * collapses the list, and an alert's action opens the tab it names.
 */
const HOT_ID = 'aaaaaaaa-1111-4111-8111-aaaaaaaa1137';
const hot = {
  projects: [{ ...seed.projects[0], id: HOT_ID, name: 'مشروع ساخن', contract_value: 100000 }],
  budget_items: [{ id: 'bi-hot', project_id: HOT_ID, category: 'other', description: 'خطة', planned_amount: 50000, month: null, created_at: '2026-01-01T00:00:00Z' }],
  expenses: [{ ...seed.expenses[0], id: 'ex-hot', project_id: HOT_ID, fund_id: null, amount: 60000, description: 'صرف زائد' }],
  // Collected revenue above the spend keeps the cash-flow rule quiet, so each severity carries exactly one alert.
  revenues: [{ id: 'rv-hot', project_id: HOT_ID, user_id: USER_ID, description: 'دفعة', amount: 70000, date: '2026-03-01', month: 3, revenue_type: 'milestone', status: 'collected', invoice_number: null, invoice_date: null, collection_date: '2026-03-05', milestone_id: null, created_at: '2026-03-01T00:00:00Z' }],
  change_orders: [{ id: 'co-hot', project_id: HOT_ID, user_id: USER_ID, description: 'توسعة', change_type: 'scope_addition', amount_impact: 20000, duration_impact: 0, status: 'proposed', requested_by: 'العميل', approved_by: null, approved_date: null, budget_items_json: '[]', auto_rebaseline: false, created_at: '2026-02-01T00:00:00Z' }],
  risks: [{ id: 'rk-hot', project_id: HOT_ID, portfolio_id: null, user_id: USER_ID, title: 'خطر مرتفع', description: null, probability: 'medium', impact: 'high', financial_impact: 10000, category: 'financial', status: 'open', mitigation_plan: null, owner: null, created_at: '2026-02-01T00:00:00Z' }],
};

async function openBudget(page: Page, id: string, name: string) {
  await page.goto(`/project/${id}`);
  await expect(page.getByText(name).first()).toBeVisible();
  await page.getByRole('tab', { name: 'المالية' }).click();
  const header = page.getByRole('button', { name: 'الموازنة', exact: true });
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
}
// The collapse toggle is the card's only button without a label of its own.
const toggle = (card: ReturnType<Page['locator']>) => card.getByRole('button').filter({ hasText: /^$/ }).first();
const alerts = (page: Page) => page.locator('div.stat-card', { has: page.getByRole('heading', { name: 'التنبيهات الذكية' }) }).first();

test('a project within its bounds is told so', async ({ page }) => {
  await stubSupabase(page);
  await openBudget(page, PROJECT_ID, 'مشروع الاختبار');
  await expect(page.getByText('المشروع ضمن الحدود الصحية')).toBeVisible();
  await expect(page.getByText('لا توجد تنبيهات مالية أو إدارية تستوجب الانتباه حالياً')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'التنبيهات الذكية' })).toHaveCount(0);
});

test('an overspent project with a proposed order and an open high risk raises one alert of each severity, filtered by chip', async ({ page }) => {
  await stubSupabase(page, hot);
  await openBudget(page, HOT_ID, 'مشروع ساخن');
  const card = alerts(page);
  await expect(card).toBeVisible();
  await expect(card.getByRole('button', { name: 'الكل (3)' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'حرج (1)' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'تحذير (1)' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'تنبيه (1)' })).toBeVisible();

  await expect(card.getByText('تجاوز الموازنة المخططة', { exact: true })).toBeVisible();
  await expect(card).toContainText('الصرف الفعلي تجاوز الموازنة المخططة بنسبة 20.0%');
  await expect(card).toContainText('120.0%');
  await expect(card.getByText('1 مخاطر مرتفعة الأثر مفتوحة')).toBeVisible();
  await expect(card.getByText('1 أمر تغيير بانتظار الاعتماد')).toBeVisible();
  await expect(card.getByText('صافي التدفق النقدي سالب')).toHaveCount(0);

  await card.getByRole('button', { name: 'حرج (1)' }).click();
  await expect(card.getByText('تجاوز الموازنة المخططة', { exact: true })).toBeVisible();
  await expect(card.getByText('1 أمر تغيير بانتظار الاعتماد')).toHaveCount(0);
  await expect(card.getByText('1 مخاطر مرتفعة الأثر مفتوحة')).toHaveCount(0);
  await card.getByRole('button', { name: 'تنبيه (1)' }).click();
  await expect(card.getByText('1 أمر تغيير بانتظار الاعتماد')).toBeVisible();
  await expect(card.getByText('تجاوز الموازنة المخططة', { exact: true })).toHaveCount(0);
  await card.getByRole('button', { name: 'الكل (3)' }).click();
  await expect(card.getByText('تجاوز الموازنة المخططة', { exact: true })).toBeVisible();

  await toggle(card).click();
  await expect(card.getByText('تجاوز الموازنة المخططة', { exact: true })).toBeHidden();
  await expect(card.getByRole('button', { name: 'الكل (3)' })).toBeVisible();
  await toggle(card).click();
  await expect(card.getByText('تجاوز الموازنة المخططة', { exact: true })).toBeVisible();
});

test('an alert with an action opens the tab it names', async ({ page }) => {
  await stubSupabase(page, hot);
  await openBudget(page, HOT_ID, 'مشروع ساخن');
  const card = alerts(page);
  await card.getByRole('button', { name: 'راجع أوامر التغيير' }).click();
  await expect(page.getByRole('tab', { name: 'الإدارة' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'أوامر التغيير' })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('توسعة', { exact: true }).first()).toBeVisible();

  await openBudget(page, HOT_ID, 'مشروع ساخن');
  await alerts(page).getByRole('button', { name: 'راجع المخاطر' }).click();
  await expect(page.getByRole('button', { name: 'المخاطر', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('خطر مرتفع', { exact: true }).first()).toBeVisible();
});
