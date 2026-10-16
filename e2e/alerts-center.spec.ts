import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID, USER_ID, seed } from './support/seed';

/**
 * The alerts centre. The spend consistency chart in the control center
 * records, in the browser, any gap between spend before and after
 * repairs and any expense with no fund or custody behind it. The centre
 * lists what was recorded with the project linked, the figures and the
 * dimension; the search narrows it; marking an alert handled closes it
 * and hides it until the closed ones are shown; clearing empties the log.
 * A project whose every expense has a fund or a custody records nothing.
 */
const ALERTS_KEY = 'rouya.consistency-alerts.v1';
const unlinked = {
  id: 'ex-free', project_id: PROJECT_ID, category: 'transport', description: 'نقل بلا مصدر', amount: 7500, date: '2026-03-05', month: 3,
  approval_status: 'approved', is_vat_exempt: true, fund_id: null, custody_id: null, user_id: USER_ID, created_at: '2026-03-05T00:00:00Z',
};

// The chart that records alerts moved to the owner-only control center on
// 11 October, so alerts are recorded when the owner opens it.
const OWNER_ROLE = { id: 'role-owner-cc', user_id: USER_ID, role: 'owner', scope_type: 'system', scope_id: null };
async function visitExpenses(page: Page) {
  await page.goto('/control-center');
  await expect(page.getByRole('heading', { name: 'مركز الرقابة' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'حسب الفئة' })).toBeVisible();
}
const stored = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '[]') as unknown[], ALERTS_KEY);

test('an expense with no source is recorded on the project page and read, handled and cleared in the centre', async ({ page }) => {
  await stubSupabase(page, { user_roles: [OWNER_ROLE], expenses: [unlinked] });
  await visitExpenses(page);
  await expect.poll(() => stored(page).then((l) => l.length)).toBe(1);

  await page.goto('/alerts');
  await expect(page.getByRole('heading', { name: 'مركز التنبيهات' })).toBeVisible();
  await expect(page.getByText('1 تنبيه مفتوح')).toBeVisible();
  const row = page.locator('div.stat-card', { hasText: 'مصروفات بلا مصدر' });
  await expect(row).toHaveCount(1);
  await expect(row.getByRole('link', { name: 'مشروع الاختبار' })).toHaveAttribute('href', `/project/${PROJECT_ID}`);
  await expect(row.getByText('حسب المورد')).toBeVisible();
  await expect(row.getByText('7,500.00 ر.س (1)')).toBeVisible();
  await expect(row.getByText(/^0\.00 /)).toBeVisible();

  await page.getByPlaceholder('بحث باسم المشروع أو المورد…').fill('غير موجود');
  await expect(page.getByText('لا توجد تنبيهات اتساق مسجّلة.')).toBeVisible();
  await page.getByPlaceholder('بحث باسم المشروع أو المورد…').fill('الاختبار');
  await expect(row).toHaveCount(1);

  await row.getByRole('button', { name: 'تعليم كمُعالَج' }).click();
  await expect(page.getByText('لا توجد تنبيهات مفتوحة')).toBeVisible();
  await expect(page.getByText('لا توجد تنبيهات اتساق مسجّلة.')).toBeVisible();
  await page.getByRole('button', { name: 'إظهار المغلقة' }).click();
  await expect(row).toHaveCount(1);
  await expect(row.getByText(/^أُغلق في /)).toBeVisible();
  await expect(row.getByRole('button', { name: 'تعليم كمُعالَج' })).toHaveCount(0);

  await page.getByRole('button', { name: 'مسح السجل' }).click();
  await expect(page.getByText('لا توجد تنبيهات اتساق مسجّلة.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'مسح السجل' })).toHaveCount(0);
  expect(await stored(page)).toEqual([]);
});

test('a project whose spend all has a source, a fund or a custody, records nothing', async ({ page }) => {
  await stubSupabase(page, { user_roles: [OWNER_ROLE],
    custodies: [{ id: 'cu-x', project_id: PROJECT_ID, company_id: seed.projects[0].company_id, resource_id: null, resource_name: 'عهدة النقل', amount: 10000,
      date: '2026-03-01', received_date: '2026-03-01', status: 'active', source_fund_id: null, notes: null, closed_date: null, user_id: USER_ID, created_at: '2026-03-01T00:00:00Z' }],
    expenses: [{ ...unlinked, id: 'ex-cust', description: 'نقل من العهدة', amount: 2000, custody_id: 'cu-x' }],
  });
  await visitExpenses(page);
  await page.waitForTimeout(800);
  expect(await stored(page)).toEqual([]);
  await page.goto('/alerts');
  await expect(page.getByText('لا توجد تنبيهات مفتوحة')).toBeVisible();
  await expect(page.getByRole('button', { name: 'مسح السجل' })).toHaveCount(0);
});
