import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { COMPANY_ID, USER_ID, seed } from './support/seed';

/**
 * The portfolio page. Its four cards sum the effective contracts and the
 * spend, add the planned profits with their margin, and weight completion
 * by contract; the comparison table ranks the projects worst health first,
 * a project past its plan or on hold critical, one past nine tenths a
 * warning, and a row opens the project; the payables section sums the
 * team's and the vendors' approved-but-unpaid claims, the payments still
 * in flight and everything paid, and counts each project's settlements.
 */
const PORTFOLIO_ID = '77777777-7777-4777-8777-777777777747';
const portfolio = { id: PORTFOLIO_ID, company_id: COMPANY_ID, user_id: USER_ID, name: 'محفظة المقارنة', description: null, target_revenue: 0, target_margin: 0, fiscal_year: null, notes: null, created_at: '2026-01-01T00:00:00Z' };
const project = (id: string, name: string, over: Record<string, unknown>) => ({ ...seed.projects[0], id, portfolio_id: PORTFOLIO_ID, name, ...over });
const budget = (id: string, project_id: string, planned_amount: number) => ({ id, project_id, category: 'other', description: 'خطة', planned_amount, month: null, created_at: '2026-01-01T00:00:00Z' });
const expense = (id: string, project_id: string, amount: number) => ({ ...seed.expenses[0], id, project_id, fund_id: null, amount, description: 'صرف' });
const stamp = { user_id: USER_ID, created_at: '2026-02-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z' };
const claim = (id: string, project_id: string, amount: number, status: string, source_kind = 'resource') => ({
  id, project_id, resource_id: source_kind === 'resource' ? 'res-a' : null, source_kind, vendor_name: source_kind === 'vendor' ? 'مورّد' : null,
  category: 'equipment', description: `مطالبة ${id}`, amount, expense_date: '2026-02-01', receipt_attachments: [], budget_item_id: null, status,
  notes: null, rejection_reason: null, approved_by: null, approved_at: null, payment_request_id: null, settled_expense_id: null, settled_at: null, ...stamp,
});
const rows = {
  portfolios: [portfolio],
  projects: [
    // 500,000 contract, 100,000 planned, 50,000 spent: healthy, 60% done.
    project('p-ok', 'مشروع سليم', { contract_value: 500000, percent_complete: 60 }),
    // 200,000 contract, 100,000 planned, 95,000 spent: a warning.
    project('p-warn', 'مشروع محذَّر', { contract_value: 200000, percent_complete: 20 }),
    // 300,000 contract, 100,000 planned, 120,000 spent: critical, and a loss once the plan is above the contract? No: profit stays positive.
    project('p-bad', 'مشروع حرج', { contract_value: 300000, percent_complete: 100 }),
  ],
  budget_items: [budget('b-ok', 'p-ok', 100000), budget('b-warn', 'p-warn', 100000), budget('b-bad', 'p-bad', 100000)],
  expenses: [expense('e-ok', 'p-ok', 50000), expense('e-warn', 'p-warn', 95000), expense('e-bad', 'p-bad', 120000)],
  resources: [{ id: 'res-a', project_id: 'p-ok', name: 'سارة', role: 'مهندسة', monthly_cost: 9000, user_id: USER_ID, created_at: '2026-01-01T00:00:00Z' }],
  resource_reimbursements: [
    claim('rb-1', 'p-ok', 4000, 'approved'), claim('rb-2', 'p-ok', 1000, 'reimbursed'), claim('rb-3', 'p-ok', 7000, 'pending_review'),
    claim('rb-4', 'p-ok', 2500, 'approved', 'vendor'), claim('rb-5', 'p-warn', 600, 'reimbursed', 'vendor'), claim('rb-6', 'p-warn', 9000, 'rejected'),
  ],
  payment_requests: [{
    id: 'pr-1', project_id: 'p-ok', resource_id: 'res-a', request_type: 'reimbursement', amount: 3000, currency: 'SAR', description: 'صرف', justification: null,
    linked_reimbursement_ids: [], linked_fund_id: null, paid_from_fund_id: null, paid_from_custody_id: null, budget_item_id: null, priority: 'normal', status: 'submitted',
    requested_by: USER_ID, requested_at: '2026-03-01T00:00:00Z', reviewed_by: null, reviewed_at: null, review_notes: null, approved_by: null, approved_at: null, approval_notes: null,
    scheduled_date: null, paid_date: null, payment_method: null, payment_reference: null, payment_attachments: [], rejection_reason: null, auto_created_expense_id: null,
    is_advance_outstanding: false, advance_settled_at: null, advance_settled_by: null, settlement_type: null, settled_amount: null, refunded_amount: 0, ...stamp,
  }],
  resource_settlements: [
    { id: 'st-1', resource_id: 'res-a', project_id: 'p-ok', period_from: '2026-01-01', period_to: '2026-02-28', total_owed: 4000, total_paid: 1000, balance: 3000, linked_reimbursement_ids: [], linked_payment_ids: [], settlement_text_ar: 'نص', status: 'signed', signed_by_resource: true, signature_attachment: null, signed_at: '2026-03-01T00:00:00Z', notes: null, created_by: USER_ID, ...stamp },
    { id: 'st-2', resource_id: 'res-a', project_id: 'p-ok', period_from: '2026-03-01', period_to: '2026-03-31', total_owed: 1000, total_paid: 0, balance: 1000, linked_reimbursement_ids: [], linked_payment_ids: [], settlement_text_ar: 'نص', status: 'draft', signed_by_resource: false, signature_attachment: null, signed_at: null, notes: null, created_by: USER_ID, ...stamp },
  ],
};

