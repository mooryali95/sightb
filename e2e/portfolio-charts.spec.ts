import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { COMPANY_ID, USER_ID, seed } from './support/seed';

/**
 * The portfolio's three charts. The pie shares the counted spend by
 * project, the bars read each project's planned profit, and the cumulative
 * cash flow runs to the longest project's last month, a project that ended
 * earlier keeping its final position rather than dropping out.
 */
const PORTFOLIO_ID = '77777777-7777-4777-8777-777777777752';
const portfolio = { id: PORTFOLIO_ID, company_id: COMPANY_ID, user_id: USER_ID, name: 'محفظة المخططات', description: null, target_revenue: 0, target_margin: 0, fiscal_year: null, notes: null, created_at: '2026-01-01T00:00:00Z' };
const project = (id: string, name: string, over: Record<string, unknown>) => ({ ...seed.projects[0], id, portfolio_id: PORTFOLIO_ID, name, ...over });
const rows = {
  portfolios: [portfolio],
  projects: [
    project('p-long', 'مشروع طويل', { contract_value: 100000, duration_months: 12 }),
    project('p-short', 'مشروع قصير', { contract_value: 50000, duration_months: 3 }),
  ],
  budget_items: [
    { id: 'b-long', project_id: 'p-long', category: 'other', description: 'خطة', planned_amount: 12000, month: null, created_at: '2026-01-01T00:00:00Z' },
    { id: 'b-short', project_id: 'p-short', category: 'other', description: 'خطة', planned_amount: 3000, month: null, created_at: '2026-01-01T00:00:00Z' },
  ],
  expenses: [
    { ...seed.expenses[0], id: 'e-long', project_id: 'p-long', fund_id: null, amount: 6000, month: 1, date: '2026-01-10', description: 'صرف طويل' },
    { ...seed.expenses[0], id: 'e-short', project_id: 'p-short', fund_id: null, amount: 2000, month: 1, date: '2026-01-10', description: 'صرف قصير' },
    { ...seed.expenses[0], id: 'e-rej', project_id: 'p-short', fund_id: null, amount: 9000, month: 1, date: '2026-01-10', description: 'مرفوض', approval_status: 'rejected' },
  ],
  revenues: [
    { id: 'r-short', project_id: 'p-short', user_id: USER_ID, description: 'دفعة', amount: 7000, date: '2026-02-10', month: 2, revenue_type: 'milestone', status: 'collected', invoice_number: null, invoice_date: null, collection_date: '2026-02-10', milestone_id: null, created_at: '2026-02-01T00:00:00Z' },
    // Invoiced, not collected: planned inflow only.
    { id: 'r-inv', project_id: 'p-short', user_id: USER_ID, description: 'فاتورة', amount: 1000, date: '2026-02-20', month: 2, revenue_type: 'milestone', status: 'invoiced', invoice_number: null, invoice_date: null, collection_date: null, milestone_id: null, created_at: '2026-02-01T00:00:00Z' },
  ],
};

async function openCharts(page: Page) {
  await stubSupabase(page, rows);
  await page.goto(`/portfolio/${PORTFOLIO_ID}`);
  await expect(page.getByText('محفظة المخططات').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'التدفق النقدي المجمّع (تراكمي)' })).toBeVisible();
}
const card = (page: Page, title: string) => page.locator('div.stat-card', { has: page.getByRole('heading', { name: title }) }).first();

/** Hovers the cash flow chart at a month on its x axis and returns the tooltip. */
async function hoverMonth(page: Page, month: string) {
  const chart = card(page, 'التدفق النقدي المجمّع (تراكمي)').locator('.recharts-wrapper');
  await chart.scrollIntoViewIfNeeded();
  const tip = chart.locator('.recharts-tooltip-wrapper');
  await expect(async () => {
    const tick = chart.locator('.recharts-xAxis .recharts-cartesian-axis-tick text').filter({ hasText: new RegExp(`^${month}$`) });
    const box = (await tick.boundingBox())!;
    const area = (await chart.locator('.recharts-cartesian-grid').boundingBox())!;
    await page.mouse.move(area.x + 2, area.y + area.height / 2);
    await page.mouse.move(box.x + box.width / 2, area.y + area.height / 2, { steps: 6 });
    await expect(tip).toContainText('مخطط', { timeout: 1000 });
  }).toPass();
  return tip;
}

test('the pie and the bars read the counted spend and the planned profit by project', async ({ page }) => {
  await openCharts(page);
  const pie = card(page, 'توزيع المصروفات حسب المشروع');
  await expect(pie.getByText('مشروع طويل (75%)')).toBeVisible();
  await expect(pie.getByText('مشروع قصير (25%)')).toBeVisible();
  const bars = card(page, 'الربح المخطط لكل مشروع');
  const rects = bars.locator('.recharts-bar-rectangle');
  await expect(rects).toHaveCount(2);
  const tip = bars.locator('.recharts-tooltip-wrapper');
  const seen: string[] = [];
  await bars.scrollIntoViewIfNeeded();
  for (let i = 0; i < 2; i++) {
    // A bar chart reads the pointer across the whole plot, so the pointer goes to each bar.
    await expect(async () => {
      const box = (await rects.nth(i).boundingBox())!;
      await page.mouse.move(box.x - 40, box.y - 40);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
      await expect(tip).toContainText('الربح المخطط', { timeout: 1000 });
    }).toPass();
    seen.push((await tip.innerText()).replace(/\s+/g, ' ').trim());
  }
  // 100,000 − 12,000 and 50,000 − 3,000.
  expect(seen.join(' | ')).toContain('الربح المخطط : 88,000.00 ر.س');
  expect(seen.join(' | ')).toContain('الربح المخطط : 47,000.00 ر.س');
});

test('the cumulative cash flow keeps the short project\'s final position after it ends', async ({ page }) => {
  await openCharts(page);
  // Month 3: long at −3,000 planned and −6,000 actual; short at +5,000 planned (8,000 in, 3,000 out) and +5,000 actual (7,000 collected, 2,000 spent).
  const m3 = await hoverMonth(page, '3');
  await expect(m3).toContainText('مخطط : 2,000.00 ر.س');
  await expect(m3).toContainText('فعلي : -1,000.00 ر.س');
  // Month 12: long at −12,000 planned, −6,000 actual; short unchanged since month 3.
  const m12 = await hoverMonth(page, '12');
  await expect(m12).toContainText('مخطط : -7,000.00 ر.س');
  await expect(m12).toContainText('فعلي : -1,000.00 ر.س');
});
