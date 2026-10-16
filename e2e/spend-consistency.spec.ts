import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID, USER_ID, seed } from './support/seed';

/**
 * The spend consistency chart under the expenses. A repaired transfer's
 * amount inflated the custody's spend before the repair; the chart puts
 * it back, shared among the custody's expenses by weight, as the "before"
 * figure beside today's, by resource or by category. An expense with
 * neither a fund nor a custody is called out; a rejected one counts
 * nowhere. A row opens the comparison of its lines. With every expense
 * sourced and nothing repaired the chart says the figures agree.
 */
const SARA = 'aaaaaaaa-2222-4222-8222-aaaaaaaa2149';
const ALI = 'aaaaaaaa-3333-4333-8333-aaaaaaaa2149';
const resource = (id: string, name: string) => ({ id, project_id: PROJECT_ID, name, role: 'مهندس', monthly_cost: 9000, user_id: USER_ID, created_at: '2026-01-01T00:00:00Z' });
const expense = (id: string, category: string, amount: number, over: Record<string, unknown>) => ({
  ...seed.expenses[0], id, category, amount, description: `مصروف ${id}`, fund_id: null, custody_id: null, resource_id: null, ...over,
});
const rows = {
  resources: [resource(SARA, 'سارة'), resource(ALI, 'علي')],
  custodies: [{ id: 'cu-1', project_id: PROJECT_ID, company_id: seed.projects[0].company_id, resource_id: null, resource_name: 'عهدة سامي', amount: 8000, date: '2026-02-10', received_date: '2026-02-10', status: 'active', source_fund_id: null, notes: null, closed_date: null, user_id: USER_ID, created_at: '2026-02-10T00:00:00Z' }],
  expenses: [
    expense('ex-sara', 'consulting', 3000, { custody_id: 'cu-1', resource_id: SARA }),
    expense('ex-ali', 'travel', 1000, { custody_id: 'cu-1', resource_id: ALI }),
    expense('ex-loose', 'food', 500, {}),
    expense('ex-rej', 'food', 9000, { approval_status: 'rejected', resource_id: SARA }),
  ],
  // 2,000 of an orphan transfer into the custody, repaired: 1,500 of it fell on Sara's 3,000, 500 on Ali's 1,000.
  cash_transfer_repairs: [{
    id: 'rep-1', project_id: PROJECT_ID, transfer_id: 'ct-x', custody_id: 'cu-1', custody_name: 'عهدة سامي', amount: 2000, transfer_date: '2026-02-15',
    missing_fund_id: null, reason: 'تحويل بلا دفعة', before_snapshot: null, after_snapshot: null, performed_by: USER_ID, performed_by_email: 'e2e@example.com', created_at: '2026-09-19T12:00:00Z',
  }],
};

// Moved to the owner-only control center (/control-center) on 11 October,
// so the seeded user is also given the system owner role.
const OWNER_ROLE = { id: 'role-owner-cc', user_id: USER_ID, role: 'owner', scope_type: 'system', scope_id: null };
const asOwner = (rows: Record<string, unknown[]> = {}) => ({ ...rows, user_roles: [...(rows.user_roles ?? []), OWNER_ROLE] });

async function openChart(page: Page) {
  await page.goto('/control-center');
  await expect(page.getByRole('heading', { name: 'مركز الرقابة' })).toBeVisible();
  const card = page.locator('div.stat-card', { has: page.getByRole('heading', { name: 'اتساق الصرف — قبل/بعد الإصلاح' }) }).first();
  await expect(card).toBeVisible();
  return card;
}
const total = (card: ReturnType<Page['locator']>, label: string) => card.getByText(label, { exact: true }).locator('..');
const row = (card: ReturnType<Page['locator']>, label: string) => card.getByRole('button').filter({ hasText: new RegExp(`^${label}قبل`) });

