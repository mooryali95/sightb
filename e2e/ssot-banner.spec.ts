import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID } from './support/seed';

/**
 * The health banner under the project's header. Opening the project asks
 * the database for the financial summary once; the banner says the
 * figures match and stamps the server's time, and its details button opens
 * the source-of-truth tab without asking again. Two figures the server
 * disagrees on are counted and named as the reason, and the refresh button
 * asks again and reads the new answer. A refusal from the server reads as
 * a failed check with the mapped reason.
 */
const agreeing = {
  project_id: PROJECT_ID, currency: 'SAR', computed_at: '2026-09-19T10:00:00Z',
  total_actual_expenses: 12000, total_transferred_funds: 50000, outstanding_advances: 0,
  total_custody_draw: 0, custody_in_hand: 0, remaining_funds: 38000, profit: 988000,
};
const rpcCalls = (wire: { writes: { method: string; table: string; body: unknown }[] }) =>
  wire.writes.filter((w) => w.method === 'RPC' && w.table === 'project_financial_summary');
const banner = (page: Page) => page.locator('div.rounded-lg.border', { hasText: 'آخر حساب SSOT' }).or(page.locator('div.rounded-lg.border', { hasText: /التحقق|تعارض/ })).first();

async function openProject(page: Page) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
}

test('asks the server once, reports a match with the server time, and the details button opens the source-of-truth tab without asking again', async ({ page }) => {
  const wire = await stubSupabase(page, {}, {}, { project_financial_summary: () => agreeing });
  await openProject(page);
  const strip = banner(page);
  await expect(strip).toContainText('لا توجد تعارضات — أرقام الواجهة مطابقة للخادم');
  await expect(strip).toContainText('آخر حساب SSOT: 19/09/2026');
  await expect(strip).not.toContainText('السبب:');
  await strip.getByRole('button', { name: 'عرض التفاصيل' }).click();
  await expect(page.getByRole('tab', { name: 'مصدر الحقيقة' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('مطابقة أرقام الخادم (المرجع النهائي)')).toBeVisible();
  await expect(page.getByText('مطابق تماماً')).toBeVisible();
  await page.waitForTimeout(500);
  expect(rpcCalls(wire)).toHaveLength(1);
  expect(rpcCalls(wire)[0].body).toStrictEqual({ _project_id: PROJECT_ID });
});

test('counts and names the figures the server disagrees on, and the refresh asks again and reads the new answer', async ({ page }) => {
  let answers = 0;
  const wire = await stubSupabase(page, {}, {}, {
    project_financial_summary: () => (++answers === 1 ? { ...agreeing, total_actual_expenses: 11000, profit: 989000 } : agreeing),
  });
  await openProject(page);
  const strip = banner(page);
  await expect(strip).toContainText('2 تعارض في الأرقام');
  await expect(strip).toContainText('السبب: إجمالي المصروفات الفعلية، الربح المتوقع');
  await expect(strip).not.toContainText('لا توجد تعارضات');
  expect(rpcCalls(wire)).toHaveLength(1);

  await strip.getByRole('button').first().click();
  await expect(strip).toContainText('لا توجد تعارضات — أرقام الواجهة مطابقة للخادم');
  await expect(strip).not.toContainText('السبب:');
  expect(rpcCalls(wire)).toHaveLength(2);
});

test('a refusal from the server reads as a failed check with the mapped reason', async ({ page }) => {
  const wire = await stubSupabase(page);
  await page.route('**/rest/v1/rpc/project_financial_summary**', (route) => {
    wire.writes.push({ method: 'RPC', table: 'project_financial_summary', body: route.request().postDataJSON() });
    return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: '42501', message: 'insufficient_permission', details: null, hint: null }) });
  });
  await openProject(page);
  const strip = banner(page);
  await expect(strip).toContainText('تعذّر التحقق من أرقام الخادم');
  await expect(strip).toContainText('لا تملك صلاحية عرض الملخص المالي لهذا المشروع.');
  await expect(strip).not.toContainText('آخر حساب SSOT');
  await expect.poll(() => rpcCalls(wire).length).toBeGreaterThanOrEqual(1);
});
