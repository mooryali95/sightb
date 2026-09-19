import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID, FUND_ID, USER_ID, seed } from './support/seed';

/**
 * The cash ledger on the funds tab. Its cards split what was transferred
 * between what the manager still holds, what custody holders hold, what
 * was spent directly or through custodies, and what went to resources
 * through paid requests. Its timeline lists every money event newest
 * first: a paid request that produced its own expense appears once, as
 * that expense, and a cash refund on an advance is an inflow. The
 * overview warns about spend and custodies with no fund behind them.
 */
const RESOURCE_ID = '99999999-9999-4999-8999-999999999901';
const stamp = { created_at: '2026-02-03T00:00:00Z', updated_at: '2026-02-20T00:00:00Z' };
const resource = { id: RESOURCE_ID, project_id: PROJECT_ID, name: 'سارة المهندسة', role: 'مهندسة', monthly_cost: 9000, user_id: USER_ID, created_at: '2026-01-01T00:00:00Z' };
const custody = (id: string, name: string, amount: number, over: Record<string, unknown> = {}) => ({
  id, project_id: PROJECT_ID, company_id: seed.projects[0].company_id, resource_id: null, resource_name: name,
  amount, date: '2026-02-10', received_date: '2026-02-10', status: 'active', source_fund_id: FUND_ID, notes: null, closed_date: null,
  user_id: USER_ID, created_at: '2026-02-10T00:00:00Z', ...over,
});
const expense = (id: string, description: string, amount: number, date: string, over: Record<string, unknown> = {}) => ({
  id, project_id: PROJECT_ID, category: 'transport', description, amount, date, month: 2, approval_status: 'approved',
  is_vat_exempt: true, fund_id: null, custody_id: null, user_id: USER_ID, created_at: `${date}T00:00:00Z`, ...over,
});
// Paid from fund #1, with its own expense, and 2,000 of it refunded in cash.
const paidAdvance = {
  id: 'pr-1', project_id: PROJECT_ID, resource_id: RESOURCE_ID, request_type: 'advance', amount: 10000, currency: 'ر.س',
  description: 'سلفة تشغيل', justification: null, linked_reimbursement_ids: [], linked_fund_id: null, paid_from_fund_id: FUND_ID,
  paid_from_custody_id: null, budget_item_id: null, priority: 'normal', status: 'paid', requested_by: USER_ID,
  requested_at: '2026-02-03T00:00:00Z', reviewed_by: null, reviewed_at: null, review_notes: null, approved_by: USER_ID,
  approved_at: '2026-02-04T00:00:00Z', approval_notes: null, scheduled_date: null, paid_date: '2026-02-05', payment_method: 'cash',
  payment_reference: null, payment_attachments: [], rejection_reason: null, auto_created_expense_id: 'ex-pr',
  is_advance_outstanding: true, advance_settled_at: null, advance_settled_by: null, settlement_type: null, settled_amount: null,
  refunded_amount: 2000, ...stamp,
};

async function openLedger(page: Page) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'المالية' }).click();
  const header = page.getByRole('button', { name: 'الدفعات', exact: true });
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
  await expect(page.getByText('إجمالي ما تحوّل')).toBeVisible();
  return page.getByRole('region', { name: 'الدفعات' });
}
const card = (page: Page, title: string) => page.getByText(title, { exact: true }).locator('..').locator('..');

test('the cards split the transfer and the timeline lists each money event once, newest first', async ({ page }) => {
  await stubSupabase(page, {
    resources: [resource],
    custodies: [custody('cu-1', 'عهدة سامي', 8000)],
    expenses: [
      expense('ex-cu', 'وقود', 3000, '2026-02-12', { custody_id: 'cu-1' }),
      expense('ex-pr', 'سلفة تشغيل', 10000, '2026-02-05', { fund_id: FUND_ID, resource_id: RESOURCE_ID }),
    ],
    payment_requests: [paidAdvance],
  });
  const region = await openLedger(page);

  await expect(card(page, 'إجمالي ما تحوّل')).toContainText('50,000.00 ر.س');
  await expect(card(page, 'إجمالي ما تحوّل')).toContainText('1 دفعة · 1 مفتوحة');
  await expect(card(page, 'بيد حاملي العُهد')).toContainText('5,000.00 ر.س');
  await expect(card(page, 'مصروف موثّق')).toContainText('عُهد 3,000.00 ر.س');
  await expect(card(page, 'مدفوع لمستحقات موارد')).toContainText('10,000.00 ر.س');
  await expect(region.getByText(/غير مربوطة بدفعة/)).toHaveCount(0);
  await expect(region.getByText(/غير مرتبط بأي دفعة أو عهدة/)).toHaveCount(0);

  // Seven events: the fund, the custody, three expenses, the refund and the draft settlement. The paid request is its expense.
  await region.getByRole('tab', { name: 'العمليات (7)' }).click();
  const items = region.getByRole('listitem');
  await expect(items).toHaveCount(7);
  await expect(items.locator('p.font-medium')).toHaveText([
    'تسوية دفعة — مسودة', 'مواد أساسية', 'رد سلفة نقدية من سارة المهندسة', 'وقود', 'عهدة لـ عهدة سامي', 'سلفة تشغيل', 'دفعة #1 — مُقَرّ بالاستلام',
  ]);
  const advance = items.filter({ hasText: 'سلفة تشغيل' });
  await expect(advance).toHaveCount(1);
  await expect(advance).toContainText('طلب صرف سلفة — سارة المهندسة');
  await expect(advance).toContainText('من طلب صرف');
  await expect(advance).toContainText('−10,000.00 ر.س');
  const refund = items.filter({ hasText: 'رد سلفة نقدية' });
  await expect(refund).toContainText('رد جزئي — متبقي 8,000.00 ر.س');
  await expect(refund).toContainText('+2,000.00 ر.س');
  await expect(items.filter({ hasText: 'وقود' })).toContainText('من عهدة عهدة سامي');
  await expect(items.filter({ hasText: 'عهدة لـ عهدة سامي' })).toContainText('من دفعة #1');
  await expect(items.filter({ hasText: 'مواد أساسية' })).toContainText('مباشر من الدفعة');
  await expect(items.filter({ hasText: 'دفعة #1 — مُقَرّ بالاستلام' })).toContainText('+50,000.00 ر.س');
});

test('the overview warns about spend and custodies with nothing behind them', async ({ page }) => {
  await stubSupabase(page, {
    custodies: [custody('cu-free', 'عهدة طليقة', 4000, { source_fund_id: null })],
    expenses: [expense('ex-free', 'نقل بلا مصدر', 7500, '2026-02-15')],
  });
  const region = await openLedger(page);
  await expect(region.getByText('⚠️ 1 عُهدة غير مربوطة بدفعة (إجمالي 4,000.00 ر.س).')).toBeVisible();
  await expect(region.getByText('⚠️ 1 مصروف غير مرتبط بأي دفعة أو عهدة (إجمالي 7,500.00 ر.س).')).toBeVisible();
  await region.getByRole('tab', { name: 'العمليات (5)' }).click();
  await expect(region.getByRole('listitem').filter({ hasText: 'نقل بلا مصدر' })).toContainText('غير مربوط');
  await expect(region.getByRole('listitem').filter({ hasText: 'عهدة طليقة' })).toContainText('غير مربوطة بدفعة');
});
