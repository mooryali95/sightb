import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID, USER_ID } from './support/seed';

/**
 * The earned value figures under an active baseline, on a fixed calendar
 * date that makes the sixth month the current one. The seed's project is
 * 40% done against a 400,000 baseline spread over twelve months, with
 * 12,000 spent: earned 160,000 against 200,000 planned to date. The
 * section lists the baselines with the active one marked, reads EV, AC,
 * CV, CPI, BAC, EAC, VAC and TCPI, the three EAC variants, and the
 * active baseline's items; a second baseline can be activated.
 */
const baseline = (id: string, name: string, version: number, is_active: boolean) => ({
  id, project_id: PROJECT_ID, user_id: USER_ID, name, version, is_active, total_planned: 400000, created_at: '2026-02-01T00:00:00Z',
});
const rows = {
  cost_baselines: [baseline('bl-1', 'الأولى', 1, true), baseline('bl-0', 'التجريبية', 0, false)],
  baseline_items: [
    { id: 'bli-1', baseline_id: 'bl-1', category: 'materials', description: 'بند المواد', planned_amount: 400000, month: null, start_month: null, end_month: null, cost_type: 'fixed' },
    { id: 'bli-0', baseline_id: 'bl-0', category: 'materials', description: 'بند قديم', planned_amount: 400000, month: null, start_month: null, end_month: null, cost_type: 'fixed' },
  ],
};

async function openBaseline(page: Page) {
  await page.clock.setFixedTime(new Date('2026-06-15T09:00:00Z'));
  const wire = await stubSupabase(page, rows);
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'المالية' }).click();
  const header = page.getByRole('button', { name: 'خط الأساس', exact: true });
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
  await expect(page.getByRole('heading', { name: 'خطوط الأساس (Cost Baselines)' })).toBeVisible();
  // The figures settle once the seed's spend has arrived.
  await expect(stat(page, 'التكلفة الفعلية (AC)')).toContainText('12,000.00 ر.س');
  return wire;
}
const stat = (page: Page, title: string) => page.locator('div.stat-card', { has: page.getByText(title, { exact: true }) }).first();
const variant = (page: Page, label: string) => page.getByText(label, { exact: true }).locator('..');

test('reads the earned value figures and the three EAC variants against the active baseline', async ({ page }) => {
  await openBaseline(page);
  await expect(page.getByText('أنشئ خط أساس من الموازنة الحالية لتتبع الأداء المالي · نسبة الإنجاز: 40% · الشهر الحالي: 6')).toBeVisible();
  await expect(stat(page, 'القيمة المكتسبة (EV)')).toContainText('160,000.00 ر.س');
  await expect(stat(page, 'القيمة المكتسبة (EV)')).toContainText('الإنجاز: 40%');
  await expect(stat(page, 'انحراف التكلفة (CV)')).toContainText('148,000.00 ر.س');
  await expect(stat(page, 'مؤشر الأداء (CPI)')).toContainText('13.33');
  await expect(stat(page, 'مؤشر الأداء (CPI)')).toContainText('ضمن الميزانية');
  await expect(stat(page, 'الميزانية الكلية (BAC)')).toContainText('400,000.00 ر.س');
  await expect(stat(page, 'التقدير للإنجاز (EAC)')).toContainText('30,000.00 ر.س');
  await expect(stat(page, 'الانحراف عند الإنجاز (VAC)')).toContainText('370,000.00 ر.س');
  await expect(stat(page, 'TCPI (BAC)')).toContainText('0.62');
  await expect(stat(page, 'TCPI (BAC)')).toContainText('ضمن النطاق');

  await expect(variant(page, 'EAC — الأداء يستمر (Typical)')).toContainText('30,000.00 ر.س');
  // AC + (BAC − EV) = 12,000 + 240,000.
  await expect(variant(page, 'EAC — الأداء يتحسن (Atypical)')).toContainText('252,000.00 ر.س');
  // AC + (BAC − EV) / (CPI × SPI) = 12,000 + 240,000 / (13.33 × 0.8).
  await expect(variant(page, 'EAC — مرجّح (Combined)')).toContainText('34,500.00 ر.س');

  const details = page.locator('div.stat-card', { has: page.getByRole('heading', { name: 'تفاصيل خط الأساس النشط: الأولى' }) });
  await expect(details.getByRole('table')).toContainText('بند المواد');
  await expect(details.getByRole('table')).not.toContainText('بند قديم');
});

test('lists the baselines with the active one marked, and activating another switches it on the server', async ({ page }) => {
  const wire = await openBaseline(page);
  const card = page.locator('div.stat-card', { has: page.getByRole('heading', { name: 'خطوط الأساس (Cost Baselines)' }) });
  const row = (name: string) => card.locator('div.rounded-lg.border', { hasText: name }).first();
  await expect(row('الأولى')).toContainText('v1');
  await expect(row('الأولى')).toContainText('1 بند · 400,000.00 ر.س');
  await expect(row('الأولى').getByRole('button', { name: 'تفعيل' })).toHaveCount(0);
  await row('التجريبية').getByRole('button', { name: 'تفعيل' }).click();
  const patches = () => wire.writes.filter((w) => w.table === 'cost_baselines' && w.method === 'PATCH').map((w) => w.body as Record<string, unknown>);
  await expect.poll(() => patches().length).toBeGreaterThanOrEqual(2);
  expect(patches()).toEqual(expect.arrayContaining([{ is_active: false }, { is_active: true }]));
});
