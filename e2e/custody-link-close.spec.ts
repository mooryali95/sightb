import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID, FUND_ID, USER_ID, seed } from './support/seed';

/**
 * Two things a custody does after it is opened. Linking one that was
 * opened without a fund draws its whole amount from that fund, so the
 * link is refused when the fund cannot cover it and written when it
 * can; and a custody whose spend has used it all up closes itself the
 * moment the page sees it, once, with the day's date, while one closed
 * earlier is left alone.
 */
const custody = (id: string, name: string, amount: number, over: Record<string, unknown> = {}) => ({
  id, project_id: PROJECT_ID, company_id: seed.projects[0].company_id, resource_id: null, resource_name: name,
  amount, date: '2026-02-10', received_date: '2026-02-10', status: 'active', source_fund_id: null, notes: null, closed_date: null,
  user_id: USER_ID, created_at: '2026-02-10T00:00:00Z', ...over,
});
const patches = (wire: { writes: { method: string; table: string; body: unknown }[] }) =>
  wire.writes.filter((w) => w.table === 'custodies' && w.method === 'PATCH').map((w) => w.body as Record<string, unknown>);

async function openCustodies(page: Page) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'المالية' }).click();
  const header = page.getByRole('button', { name: 'العهد', exact: true });
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
}
// Scoped to the custodies section: the expenses table names the custody too.
const rowOf = (page: Page, name: string) => page.getByRole('region', { name: 'العهد' }).getByRole('row').filter({ hasText: name }).first();

test('linking a custody to a fund is refused beyond the fund remainder and written within it', async ({ page }) => {
  const wire = await stubSupabase(page, { custodies: [custody('cu-big', 'عهدة كبيرة', 45000), custody('cu-small', 'عهدة صغيرة', 8000)] });
  await openCustodies(page);
  await expect(rowOf(page, 'عهدة كبيرة')).toBeVisible();

  // Fund #1 holds 50,000 less the seed's 12,000 expense: 38,000.
  await rowOf(page, 'عهدة كبيرة').getByRole('combobox').click();
  await page.getByRole('option', { name: /دفعة #1 — متاح 38,000\.00/ }).click();
  await expect(page.getByText('رصيد الدفعة لا يكفي. المتاح: 38,000.00 ر.س, المطلوب: 45,000.00 ر.س')).toBeVisible();
  expect(patches(wire)).toHaveLength(0);

  await rowOf(page, 'عهدة صغيرة').getByRole('combobox').click();
  await page.getByRole('option', { name: /دفعة #1 — متاح 38,000\.00/ }).click();
  await expect(page.getByText('تم ربط العهدة بالدفعة #1')).toBeVisible();
  await expect.poll(() => patches(wire).length).toBe(1);
  expect(patches(wire)[0]).toStrictEqual({ source_fund_id: FUND_ID });
  await expect(rowOf(page, 'عهدة صغيرة').getByRole('combobox')).toHaveCount(0);
});

test('a custody spent to nothing closes itself once, dated today', async ({ page }) => {
  const wire = await stubSupabase(page, {
    custodies: [
      custody('cu-done', 'عهدة مستهلكة', 5000, { source_fund_id: FUND_ID }),
      custody('cu-live', 'عهدة حيّة', 9000, { source_fund_id: FUND_ID }),
      // Closed long ago and fully spent: must not be closed again on load.
      custody('cu-old', 'عهدة قديمة', 3000, { source_fund_id: FUND_ID, status: 'closed', closed_date: '2026-03-01' }),
    ],
    expenses: [
      { id: 'ex-cu', project_id: PROJECT_ID, custody_id: 'cu-done', fund_id: FUND_ID, category: 'transport', description: 'وقود', amount: 5000, date: '2026-02-12', month: 2, approval_status: 'approved', is_vat_exempt: true, user_id: USER_ID, created_at: '2026-02-12T00:00:00Z' },
      { id: 'ex-old', project_id: PROJECT_ID, custody_id: 'cu-old', fund_id: FUND_ID, category: 'transport', description: 'وقود قديم', amount: 3000, date: '2026-02-20', month: 2, approval_status: 'approved', is_vat_exempt: true, user_id: USER_ID, created_at: '2026-02-20T00:00:00Z' },
    ],
  });
  await openCustodies(page);
  await expect(rowOf(page, 'عهدة مستهلكة')).toBeVisible();
  await expect.poll(() => patches(wire).length).toBe(1);
  const closed = patches(wire)[0];
  expect(closed.status).toBe('closed');
  expect(String(closed.closed_date)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await expect(rowOf(page, 'عهدة مستهلكة')).toContainText('مُغلقة');
  await expect(rowOf(page, 'عهدة حيّة')).toContainText('نشطة');
  // One close only: not a second on the re-render it causes, and none for the custody closed long ago.
  await page.waitForTimeout(1500);
  expect(patches(wire)).toHaveLength(1);
  await expect(rowOf(page, 'عهدة قديمة')).toContainText('مُغلقة');
});
