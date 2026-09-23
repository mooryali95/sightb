import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { COMPANY_ID, USER_ID, seed } from './support/seed';

/**
 * A portfolio's totals are plain sums across its projects, so they carry a
 * meaning only while the projects share a currency. Holding a riyal project
 * next to a dollar one, the page says so above the totals, naming each
 * distinct code once; projects stored with a legacy symbol or no currency
 * at all read as riyals and raise nothing.
 */
const PORTFOLIO_ID = '77777777-7777-4777-8777-777777777731';
const portfolio = { id: PORTFOLIO_ID, company_id: COMPANY_ID, user_id: USER_ID, name: 'محفظة العملات', description: null, target_revenue: 0, target_margin: 0, fiscal_year: null, notes: null, created_at: '2026-01-01T00:00:00Z' };
const project = (id: string, name: string, currency: string | null) => ({ ...seed.projects[0], id, portfolio_id: PORTFOLIO_ID, name, currency });

test('a riyal project beside dollar ones marks the totals as unsound, naming each currency once', async ({ page }) => {
  await stubSupabase(page, {
    portfolios: [portfolio],
    projects: [project('p-usd', 'مشروع بالدولار', 'USD'), project('p-sar', 'مشروع بالريال', 'SAR'), project('p-sym', 'مشروع برمز الدولار', '$')],
  });
  await page.goto(`/portfolio/${PORTFOLIO_ID}`);
  await expect(page.getByText('محفظة العملات').first()).toBeVisible();
  const notice = page.getByRole('alert').filter({ hasText: 'المجاميع أدناه غير قابلة للجمع' });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('تضم هذه المحفظة مشاريع بعملات مختلفة');
  await expect(notice.locator('[dir="ltr"]')).toHaveText('SAR · USD');
  await expect(notice).toContainText('لا يجري تحويل تلقائي عمداً');
  await expect(page.getByText('3 مشروع').first()).toBeVisible();
});

test('a legacy symbol and a missing currency both read as riyals and raise nothing', async ({ page }) => {
  await stubSupabase(page, {
    portfolios: [portfolio],
    projects: [project('p-sar', 'مشروع بالريال', 'SAR'), project('p-old', 'مشروع قديم', 'ر.س'), project('p-none', 'مشروع بلا عملة', null)],
  });
  await page.goto(`/portfolio/${PORTFOLIO_ID}`);
  await expect(page.getByText('محفظة العملات').first()).toBeVisible();
  await expect(page.getByText('3 مشروع').first()).toBeVisible();
  await expect(page.getByText('المجاميع أدناه غير قابلة للجمع')).toHaveCount(0);
  await expect(page.getByText('3,000,000.00 ر.س').first()).toBeVisible();
});
