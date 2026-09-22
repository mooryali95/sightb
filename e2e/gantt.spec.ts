import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID, USER_ID } from './support/seed';

/**
 * The Gantt view of the milestones, on a fixed calendar date. Only dated
 * milestones are drawn, over a range padded a week before the earliest
 * date and two weeks after the latest, in month columns or week columns;
 * each planned bar sits at its dates' share of the range with the progress
 * filled, an actual bar runs under it from the actual start, the today
 * marker stands inside the range and only then, a bar's tooltip reads the
 * milestone, and a row opens the milestone for editing.
 */
const milestone = (id: string, name: string, status: string, weight: number, pct: number, dates: Record<string, string | null>) => ({
  id, project_id: PROJECT_ID, name, description: null, weight, percent_complete: pct, status, sort_order: 1,
  planned_start: null, planned_end: null, actual_start: null, actual_end: null, linked_revenue_id: null, user_id: USER_ID,
  created_at: '2026-01-01T00:00:00Z', ...dates,
});
const milestones = [
  milestone('ms-sign', 'التعاقد', 'completed', 0.2, 100, { planned_start: '2026-01-10', planned_end: '2026-02-10', actual_start: '2026-01-12', actual_end: '2026-02-05' }),
  milestone('ms-design', 'التصميم', 'in_progress', 0.5, 40, { planned_start: '2026-03-01', planned_end: '2026-07-31', actual_start: '2026-03-05' }),
  milestone('ms-supply', 'التوريد', 'delayed', 0.2, 10, { planned_start: '2026-05-01', planned_end: '2026-06-01' }),
  milestone('ms-undated', 'بلا تاريخ', 'planned', 0.1, 0, {}),
];

async function openGantt(page: Page, rows: Record<string, unknown>[]) {
  await page.clock.setFixedTime(new Date('2026-06-15T09:00:00Z'));
  await stubSupabase(page, { milestones: rows });
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'التخطيط' }).click();
  await page.getByRole('tab', { name: 'Gantt' }).click();
}
const gantt = (page: Page) => page.locator('div.space-y-3', { has: page.getByRole('heading', { name: 'المخطط الزمني (Gantt)' }) }).first();
const columns = (page: Page) => gantt(page).locator('div.flex.border-b.border-border > div.flex-1 > div');
const row = (page: Page, name: string) => gantt(page).locator('div.flex.items-center.border-b', { hasText: name });

test('draws the dated milestones over a padded range in month columns, with their bars, fills, actuals and the today marker', async ({ page }) => {
  await openGantt(page, milestones);
  const chart = gantt(page);
  await expect(chart.getByRole('heading', { name: 'المخطط الزمني (Gantt)' })).toBeVisible();
  // 3 January to 14 August: eight month columns.
  await expect(columns(page)).toHaveCount(8);
  await expect(columns(page).first()).toHaveText('يناير 2026');
  await expect(columns(page).last()).toHaveText('أغسطس 2026');
  await expect(chart.locator('div.absolute.top-2')).toHaveCount(3);
  await expect(chart.getByText('بلا تاريخ')).toHaveCount(0);
  await expect(chart.getByText('اليوم')).toHaveCount(2);

  const design = row(page, 'التصميم');
  await expect(design).toContainText('40%');
  // 57 days into a 223-day range, 152 days wide.
  await expect(design.locator('div.absolute.top-2')).toHaveAttribute('style', /right: 25\.56\d*%; width: 68\.16\d*%/);
  await expect(design.locator('div.absolute.top-2 > div')).toHaveAttribute('style', /width: 40%/);
  await expect(design.locator('div.absolute.top-6')).toHaveCount(1);
  const done = row(page, 'التعاقد');
  await expect(done).toContainText('100%');
  await expect(done.locator('div.absolute.top-2 > div')).toHaveCount(0);
  await expect(done.locator('div.absolute.top-6')).toHaveCount(1);
  await expect(row(page, 'التوريد').locator('div.absolute.top-6')).toHaveCount(0);

  await design.locator('div.absolute.top-2').hover();
  const tip = page.getByRole('tooltip');
  await expect(tip).toContainText('التصميم');
  await expect(tip).toContainText('الحالة: جاري التنفيذ');
  await expect(tip).toContainText('الإنجاز: 40%');
  await expect(tip).toContainText('بداية مخططة: 2026-03-01');
  await expect(tip).toContainText('نهاية مخططة: 2026-07-31');
  await expect(tip).toContainText('بداية فعلية: 2026-03-05');
  await expect(tip).not.toContainText('نهاية فعلية');
  await expect(tip).toContainText('الوزن: 0.5');

  await chart.getByRole('combobox').click();
  await page.getByRole('option', { name: 'أسبوعي' }).click();
  // Weeks from the Sunday before the range's start, 28 December, to its end.
  await expect(columns(page)).toHaveCount(33);
  await expect(columns(page).first()).toHaveText('28/12');
  await expect(chart.locator('div.absolute.top-2')).toHaveCount(3);

  await design.getByText('التصميم').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('input').first()).toHaveValue('التصميم');
});

test('with no dated milestone the chart says so, and a range in the past carries no today marker', async ({ page }) => {
  await openGantt(page, [milestones[3]]);
  await expect(page.getByText('لا توجد مراحل بتواريخ محددة لعرضها في المخطط الزمني')).toBeVisible();

  await page.goto(`/project/${PROJECT_ID}`);
  await page.route('**/rest/v1/milestones**', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify([milestone('ms-old', 'مرحلة قديمة', 'completed', 1, 100, { planned_start: '2025-02-01', planned_end: '2025-03-01' })]),
  }));
  await page.reload();
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'التخطيط' }).click();
  await page.getByRole('tab', { name: 'Gantt' }).click();
  await expect(row(page, 'مرحلة قديمة')).toBeVisible();
  await expect(columns(page)).toHaveCount(3);
  await expect(gantt(page).getByText('اليوم')).toHaveCount(1);
});