async function openPortfolio(page: Page) {
  await stubSupabase(page, rows);
  await page.goto(`/portfolio/${PORTFOLIO_ID}`);
  await expect(page.getByText('محفظة المقارنة').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'مقارنة المشاريع' })).toBeVisible();
}
const card = (page: Page, title: string) => page.locator('div.stat-card', { has: page.getByText(title, { exact: true }) }).first();

test('sums the cards, ranks the projects worst first with their health, and a row opens the project', async ({ page }) => {
  await openPortfolio(page);
  await expect(card(page, 'إجمالي قيمة العقود')).toContainText('1,000,000.00 ر.س');
  await expect(card(page, 'إجمالي المصروفات')).toContainText('265,000.00 ر.س');
  await expect(card(page, 'الربح المخطط الإجمالي')).toContainText('700,000.00 ر.س');
  await expect(card(page, 'الربح المخطط الإجمالي')).toContainText('هامش: 70.0%');
  // (500,000 × 60 + 200,000 × 20 + 300,000 × 100) / 1,000,000.
  await expect(card(page, 'الإنجاز المرجّح')).toContainText('64.0%');
  await expect(card(page, 'الإنجاز المرجّح')).toContainText('3 مشروع');

  const table = page.locator('div.stat-card', { has: page.getByRole('heading', { name: 'مقارنة المشاريع' }) }).getByRole('table');
  const names = table.locator('tbody tr td:first-child');
  await expect(names).toHaveText(['مشروع حرج', 'مشروع محذَّر', 'مشروع سليم']);
  const row = (name: string) => table.getByRole('row').filter({ hasText: name });
  await expect(row('مشروع حرج')).toContainText('حرج');
  await expect(row('مشروع حرج')).toContainText('120,000.00 ر.س');
  await expect(row('مشروع حرج')).toContainText('200,000.00 ر.س');
  await expect(row('مشروع محذَّر')).toContainText('تحذير');
  await expect(row('مشروع سليم')).toContainText('سليم');
  await expect(row('مشروع سليم')).toContainText('60%');
  await row('مشروع محذَّر').click();
  await expect(page).toHaveURL(/\/project\/p-warn$/);
});

test('the payables section sums the approved-but-unpaid claims of the team and the vendors, the payments in flight and the paid, per project', async ({ page }) => {
  await openPortfolio(page);
  const section = page.locator('div.space-y-4', { has: page.getByRole('heading', { name: 'المستحقات حسب المشروع' }) }).first();
  const total = (label: string) => section.locator('div.p-4', { hasText: label }).first();
  await expect(total('مستحقات الفريق القائمة')).toContainText('4,000.00 ر.س');
  await expect(total('مستحقات الموردين القائمة')).toContainText('2,500.00 ر.س');
  await expect(total('مدفوعات متوقعة')).toContainText('3,000.00 ر.س');
  await expect(total('إجمالي المسدَّد')).toContainText('1,600.00 ر.س');

  const table = section.getByRole('table');
  const row = (name: string) => table.getByRole('row').filter({ hasText: name });
  await expect(row('مشروع سليم').getByRole('cell')).toHaveText(['مشروع سليم', '4,000.00 ر.س', '1,000.00 ر.س', '2,500.00 ر.س', '0.00 ر.س', '3,000.00 ر.س', '1 موقّعة / 1 مسودة', '']);
  await expect(row('مشروع محذَّر').getByRole('cell')).toHaveText(['مشروع محذَّر', '0.00 ر.س', '0.00 ر.س', '0.00 ر.س', '600.00 ر.س', '0.00 ر.س', '0 موقّعة / 0 مسودة', '']);
  await row('مشروع حرج').getByRole('button').click();
  await expect(page).toHaveURL(/\/project\/p-bad$/);
});