test('puts the repaired amount back by resource and by category, calls out the unsourced spend, and leaves the rejected out', async ({ page }) => {
  await stubSupabase(page, asOwner(rows));
  const card = await openChart(page);
  await expect(card).toContainText('تم رصد اختلافات في أرقام الصرف');
  await expect(card).toContainText('فرق قبل/بعد الإصلاح: 2,000.00 ر.س');
  await expect(card).toContainText('مصروفات بلا دفعة أو عهدة: 500.00 ر.س (1 عملية) — غير محدّد');
  await expect(total(card, 'الإجمالي قبل')).toContainText('18,500.00 ر.س');
  await expect(total(card, 'الإجمالي بعد')).toContainText('16,500.00 ر.س');
  await expect(total(card, 'إجمالي الفجوة')).toContainText('2,000.00 ر.س');

  await expect(row(card, 'سارة')).toContainText('قبل: 4,500.00 ر.س');
  await expect(row(card, 'سارة')).toContainText('بعد: 3,000.00 ر.س');
  await expect(row(card, 'سارة')).toContainText('فرق: 1,500.00 ر.س');
  await expect(row(card, 'علي')).toContainText('قبل: 1,500.00 ر.س');
  await expect(row(card, 'علي')).toContainText('فرق: 500.00 ر.س');
  // The seed's fund-paid 12,000 and the loose 500 carry no resource.
  await expect(row(card, 'غير محدّد')).toContainText('بعد: 12,500.00 ر.س');
  await expect(row(card, 'غير محدّد')).toContainText('فرق: 0.00 ر.س');
  const order = await card.getByRole('button').filter({ hasText: /قبل:/ }).evaluateAll((els) => els.map((e) => e.querySelector('span')?.textContent));
  expect(order).toEqual(['سارة', 'علي', 'غير محدّد']);

  await card.getByRole('button', { name: 'حسب الفئة' }).click();
  await expect(row(card, 'استشارات')).toContainText('قبل: 4,500.00 ر.س');
  await expect(row(card, 'سفر وتنقل')).toContainText('قبل: 1,500.00 ر.س');
  await expect(row(card, 'مطاعم وضيافة')).toContainText('بعد: 500.00 ر.س');
  await expect(card).toContainText('مطاعم وضيافة: 500.00 ر.س (1)');
  await expect(total(card, 'الإجمالي بعد')).toContainText('16,500.00 ر.س');
});

test('a row opens the comparison of its lines before and after the repair', async ({ page }) => {
  await stubSupabase(page, asOwner(rows));
  const card = await openChart(page);
  await row(card, 'سارة').click();
  const panel = page.getByRole('dialog');
  await expect(panel.getByRole('heading', { name: 'مقارنة تفصيلية — سارة' })).toBeVisible();
  await expect(panel).toContainText('1 عنصر تغيّر من أصل 1');
  await expect(panel).toContainText('مصروف ex-sara');
  await expect(panel).toContainText('قبل: 4,500.00 ر.س');
  await expect(panel).toContainText('بعد: 3,000.00 ر.س');
  await expect(panel).toContainText('فرق: 1,500.00 ر.س');
  await expect(panel).not.toContainText('مصروف ex-rej');
  await expect(panel.getByRole('link', { name: /عرض سجل تنبيهات الاتساق/ })).toHaveAttribute('href', '/alerts');
});

test('with every expense sourced and nothing repaired the figures agree', async ({ page }) => {
  await stubSupabase(page, asOwner());
  const card = await openChart(page);
  await expect(card).toContainText('الأرقام متسقة');
  await expect(card).not.toContainText('تم رصد اختلافات');
  await expect(total(card, 'إجمالي الفجوة')).toContainText('0.00 ر.س');
});

test('an unsourced expense alone raises the warning, with no gap line', async ({ page }) => {
  await stubSupabase(page, asOwner({ expenses: [expense('ex-loose', 'food', 500, {})] }));
  const card = await openChart(page);
  await expect(card).toContainText('تم رصد اختلافات في أرقام الصرف');
  await expect(card).toContainText('مصروفات بلا دفعة أو عهدة: 500.00 ر.س (1 عملية) — غير محدّد');
  await expect(card).not.toContainText('فرق قبل/بعد الإصلاح');
  await expect(card).not.toContainText('الأرقام متسقة');
});
