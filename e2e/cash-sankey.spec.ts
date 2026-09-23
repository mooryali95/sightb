import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { FUND_ID, PROJECT_ID, USER_ID, seed } from './support/seed';

/**
 * The cash flow diagram under the funds. Every riyal is drawn from the
 * fund it left to where it went: to a custody directly or by transfer,
 * to an outstanding advance and on by refund to a returned node, to a direct expense, and
 * from a custody to the expenses paid out of it; a rejected expense and
 * the expense an advance itself created are not flows of their own. With
 * no money moved the card says so.
 */
const RESOURCE_ID = '99999999-9999-4999-8999-999999999948';
const stamp = { created_at: '2026-02-03T00:00:00Z', updated_at: '2026-02-20T00:00:00Z' };
const resource = { id: RESOURCE_ID, project_id: PROJECT_ID, name: 'سارة المهندسة', role: 'مهندسة', monthly_cost: 9000, user_id: USER_ID, created_at: '2026-01-01T00:00:00Z' };
const custody = { id: 'cu-1', project_id: PROJECT_ID, company_id: seed.projects[0].company_id, resource_id: null, resource_name: 'عهدة سامي', amount: 8000, date: '2026-02-10', received_date: '2026-02-10', status: 'active', source_fund_id: FUND_ID, notes: null, closed_date: null, user_id: USER_ID, created_at: '2026-02-10T00:00:00Z' };
const expense = (id: string, category: string, amount: number, over: Record<string, unknown> = {}) => ({
  id, project_id: PROJECT_ID, category, description: id, amount, date: '2026-02-12', month: 2, approval_status: 'approved',
  is_vat_exempt: true, fund_id: null, custody_id: null, user_id: USER_ID, created_at: '2026-02-12T00:00:00Z', ...over,
});
const paidAdvance = {
  id: 'pr-1', project_id: PROJECT_ID, resource_id: RESOURCE_ID, request_type: 'advance', amount: 10000, currency: 'ر.س',
  description: 'سلفة تشغيل', justification: null, linked_reimbursement_ids: [], linked_fund_id: null, paid_from_fund_id: FUND_ID,
  paid_from_custody_id: null, budget_item_id: null, priority: 'normal', status: 'paid', requested_by: USER_ID,
  requested_at: '2026-02-03T00:00:00Z', reviewed_by: null, reviewed_at: null, review_notes: null, approved_by: USER_ID,
  approved_at: '2026-02-04T00:00:00Z', approval_notes: null, scheduled_date: null, paid_date: '2026-02-05', payment_method: 'cash',
  payment_reference: null, payment_attachments: [], rejection_reason: null, auto_created_expense_id: 'ex-pr',
  is_advance_outstanding: true, advance_settled_at: null, advance_settled_by: null, settlement_type: null, settled_amount: null,
  refunded_amount: 2000, refund_to_fund_id: FUND_ID, refund_to_custody_id: null, ...stamp,
};
const rows = {
  resources: [resource],
  custodies: [custody],
  cash_transfers: [{ id: 'ct-1', project_id: PROJECT_ID, from_fund_id: FUND_ID, to_custody_id: 'cu-1', amount: 1000, transfer_date: '2026-02-15', notes: null, created_at: '2026-02-15T00:00:00Z' }],
  payment_requests: [paidAdvance],
  expenses: [
    expense('ex-cu', 'transport', 3000, { custody_id: 'cu-1' }),
    expense('ex-pr', 'transport', 10000, { fund_id: FUND_ID, resource_id: RESOURCE_ID }),
    expense('ex-rej', 'food', 9000, { fund_id: FUND_ID, approval_status: 'rejected' }),
  ],
};

async function openFunds(page: Page, id = PROJECT_ID) {
  await page.goto(`/project/${id}`);
  await page.getByRole('tab', { name: 'المالية' }).click();
  const header = page.getByRole('button', { name: 'الدفعات', exact: true });
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
  await page.waitForLoadState('networkidle');
}
const chart = (page: Page) => page.getByRole('heading', { name: 'مخطط تدفق النقد' }).locator('xpath=ancestor::div[2]').locator('.recharts-wrapper');

/** Hovers every link and returns each tooltip's text. */
async function flows(page: Page): Promise<string[]> {
  const links = chart(page).locator('path.recharts-sankey-link');
  const out: string[] = [];
  const tip = chart(page).locator('.recharts-tooltip-wrapper');
  for (let i = 0; i < await links.count(); i++) {
    // The links overlap where they fan out, so the pointer would reach whichever lies on top;
    // the event goes to each link itself instead.
    await links.nth(i).dispatchEvent('mouseover');
    await expect(tip).not.toHaveText('');
    out.push((await tip.innerText()).replace(/\s+/g, ' ').trim());
    await links.nth(i).dispatchEvent('mouseout');
  }
  return out;
}

test('draws each riyal from its fund to the custody, the advance, the refund, the direct expense, and from the custody to its expenses', async ({ page }) => {
  await stubSupabase(page, rows);
  await openFunds(page);
  await expect(page.getByRole('heading', { name: 'مخطط تدفق النقد' })).toBeVisible();
  const c = chart(page);
  await c.scrollIntoViewIfNeeded();
  // A cycle leaves the layout unplaceable: every link's path then carries NaN and draws nothing.
  const paths = await c.locator('path.recharts-sankey-link').evaluateAll((els) => els.map((e) => e.getAttribute('d') ?? ''));
  expect(paths).toHaveLength(6);
  expect(paths.filter((d) => d.includes('NaN'))).toEqual([]);
  for (const node of ['دفعة 1', 'عهدة: عهدة سامي', 'سلفة: سارة المهندسة', 'مرتجع إلى دفعة 1', 'مصروف: materials', 'مصروف: transport']) {
    await expect(c.locator('svg text').filter({ hasText: new RegExp(`^${node}$`) })).toHaveCount(1);
  }
  await expect(c.locator('svg text').filter({ hasText: 'مصروف: food' })).toHaveCount(0);

  const seen = await flows(page);
  expect(seen).toContain('دفعة 1 - عهدة: عهدة سامي : 8,000.00 ر.س');
  expect(seen).toContain('دفعة 1 - عهدة: عهدة سامي : 1,000.00 ر.س');
  expect(seen).toContain('دفعة 1 - سلفة: سارة المهندسة : 10,000.00 ر.س');
  // The refund lands in a node of its own: a link back into the fund would be a cycle the layout cannot place.
  expect(seen).toContain('سلفة: سارة المهندسة - مرتجع إلى دفعة 1 : 2,000.00 ر.س');
  expect(seen).toContain('دفعة 1 - مصروف: materials : 12,000.00 ر.س');
  expect(seen).toContain('عهدة: عهدة سامي - مصروف: transport : 3,000.00 ر.س');
  // The advance's own expense is the advance already drawn, not a second flow.
  expect(seen).not.toContain('دفعة 1 - مصروف: transport : 10,000.00 ر.س');
  expect(seen).toHaveLength(6);
});

test('with no money moved the card says so', async ({ page }) => {
  await stubSupabase(page, { projects: [{ ...seed.projects[0], id: 'p-empty', name: 'مشروع فارغ' }] });
  await openFunds(page, 'p-empty');
  await expect(page.getByText('لا توجد بيانات تدفق نقدي لعرضها بعد. أضف دفعات وعهد ومصروفات لرؤية المخطط.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'مخطط تدفق النقد' })).toHaveCount(0);
});
