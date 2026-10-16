import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID, USER_ID, seed } from './support/seed';

/**
 * The figures at the head of a project, on a fixed calendar date. The
 * health strip grades the project and reads its status, progress, month
 * and days left; the contract row reads the contract with VAT or with its
 * change orders, the budget's share, the planned profit and what is left
 * to invoice; the budget row reads the spend against the plan, what is
 * left or free of commitments, the burn and how long it lasts, and the
 * EAC once a baseline exists; the collection row reads the collected,
 * the receivables with their invoice count, the realised profit and the
 * TCPI; pills count the pending expense and the proposed order.
 */
const stat = (page: Page, title: string) => page.locator('div.stat-card', { has: page.getByText(title, { exact: true }) }).first();
const strip = (page: Page) => page.locator('div.rounded-lg.border', { hasText: 'الإنجاز 40%' }).first();

async function openProject(page: Page, extra: Record<string, Record<string, unknown>[]> = {}, spend = '12,000.00 ر.س') {
  await page.clock.setFixedTime(new Date('2026-06-15T09:00:00Z'));
  await stubSupabase(page, extra);
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  // The figures settle once the expenses land.
  await expect(stat(page, 'المصروف الفعلي')).toContainText(spend);
}

test('the seed reads sound, with its contract, budget, spend, burn and realised loss, and no performance indices without a baseline', async ({ page }) => {
  await openProject(page);
  const head = strip(page);
  await expect(head).toContainText('سليم');
  await expect(head).toContainText('تشغيل');
  await expect(head).toContainText('الشهر 6 من 12');
  await expect(head).toContainText('199 يوم متبقي');
  await expect(head).not.toContainText('CPI');
  await expect(head).not.toContainText('خطر مفتوح');

  await expect(stat(page, 'قيمة العقد')).toContainText('1,000,000.00 ر.س');
  await expect(stat(page, 'قيمة العقد')).toContainText('شامل الضريبة: 1,150,000.00 ر.س');
  await expect(stat(page, 'الموازنة المعتمدة')).toContainText('400,000.00 ر.س');
  await expect(stat(page, 'الموازنة المعتمدة')).toContainText('40.0% من العقد');
  await expect(stat(page, 'الربح المخطط')).toContainText('600,000.00 ر.س');
  await expect(stat(page, 'الربح المخطط')).toContainText('هامش: 60.0%');
  await expect(stat(page, 'المتبقي من العقد')).toContainText('1,000,000.00 ر.س');
  await expect(stat(page, 'المتبقي من العقد')).toContainText('100% لم يُفوتر');

  await expect(stat(page, 'المصروف الفعلي')).toContainText('3.0% من الموازنة (400,000.00 ر.س)');
  await expect(stat(page, 'المتبقي من الموازنة')).toContainText('388,000.00 ر.س');
  await expect(stat(page, 'معدل الحرق الشهري')).toContainText('2,000.00 ر.س');
  await expect(stat(page, 'معدل الحرق الشهري')).toContainText('يكفي لـ 194.0 شهر');
  await expect(page.getByText('EAC غير متاح')).toBeVisible();

  await expect(stat(page, 'المحصّل فعلياً')).toContainText('0% من العقد');
  await expect(stat(page, 'ذمم مدينة (مفوتر)')).toContainText('لا فواتير معلّقة');
  await expect(stat(page, 'الربح المحقق')).toContainText('-12,000.00 ر.س');
  await expect(stat(page, 'الربح المحقق')).toContainText('المخطط: 600,000.00 ر.س');
  await expect(page.getByText('CPI / SPI / TCPI')).toBeVisible();
  await expect(page.getByText(/مصروف بانتظار الاعتماد/)).toHaveCount(0);
});

