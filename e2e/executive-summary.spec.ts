import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { USER_ID, seed } from './support/seed';

/**
 * The executive summary on the overview tab, on a fixed calendar date that
 * makes the sixth month the current one. The month's performance reads
 * the plan's share against the spend, pending included, with a selector for an
 * earlier month or the elapsed months together; the budget splits into
 * spent and available; the milestones count the completed and name the
 * next; the collection line divides the contract into collected, invoiced
 * and not yet invoiced; the risks count the open and the high ones, sum
 * their exposure and judge the reserve; and the attention card lists the
 * pending expense with its amount, the proposed order and the delayed
 * milestone.
 */
const EXEC_ID = 'cccccccc-1111-4111-8111-cccccccc1139';
const expense = (id: string, month: number, amount: number, approval_status = 'approved') => ({
  ...seed.expenses[0], id, project_id: EXEC_ID, fund_id: null, month, date: `2026-${String(month).padStart(2, '0')}-10`, amount, description: `صرف ${month}`, approval_status,
});
const milestone = (id: string, name: string, status: string, sort_order: number, planned_end: string | null) => ({
  id, project_id: EXEC_ID, name, description: null, weight: 1, percent_complete: status === 'completed' ? 100 : 0, status, sort_order,
  planned_start: null, planned_end, actual_start: null, actual_end: null, linked_revenue_id: null, user_id: USER_ID, created_at: '2026-01-01T00:00:00Z',
});
const revenue = (id: string, amount: number, status: string) => ({
  id, project_id: EXEC_ID, user_id: USER_ID, description: `دفعة ${status}`, amount, date: '2026-03-01', month: 3, revenue_type: 'milestone', status,
  invoice_number: null, invoice_date: null, collection_date: status === 'collected' ? '2026-03-05' : null, milestone_id: null, created_at: '2026-03-01T00:00:00Z',
});
const risk = (id: string, title: string, impact: string, financial_impact: number, status: string) => ({
  id, project_id: EXEC_ID, portfolio_id: null, user_id: USER_ID, title, description: null, probability: 'medium', impact, financial_impact,
  category: 'financial', status, mitigation_plan: null, owner: null, created_at: '2026-02-01T00:00:00Z',
});
const rows = {
  projects: [{ ...seed.projects[0], id: EXEC_ID, name: 'مشروع الملخص', contract_value: 200000, management_reserve: 10000 }],
  budget_items: [{ id: 'bi-exec', project_id: EXEC_ID, category: 'other', description: 'خطة', planned_amount: 60000, month: null, created_at: '2026-01-01T00:00:00Z' }],
  expenses: [expense('ex-2', 2, 6000), expense('ex-6', 6, 4000), expense('ex-5p', 5, 1500, 'pending'), expense('ex-4r', 4, 9000, 'rejected')],
  milestones: [
    milestone('ms-design', 'التصميم', 'in_progress', 1, '2026-07-15'),
    milestone('ms-late', 'التوريد', 'delayed', 2, '2026-05-01'),
    milestone('ms-done', 'التعاقد', 'completed', 3, '2026-02-01'),
  ],
  revenues: [revenue('rv-c', 50000, 'collected'), revenue('rv-i', 30000, 'invoiced'), revenue('rv-p', 80000, 'planned')],
  risks: [risk('rk-high', 'خطر مرتفع', 'high', 15000, 'open'), risk('rk-mit', 'خطر متوسط', 'medium', 5000, 'mitigating'), risk('rk-closed', 'خطر مغلق', 'very_high', 100000, 'closed')],
  change_orders: [{ id: 'co-exec', project_id: EXEC_ID, user_id: USER_ID, description: 'توسعة', change_type: 'scope_addition', amount_impact: 20000, duration_impact: 0, status: 'proposed', requested_by: 'العميل', approved_by: null, approved_date: null, budget_items_json: '[]', auto_rebaseline: false, created_at: '2026-02-01T00:00:00Z' }],
};

async function openOverview(page: Page) {
  await page.clock.setFixedTime(new Date('2026-06-15T09:00:00Z'));
  await stubSupabase(page, rows);
  await page.goto(`/project/${EXEC_ID}`);
  await expect(page.getByText('مشروع الملخص').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: /^الأداء المالي/ })).toBeVisible();
}
const block = (page: Page, title: RegExp | string) => page.locator('div.rounded-xl.border', { has: page.getByRole('heading', { name: title }) }).first();
// Each block's figures sit in its first grid; the legends below repeat some labels.
const cell = (scope: ReturnType<Page['locator']>, label: string) => scope.locator('div.grid').first().getByText(label, { exact: true }).locator('..');

