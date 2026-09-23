import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { FUND_ID, PROJECT_ID, USER_ID } from './support/seed';

/**
 * The five cards at the head of the payables section, which say they
 * describe one ledger only. On the team's ledger: approved counts what
 * was approved or reimbursed, not what waits for review or was refused;
 * paid counts what was reimbursed; the balance is approved and not yet
 * paid; pending counts the requests still in flight; and the advances
 * card sums what is still out on each paid, unsettled advance, net of
 * what came back, with the oldest one's age. On the vendors' ledger the
 * same cards read the vendors' rows, and since only a team member raises
 * a payment request, neither a pending request nor an advance belongs
 * there.
 */
const RES = 'eeeeeeee-2222-4222-8222-eeeeeeee1154';
const stamp = { user_id: USER_ID, created_at: '2026-02-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z' };
const reimb = (id: string, amount: number, status: string, over: Record<string, unknown> = {}) => ({
  id, project_id: PROJECT_ID, resource_id: RES, source_kind: 'resource', vendor_name: null, category: 'equipment',
  description: `استرداد ${id}`, amount, expense_date: '2026-02-01', receipt_attachments: [], budget_item_id: null, status,
  notes: null, rejection_reason: status === 'rejected' ? 'مكرر' : null, approved_by: null, approved_at: null,
  payment_request_id: null, settled_expense_id: null, settled_at: null, ...stamp, ...over,
});
const vendor = (id: string, amount: number, status: string) =>
  reimb(id, amount, status, { resource_id: null, source_kind: 'vendor', vendor_name: 'مورد الخرسانة' });
const request = (id: string, request_type: string, amount: number, status: string, over: Record<string, unknown> = {}) => ({
  id, project_id: PROJECT_ID, resource_id: RES, request_type, amount, currency: 'SAR', description: `طلب ${id}`, justification: null,
  linked_reimbursement_ids: [], linked_fund_id: null, paid_from_fund_id: status === 'paid' ? FUND_ID : null, paid_from_custody_id: null,
  budget_item_id: null, priority: 'normal', status, requested_by: USER_ID, requested_at: '2026-02-03T00:00:00Z', reviewed_by: null,
  reviewed_at: null, review_notes: null, approved_by: null, approved_at: null, approval_notes: null, scheduled_date: null,
  paid_date: null, payment_method: null, payment_reference: null, payment_attachments: [], rejection_reason: null,
  auto_created_expense_id: null, is_advance_outstanding: false, advance_settled_at: null, advance_settled_by: null,
  settlement_type: null, settled_amount: null, refunded_amount: 0, ...stamp, ...over,
});
const paidAdvance = (id: string, amount: number, paid_date: string, over: Record<string, unknown> = {}) =>
  request(id, 'advance', amount, 'paid', { paid_date, payment_method: 'cash', is_advance_outstanding: true, ...over });
const rows = {
  resources: [{ id: RES, project_id: PROJECT_ID, name: 'سارة المهندسة', role: 'مهندسة', monthly_cost: 9000, user_id: USER_ID, created_at: '2026-01-01T00:00:00Z' }],
  resource_reimbursements: [
    reimb('r-appr', 5000, 'approved'),
    reimb('r-paid', 3000, 'reimbursed'),
    reimb('r-pend', 1000, 'pending_review'),
    reimb('r-rej', 2000, 'rejected'),
    vendor('v-appr', 7000, 'approved'),
    vendor('v-paid', 4000, 'reimbursed'),
  ],
  payment_requests: [
    request('pr-sub', 'reimbursement', 2000, 'submitted'),
    // 6,000 out, 1,000 back: 5,000 still out, thirty days on.
    paidAdvance('pr-adv1', 6000, '2026-02-05', { refunded_amount: 1000 }),
    paidAdvance('pr-adv2', 3000, '2026-02-25'),
    // Settled: nothing is out on it.
    paidAdvance('pr-adv3', 9000, '2026-01-20', { is_advance_outstanding: false, advance_settled_at: '2026-02-01T00:00:00Z' }),
  ],
};

async function openPayables(page: Page) {
  await page.clock.setFixedTime(new Date('2026-03-07T12:00:00Z'));
  await stubSupabase(page, rows);
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'المالية' }).click();
  await page.getByRole('button', { name: 'مستحقات الموارد', exact: true }).click();
  await expect(page.getByRole('button', { name: 'مستحقات الفريق (4)' })).toBeVisible();
}
const figure = (page: Page, label: string) =>
  page.getByText(label, { exact: true }).locator('xpath=following-sibling::div[1]');

test("the team's ledger reads its own claims, its requests in flight, and what is still out on its advances", async ({ page }) => {
  await openPayables(page);
  await expect(page.getByText('الأرقام أدناه تخص: دفتر مستحقات الفريق فقط.')).toBeVisible();
  await expect(figure(page, 'إجمالي المعتمد')).toHaveText('8,000.00 ر.س');
  await expect(figure(page, 'إجمالي المدفوع')).toHaveText('3,000.00 ر.س');
  await expect(figure(page, 'المستحق غير المدفوع')).toHaveText('5,000.00 ر.س');
  await expect(figure(page, 'طلبات معلقة')).toHaveText('1');
  await expect(figure(page, 'سلف قائمة (غير مسوّاة)')).toHaveText('8,000.00 ر.س');
  await expect(page.getByText('2 سلفة')).toBeVisible();
  await expect(page.getByText('أقدمها: 30 يوم')).toBeVisible();
});

test("the vendors' ledger reads the vendors' rows and carries none of the team's requests or advances", async ({ page }) => {
  await openPayables(page);
  await page.getByRole('button', { name: 'مستحقات الموردين (2)' }).click();
  await expect(page.getByText('الأرقام أدناه تخص: دفتر مستحقات الموردين فقط.')).toBeVisible();
  await expect(figure(page, 'إجمالي المعتمد')).toHaveText('11,000.00 ر.س');
  await expect(figure(page, 'إجمالي المدفوع')).toHaveText('4,000.00 ر.س');
  await expect(figure(page, 'المستحق غير المدفوع')).toHaveText('7,000.00 ر.س');
  await expect(figure(page, 'طلبات معلقة')).toHaveText('0');
  await expect(figure(page, 'سلف قائمة (غير مسوّاة)')).toHaveText('0.00 ر.س');
  await expect(page.getByText('0 سلفة')).toBeVisible();
  await expect(page.getByText(/أقدمها:/)).toHaveCount(0);
});
