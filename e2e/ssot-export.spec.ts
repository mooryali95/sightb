import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID, USER_ID } from './support/seed';
import { readFileSync } from 'node:fs';

// Since 98ffa67 this lives in the owner-only control center (/control-center),
// so the seeded user is also given the system owner role.
const OWNER_ROLE = { id: 'role-owner-cc', user_id: USER_ID, role: 'owner', scope_type: 'system', scope_id: null };

/**
 * The CSV export on the source-of-truth tab. It names the project and
 * the server's last computation, sets the profitability figures out of
 * the audit, lists the fund settlements by fund number, writes each
 * reconciliation row with its verdict, and ends with the source of every
 * component; a disagreement with the server is written as a conflict
 * with its reason.
 */
const server = (over: Record<string, unknown> = {}) => ({
  project_id: PROJECT_ID, currency: 'SAR', computed_at: '2026-09-19T10:00:00Z',
  total_actual_expenses: 12000, total_transferred_funds: 50000, outstanding_advances: 0,
  total_custody_draw: 0, custody_in_hand: 0, remaining_funds: 38000, profit: 988000, ...over,
});
async function exportCsv(page: import('@playwright/test').Page) {
  // The headless shell reports a non-Latin download name as "download", so the name is read off the anchor itself.
  await page.addInitScript(() => {
    const names: string[] = [];
    (window as unknown as { __downloads: string[] }).__downloads = names;
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) { if (this.download) names.push(this.download); return click.call(this); };
  });
  await page.goto('/control-center');
  await expect(page.getByRole('heading', { name: 'مركز الرقابة' })).toBeVisible();
  await expect(page.getByText('مطابقة أرقام الخادم (المرجع النهائي)')).toBeVisible();
  // The rows are compared once the server has answered; the badge says so.
  await expect(page.getByText(/مطابق تماماً|\d+ فرق/)).toBeVisible();
  await page.getByRole('button', { name: /تصدير الربحية والمطابقة/ }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: /CSV/ }).click();
  const file = await download;
  await expect(page.getByText('تم تصدير ملف CSV').first()).toBeVisible();
  const [name] = await page.evaluate(() => (window as unknown as { __downloads: string[] }).__downloads);
  return { name, csv: readFileSync(await file.path() as string, 'utf8') };
}

test('writes the project, the server time, the profitability, the settlement and every reconciliation row as matching', async ({ page }) => {
  await stubSupabase(page, { user_roles: [OWNER_ROLE] }, {}, { project_financial_summary: () => server() });
  const { name, csv } = await exportCsv(page);
  expect(name).toBe('ssot-مشروع الاختبار.csv');
  expect(csv).toContain('المشروع,مشروع الاختبار');
  expect(csv).toContain('العملة,SAR');
  expect(csv).toContain('آخر حساب على الخادم,2026-09-19T10:00:00.000Z');
  expect(csv).toContain('قيمة العقد,1000000');
  expect(csv).toContain('أوامر التغيير المعتمدة,0');
  expect(csv).toContain('المصروفات الفعلية,12000');
  expect(csv).toContain('الربح المتوقع,988000');
  expect(csv).toContain('هامش الربح %,98.80');
  expect(csv).toContain('دفعة #1,draft,50000,0,0');
  expect(csv).toContain('إجمالي المصروفات الفعلية,12000,12000,0,مطابق,');
  expect(csv).toContain('المتبقي من الدفعات,38000,38000,0,مطابق,');
  expect(csv).not.toContain('تعارض');
  expect(csv).toContain('تدقيق مصدر كل رقم');
  expect(csv).toMatch(/إجمالي المصروفات الفعلية,[^\n]*,expenses/);
});

test('a figure the server disagrees on is written as a conflict with its delta and reason', async ({ page }) => {
  await stubSupabase(page, { user_roles: [OWNER_ROLE] }, {}, { project_financial_summary: () => server({ total_actual_expenses: 11000 }) });
  const { csv } = await exportCsv(page);
  expect(csv).toMatch(/إجمالي المصروفات الفعلية,11000,12000,1000,تعارض,[^\n]*,"?غالباً مصروف أُضيف/);
  expect(csv).toContain('الربح المتوقع,988000,988000,0,مطابق,');
});
