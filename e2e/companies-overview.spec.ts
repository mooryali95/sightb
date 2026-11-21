import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { COMPANY_ID, seed } from './support/seed';

/**
 * «المنظومات» on the dashboard: with two companies, each one's projects by
 * health, the one over budget first, and a row that opens the company.
 * MAP_SHOTS=<dir> saves light and dark screenshots for the design review.
 */
const OTHER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OVER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const rows = {
  companies: [{ ...seed.companies[0], id: OTHER, name: 'منظومة النماء' }],
  projects: [{ ...seed.projects[0], id: OVER, name: 'مشروع متجاوز', company_id: OTHER, portfolio_id: null }],
  budget_items: [{ ...seed.budget_items[0], id: 'bi-over', project_id: OVER, planned_amount: 10000 }],
  expenses: [{ id: 'ex-over', project_id: OVER, category: 'other', description: 'صرف', amount: 15000, date: '2026-03-05', month: 3,
    approval_status: 'approved', is_vat_exempt: true, fund_id: null, custody_id: null, user_id: seed.companies[0].user_id ?? null, created_at: '2026-03-05T00:00:00Z' }],
};

for (const theme of ['light', 'dark'] as const) {
  test(`ranks the companies by what needs a decision (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
    await stubSupabase(page, rows);
    await page.goto('/');
    const section = page.getByRole('region', { name: 'المنظومات' });
    await expect(section).toBeVisible();
    const links = section.getByRole('link');
    await expect(links).toHaveCount(2);
    await expect(links.first()).toHaveAccessibleName(/^منظومة النماء: 1 مشروع، تجاوز الموازنة 1$/);
    await expect(links.first()).toContainText('150% من الموازنة');
    const dir = process.env.MAP_SHOTS;
    if (dir) await section.screenshot({ path: `${dir}/companies-overview-${theme}.png`, animations: 'disabled' });
    await links.first().click();
    await expect(page).toHaveURL(new RegExp(`/company/${OTHER}$`));
  });
}
void COMPANY_ID;
