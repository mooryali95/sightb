import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID, COMPANY_ID, USER_ID } from './support/seed';

/**
 * The month snapshot on the dashboard. One press writes one snapshot per
 * project, portfolio and company, keyed on the entity and the current
 * period, carrying the figures the dashboard shows at that moment, and
 * says how many it saved. The seed has one project and one company, so
 * two go out; a portfolio adds a third.
 */
const period = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};
const snapshots = (wire: { writes: { method: string; table: string; body: unknown }[] }) =>
  wire.writes.filter((w) => w.table === 'periodic_snapshots' && w.method === 'POST').map((w) => w.body as Record<string, unknown>);

test('one press writes a snapshot per project and company for the current period, with the figures of the moment', async ({ page }) => {
  const wire = await stubSupabase(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'إدارة الشركات' })).toBeVisible();
  await page.getByRole('button', { name: 'حفظ لقطة الشهر الحالي' }).click();
  await expect(page.getByText(`تم حفظ 2 لقطة للفترة ${period()}`).first()).toBeVisible();

  await expect.poll(() => snapshots(wire).length).toBe(2);
  const [project, company] = snapshots(wire);
  expect(project).toMatchObject({ user_id: USER_ID, entity_type: 'project', entity_id: PROJECT_ID, period: period() });
  expect(project.metrics).toMatchObject({ totalPlanned: 400000, totalActual: 12000, effectiveContractValue: 1000000, plannedProfit: 600000, budgetRemaining: 388000 });
  expect(company).toMatchObject({ entity_type: 'company', entity_id: COMPANY_ID, period: period() });
  expect(company.metrics).toMatchObject({ companyId: COMPANY_ID, companyName: 'شركة الاختبار', totalContractValue: 1000000, totalActual: 12000, totalPlannedProfit: 600000, totalIndirectCosts: 0 });
  expect(String(project.snapshot_date)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
});

test('a portfolio is snapshotted too, between the projects and the companies', async ({ page }) => {
  const PORTFOLIO_ID = '99999999-9999-4999-8999-999999999977';
  const wire = await stubSupabase(page, {
    portfolios: [{ id: PORTFOLIO_ID, company_id: COMPANY_ID, name: 'محفظة التطوير', description: null, target_revenue: 0, target_margin: 0, fiscal_year: null, user_id: USER_ID, created_at: '2026-01-01T00:00:00Z' }],
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'إدارة الشركات' })).toBeVisible();
  await page.getByRole('button', { name: 'حفظ لقطة الشهر الحالي' }).click();
  await expect(page.getByText(`تم حفظ 3 لقطة للفترة ${period()}`).first()).toBeVisible();
  await expect.poll(() => snapshots(wire).length).toBe(3);
  expect(snapshots(wire).map((s) => s.entity_type)).toEqual(['project', 'portfolio', 'company']);
  expect(snapshots(wire)[1].entity_id).toBe(PORTFOLIO_ID);
});
