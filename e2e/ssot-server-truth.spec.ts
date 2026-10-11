import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID } from './support/seed';

/**
 * The server truth card on the source-of-truth tab. The page asks the
 * database for the project's financial summary once, with the project id,
 * and sets the seven figures it computes itself beside the server's. When
 * they agree the card says so; when one differs the card counts the
 * difference, marks the row with the delta, and opening it explains the
 * likely cause.
 */
// What the browser computes from the seed: one 50,000 fund and one 12,000 expense on a 1,000,000 contract.
const agreeing = {
  project_id: PROJECT_ID, currency: 'SAR', computed_at: '2026-09-19T10:00:00Z',
  total_actual_expenses: 12000, total_transferred_funds: 50000, outstanding_advances: 0,
  total_custody_draw: 0, custody_in_hand: 0, remaining_funds: 38000, profit: 988000,
};
const rpcCalls = (wire: { writes: { method: string; table: string; body: unknown }[] }) =>
  wire.writes.filter((w) => w.method === 'RPC' && w.table === 'project_financial_summary');

async function openTruth(page: Page) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  // The group holds one section, rendered straight into the panel with no header to open.
  await page.getByRole('tab', { name: 'مصدر الحقيقة' }).click();
  await expect(page.getByText('مطابقة أرقام الخادم (المرجع النهائي)')).toBeVisible();
}
const row = (page: Page, label: string) => page.getByRole('button', { name: new RegExp(`^${label} `) });

test('asks the server once for the project and reports a full match when the figures agree', async ({ page }) => {
  const wire = await stubSupabase(page, {}, {}, { project_financial_summary: () => agreeing });
  await openTruth(page);
  await expect(page.getByText('مطابق تماماً')).toBeVisible();
  await expect(page.getByText('لا توجد تعارضات — أرقام الواجهة مطابقة للخادم')).toBeVisible();
  await expect(rpcCalls(wire)[0]?.body).toStrictEqual({ _project_id: PROJECT_ID });
  await expect(row(page, 'إجمالي المصروفات الفعلية')).toContainText('12,000.00 ر.س');
  await expect(row(page, 'المتبقي من الدفعات')).toContainText('38,000.00 ر.س');
  await expect(row(page, 'الربح المتوقع')).toContainText('988,000.00 ر.س');
  await expect(page.getByText(/Δ /)).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(rpcCalls(wire)).toHaveLength(1);
});

test('counts a figure the server disagrees on, marks its delta, and explains the likely cause', async ({ page }) => {
  await stubSupabase(page, {}, {}, { project_financial_summary: () => ({ ...agreeing, total_actual_expenses: 11000 }) });
  await openTruth(page);
  await expect(page.getByText('1 فرق')).toBeVisible();
  await expect(page.getByText('مطابق تماماً')).toHaveCount(0);
  const actual = row(page, 'إجمالي المصروفات الفعلية');
  await expect(actual).toContainText('11,000.00 ر.س');
  await expect(actual).toContainText('(Δ 1,000.00 ر.س)');
  await expect(row(page, 'الربح المتوقع')).not.toContainText('Δ');
  await actual.click();
  await expect(page.getByText(/^سبب الفرق المحتمل: غالباً مصروف أُضيف/)).toBeVisible();
});
