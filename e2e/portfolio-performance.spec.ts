import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { COMPANY_ID, USER_ID, seed } from './support/seed';

/**
 * The portfolio cards on the dashboard. A portfolio shows when its
 * company is live and it holds a visible project, with its project
 * count, the sum of its effective contracts, completion weighted by
 * contract, and a health badge: a plan above the contract makes it
 * critical, a target margin the plan misses makes it a warning. The
 * card links to the portfolio; an empty portfolio shows no card.
 */
const PF_A = '77777777-7777-4777-8777-777777777701';
const PF_B = '77777777-7777-4777-8777-777777777702';
const PF_EMPTY = '77777777-7777-4777-8777-777777777703';
const portfolio = (id: string, name: string, target_margin = 0) => ({
  id, company_id: COMPANY_ID, user_id: USER_ID, name, description: null, target_revenue: 0, target_margin, fiscal_year: null, notes: null, created_at: '2026-01-01T00:00:00Z',
});
const project = (id: string, name: string, over: Record<string, unknown>) => ({ ...seed.projects[0], id, name, ...over });
const budget = (id: string, project_id: string, planned_amount: number) => ({ id, project_id, category: 'other', description: 'خطة', planned_amount, month: null, created_at: '2026-01-01T00:00:00Z' });

async function openDashboard(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'إدارة الشركات' })).toBeVisible();
}
const card = (page: Page, name: string) => page.locator('div.stat-card', { has: page.getByText(name, { exact: true }) }).first();

test('sums, weights and grades each portfolio with a visible project, and links to it', async ({ page }) => {
  await stubSupabase(page, {
    portfolios: [portfolio(PF_A, 'محفظة سليمة'), portfolio(PF_B, 'محفظة متعثرة'), portfolio(PF_EMPTY, 'محفظة فارغة')],
    projects: [
      // Two projects: 1,000,000 at 40% and 500,000 at 100%, weighted completion 60%.
      project('pa-1', 'مشروع أ1', { portfolio_id: PF_A }),
      project('pa-2', 'مشروع أ2', { portfolio_id: PF_A, contract_value: 500000, percent_complete: 100 }),
      // A plan above the contract: a negative margin, so critical.
      project('pb-1', 'مشروع ب1', { portfolio_id: PF_B, contract_value: 200000 }),
    ],
    budget_items: [budget('bi-a1', 'pa-1', 400000), budget('bi-a2', 'pa-2', 100000), budget('bi-b1', 'pb-1', 300000)],
  });
  await openDashboard(page);
  await expect(page.getByRole('heading', { name: 'أداء المحافظ' })).toBeVisible();

  const healthy = card(page, 'محفظة سليمة');
  await expect(healthy).toContainText('سليم');
  await expect(healthy.getByText('المشاريع').locator('..')).toContainText('2');
  await expect(healthy).toContainText('1,500,000.00 ر.س');
  await expect(healthy.getByText('الإنجاز').locator('..')).toContainText('60%');

  const troubled = card(page, 'محفظة متعثرة');
  await expect(troubled).toContainText('حرج');
  await expect(troubled).toContainText('200,000.00 ر.س');
  await expect(page.getByText('محفظة فارغة', { exact: true })).toHaveCount(0);

  await healthy.click();
  await expect(page).toHaveURL(new RegExp(`/portfolio/${PF_A}$`));
});

test('a target margin the plan misses turns the badge to a warning', async ({ page }) => {
  await stubSupabase(page, {
    // 1,000,000 against a 400,000 plan is a 60% margin; a 70% target is missed.
    portfolios: [portfolio(PF_A, 'محفظة طموحة', 70)],
    projects: [project('pa-1', 'مشروع أ1', { portfolio_id: PF_A })],
    budget_items: [budget('bi-a1', 'pa-1', 400000)],
  });
  await openDashboard(page);
  await expect(card(page, 'محفظة طموحة')).toContainText('تحذير');
});