test('change orders, commitments, invoices, a high risk, a pending expense and a proposed order each move their figure', async ({ page }) => {
  const revenue = (id: string, amount: number, status: string) => ({
    id, project_id: PROJECT_ID, user_id: USER_ID, description: `دفعة ${id}`, amount, date: '2026-04-01', month: 4, revenue_type: 'milestone', status,
    invoice_number: null, invoice_date: null, collection_date: status === 'collected' ? '2026-04-05' : null, milestone_id: null, created_at: '2026-04-01T00:00:00Z',
  });
  const order = (id: string, amount_impact: number, status: string) => ({
    id, project_id: PROJECT_ID, user_id: USER_ID, description: `أمر ${id}`, change_type: 'scope_addition', amount_impact, duration_impact: 0, status, requested_by: 'العميل',
    approved_by: status === 'approved' ? USER_ID : null, approved_date: status === 'approved' ? '2026-02-01' : null, budget_items_json: '[]', auto_rebaseline: false, created_at: '2026-02-01T00:00:00Z',
  });
  const commitment = (id: string, total_amount: number, status: string) => ({
    id, project_id: PROJECT_ID, user_id: USER_ID, description: `عقد ${id}`, vendor_name: 'مورّد', contract_ref: id, total_amount, spent_amount: 0, status, notes: null, budget_item_id: null,
    created_at: '2026-02-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z',
  });
  await openProject(page, {
    change_orders: [order('co-ok', 50000, 'approved'), order('co-new', 70000, 'proposed')],
    commitments: [commitment('cm-live', 100000, 'active'), commitment('cm-gone', 30000, 'cancelled')],
    revenues: [revenue('rv-c', 200000, 'collected'), revenue('rv-i1', 100000, 'invoiced'), revenue('rv-i2', 50000, 'invoiced'), revenue('rv-p', 80000, 'planned')],
    expenses: [{ ...seed.expenses[0], id: 'ex-pending', fund_id: null, amount: 5000, approval_status: 'pending', description: 'معلّق' }],
    risks: [{ id: 'rk-1', project_id: PROJECT_ID, portfolio_id: null, user_id: USER_ID, title: 'خطر', description: null, probability: 'medium', impact: 'high', financial_impact: 1000, category: 'financial', status: 'open', mitigation_plan: null, owner: null, created_at: '2026-02-01T00:00:00Z' }],
  }, '17,000.00 ر.س');
  const head = strip(page);
  await expect(head).toContainText('يحتاج انتباه');
  await expect(head).toContainText('1 خطر مفتوح');

  await expect(stat(page, 'قيمة العقد المعدّلة')).toContainText('1,050,000.00 ر.س');
  await expect(stat(page, 'قيمة العقد المعدّلة')).toContainText('الأصلية: 1,000,000.00 ر.س');
  await expect(stat(page, 'الموازنة المعتمدة')).toContainText('38.1% من العقد');
  await expect(stat(page, 'الربح المخطط')).toContainText('650,000.00 ر.س');
  await expect(stat(page, 'المتبقي من العقد')).toContainText('700,000.00 ر.س');
  await expect(stat(page, 'المتبقي من العقد')).toContainText('67% لم يُفوتر');

  await expect(stat(page, 'المتاح للصرف')).toContainText('283,000.00 ر.س');
  await expect(stat(page, 'المتاح للصرف')).toContainText('ملتزم بعقود: 100,000.00 ر.س');
  await expect(page.getByText('المتبقي من الموازنة', { exact: true })).toHaveCount(0);

  await expect(stat(page, 'المحصّل فعلياً')).toContainText('200,000.00 ر.س');
  await expect(stat(page, 'المحصّل فعلياً')).toContainText('19% من العقد');
  await expect(stat(page, 'ذمم مدينة (مفوتر)')).toContainText('150,000.00 ر.س');
  await expect(stat(page, 'ذمم مدينة (مفوتر)')).toContainText('2 فاتورة قيد التحصيل');
  await expect(stat(page, 'الربح المحقق')).toContainText('183,000.00 ر.س');

  // The pills under the stats; the overview's attention card says the same lower down.
  await expect(page.locator('div.rounded-full', { hasText: '1 مصروف بانتظار الاعتماد' })).toBeVisible();
  await expect(page.locator('div.rounded-full', { hasText: '1 أمر تغيير مقترح' })).toBeVisible();
});

test('an active baseline brings the performance indices: CPI and SPI in the strip, the EAC with its saving, and the TCPI', async ({ page }) => {
  await openProject(page, {
    cost_baselines: [{ id: 'bl-1', project_id: PROJECT_ID, user_id: USER_ID, name: 'الأولى', version: 1, is_active: true, total_planned: 400000, created_at: '2026-02-01T00:00:00Z' }],
    baseline_items: [{ id: 'bi-1', baseline_id: 'bl-1', category: 'materials', description: 'بند المواد', planned_amount: 400000, month: null, start_month: null, end_month: null, cost_type: 'fixed' }],
  });
  const head = strip(page);
  // Earned 160,000 of a 400,000 plan at 40%, against 200,000 planned by month 6 and 12,000 spent.
  await expect(head).toContainText('CPI 13.33');
  await expect(head).toContainText('SPI 0.80');
  await expect(head).toContainText('يحتاج انتباه');
  await expect(stat(page, 'التكلفة المتوقعة (EAC)')).toContainText('30,000.00 ر.س');
  await expect(stat(page, 'التكلفة المتوقعة (EAC)')).toContainText('وفر متوقع: 370,000.00 ر.س');
  await expect(stat(page, 'الأداء المطلوب (TCPI)')).toContainText('0.62');
  await expect(stat(page, 'الأداء المطلوب (TCPI)')).toContainText('مريح — الأداء كافٍ');
  await expect(page.getByText('EAC غير متاح')).toHaveCount(0);
});