test("the month's performance reads the plan's share against the spend, for the current month, an earlier one and all elapsed", async ({ page }) => {
  await openOverview(page);
  const perf = block(page, /^الأداء المالي/);
  await expect(perf.getByRole('heading')).toHaveText(/الأداء المالي — شهر 6/);
  await expect(cell(perf, 'المخطط')).toContainText('5,000.00 ر.س');
  await expect(cell(perf, 'المصروف')).toContainText('4,000.00 ر.س');
  await expect(cell(perf, 'وفر')).toContainText('1,000.00 ر.س');
  await expect(cell(perf, 'الحكم')).toContainText('وفر 👍');
  await expect(perf).toContainText('نسبة الصرف');
  await expect(perf).toContainText('80%');

  await perf.getByRole('combobox').click();
  await expect(page.getByRole('option', { name: 'الشهر الحالي (6)' })).toBeVisible();
  await expect(page.getByRole('option')).toHaveCount(7);
  await page.getByRole('option', { name: 'شهر 2' }).click();
  await expect(perf.getByRole('heading')).toHaveText(/شهر 2/);
  await expect(cell(perf, 'المصروف')).toContainText('6,000.00 ر.س');
  await expect(cell(perf, 'تجاوز')).toContainText('1,000.00 ر.س');
  await expect(cell(perf, 'الحكم')).toContainText('تجاوز ⚠️');
  await expect(perf).toContainText('120%');

  await perf.getByRole('combobox').click();
  await page.getByRole('option', { name: 'إجمالي الأشهر' }).click();
  await expect(perf.getByRole('heading')).toHaveText(/إجمالي 6 شهر/);
  await expect(cell(perf, 'المخطط')).toContainText('30,000.00 ر.س');
  // The elapsed months count the pending expense as spend, as the project's totals do.
  await expect(cell(perf, 'المصروف')).toContainText('11,500.00 ر.س');
  await expect(cell(perf, 'وفر')).toContainText('18,500.00 ر.س');
  await expect(perf).toContainText('38%');

  await perf.getByRole('combobox').click();
  await page.getByRole('option', { name: 'شهر 3' }).click();
  await expect(cell(perf, 'الحكم')).toContainText('لا صرف بعد');
});

test('the budget, the milestones, the collection, the risks and the attention card read the project', async ({ page }) => {
  await openOverview(page);
  const budget = block(page, 'توزيع الموازنة');
  await expect(budget.getByText('مصروف 19%')).toBeVisible();
  await expect(budget.getByText('متاح 81%')).toBeVisible();
  await expect(budget.getByText(/ملتزم|تجاوز/)).toHaveCount(0);

  const milestones = block(page, /^المراحل/);
  await expect(milestones.getByRole('heading')).toHaveText('المراحل (1/3 مكتمل)');
  await expect(milestones.getByText('القادم: التصميم')).toBeVisible();
  // The browser's Arabic locale writes the date in Arabic-Indic digits.
  await expect(milestones.getByText(/الموعد: .*(2026|٢٠٢٦)/)).toBeVisible();

  const collection = block(page, 'التحصيل');
  await expect(cell(collection, 'العقد')).toContainText('200,000.00 ر.س');
  await expect(cell(collection, 'محصّل')).toContainText('50,000.00 ر.س');
  await expect(cell(collection, 'مفوتر')).toContainText('30,000.00 ر.س');
  await expect(cell(collection, 'لم يُفوتر')).toContainText('120,000.00 ر.س');
  await expect(collection).toContainText('محصّل 25%');

  const risks = block(page, 'المخاطر');
  await expect(cell(risks, 'مفتوحة')).toContainText('2');
  await expect(cell(risks, 'عالية')).toContainText('1');
  await expect(cell(risks, 'التعرض')).toContainText('20,000.00 ر.س');
  await expect(risks.getByText('خطر مرتفع')).toBeVisible();
  await expect(risks.getByText('خطر متوسط')).toHaveCount(0);
  await expect(risks).toContainText('الاحتياطي: 10,000.00 ر.س');
  await expect(risks).toContainText('التعرض يتجاوز الاحتياطي');

  const attention = block(page, 'يحتاج تدخل');
  await expect(attention).toContainText('1 مصروف بانتظار الاعتماد (1,500.00 ر.س)');
  await expect(attention).toContainText('1 أمر تغيير مقترح');
  await expect(attention).toContainText('1 مرحلة متأخرة');
  await expect(attention).not.toContainText('تجاوز الموازنة');
});

test('a project with nothing pending shows no attention card and judges the reserve sufficient', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-06-15T09:00:00Z'));
  await stubSupabase(page, {
    projects: [{ ...seed.projects[0], id: EXEC_ID, name: 'مشروع الملخص', contract_value: 200000, management_reserve: 50000 }],
    budget_items: rows.budget_items,
    risks: [risk('rk-high', 'خطر مرتفع', 'high', 15000, 'open')],
  });
  await page.goto(`/project/${EXEC_ID}`);
  await expect(page.getByRole('heading', { name: /^الأداء المالي/ })).toBeVisible();
  await expect(cell(block(page, /^الأداء المالي/), 'الحكم')).toContainText('لا صرف بعد');
  await expect(page.getByRole('heading', { name: 'يحتاج تدخل' })).toHaveCount(0);
  await expect(block(page, 'المخاطر')).toContainText('✓ كافٍ');
  await expect(block(page, /^المراحل/).getByText('لا توجد مراحل')).toBeVisible();
  await expect(block(page, 'توزيع الموازنة').getByText('متاح 100%')).toBeVisible();
});
