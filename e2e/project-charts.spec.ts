import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID, seed } from './support/seed';

/**
 * The charts on the tracking tab. The pie splits the counted spend by
 * category with a share each, the bars and the trend read the same
 * monthly spend (a rejected expense in neither), the trend adds the
 * running burn rate and the plan's monthly average, and the variance
 * table grades each month with spend against its planned share, carrying
 * the cumulative variance and leaving the months without spend unjudged.
 */
const expense = (id: string, category: string, month: number, amount: number, approval_status = 'approved') => ({
  ...seed.expenses[0], id, project_id: PROJECT_ID, fund_id: null, category, month, amount, approval_status, description: `${category} ${month}`,
});
const rows = {
  expenses: [
    expense('ex-c4', 'consulting', 4, 5000),
    expense('ex-c4r', 'consulting', 4, 9000, 'rejected'),
    expense('ex-t5', 'travel', 5, 2000, 'pending'),
  ],
};

async function openCharts(page: Page) {
  await stubSupabase(page, rows);
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'المتابعة' }).click();
  const header = page.getByRole('button', { name: 'التحليلات', exact: true });
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
  await expect(page.getByRole('heading', { name: 'المصروفات حسب الفئة' })).toBeVisible();
}
const card = (page: Page, title: string) => page.locator('div.stat-card', { has: page.getByRole('heading', { name: title }) }).first();
/** Hovers a chart at one of its shapes (a bar, or a dot on the actual line) and returns its tooltip. */
async function hoverShape(page: Page, title: string, shape: string, nth: number) {
  const chart = card(page, title).locator('.recharts-wrapper');
  // The mouse only reaches what the viewport shows.
  await chart.scrollIntoViewIfNeeded();
  const area = (await chart.boundingBox())!;
  const box = (await chart.locator(shape).nth(nth).boundingBox())!;
  await page.mouse.move(area.x + 5, area.y + area.height / 2);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
  return chart.locator('.recharts-tooltip-wrapper');
}

test('the pie shares the counted spend by category, and the bars and the trend read the same month', async ({ page }) => {
  await openCharts(page);
  const pie = card(page, 'المصروفات حسب الفئة');
  await expect(pie.getByText('materials (63%)')).toBeVisible();
  await expect(pie.getByText('استشارات (26%)')).toBeVisible();
  await expect(pie.getByText('سفر وتنقل (11%)')).toBeVisible();

  // Only the months with spend draw a bar: the second is month 4.
  const bars = await hoverShape(page, 'المصروفات الشهرية', 'path.recharts-rectangle', 1);
  await expect(bars).toContainText('مصروفات : 5,000.00 ر.س');
  const trend = await hoverShape(page, 'اتجاه الصرف الشهري', '.recharts-line-dots circle', 3);
  await expect(trend).toContainText('الفعلي : 5,000.00 ر.س');
  // (12,000 + 5,000) over four months; 400,000 over twelve.
  await expect(trend).toContainText('معدل الحرق : 4,250.00 ر.س');
  await expect(trend).toContainText('المتوسط المخطط : 33,333.00 ر.س');
});

test('the variance table grades the months with spend and carries the cumulative variance', async ({ page }) => {
  await openCharts(page);
  const table = card(page, 'تحليل الانحراف الشهري').getByRole('table');
  await expect(table.getByRole('row')).toHaveCount(13);
  const row = (month: number) => table.getByRole('row').filter({ has: page.getByRole('cell', { name: `شهر ${month}`, exact: true }) });
  await expect(row(1)).toContainText('33,333.33 ر.س');
  await expect(row(1)).toContainText('لم يحل');
  await expect(row(1)).toContainText('—');
  await expect(row(3)).toContainText('12,000.00 ر.س');
  await expect(row(3)).toContainText('+21,333.33 ر.س');
  await expect(row(3)).toContainText('+64.0%');
  await expect(row(3)).toContainText('88,000.00 ر.س');
  await expect(row(3)).toContainText('وفر 👍');
  await expect(row(4)).toContainText('5,000.00 ر.س');
  await expect(row(4)).toContainText('+28,333.33 ر.س');
  await expect(row(5)).toContainText('2,000.00 ر.س');
  await expect(row(5)).toContainText('147,666.67 ر.س');
  await expect(row(6)).toContainText('لم يحل');
});
