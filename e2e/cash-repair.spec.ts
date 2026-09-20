import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID, FUND_ID, USER_ID, seed } from './support/seed';

/**
 * Cash integrity on the funds tab. A transfer into a custody whose fund no
 * longer exists inflates what the custody holder is counted as holding.
 * The card names it with its amount; repairing it needs a reason of five
 * characters, then hands the transfer and the reason to the database
 * function, which removes the transfer and records the repair; the card
 * comes back clean, the holders' figure drops by the transfer, and the
 * repair log lists the repair with its reason.
 */
const MISSING_FUND = '33333333-3333-4333-8333-333333333399';
const custody = { id: 'cu-1', project_id: PROJECT_ID, company_id: seed.projects[0].company_id, resource_id: null, resource_name: 'عهدة سامي',
  amount: 8000, date: '2026-02-10', received_date: '2026-02-10', status: 'active', source_fund_id: FUND_ID, notes: null, closed_date: null,
  user_id: USER_ID, created_at: '2026-02-10T00:00:00Z' };
const transfer = (id: string, from_fund_id: string, amount: number) => ({
  id, project_id: PROJECT_ID, from_fund_id, to_custody_id: 'cu-1', amount, transfer_date: '2026-02-15', notes: null, created_at: '2026-02-15T00:00:00Z',
});

async function openFunds(page: Page) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'المالية' }).click();
  const header = page.getByRole('button', { name: 'الدفعات', exact: true });
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
  const region = page.getByRole('region', { name: 'الدفعات' });
  await expect(region.getByText('سلامة الترابط النقدي')).toBeVisible();
  return region;
}
const holders = (page: Page) => page.getByText('بيد حاملي العُهد', { exact: true }).locator('..').locator('..');
// Toast titles are matched exactly: the toaster also announces them in a live region that repeats the title with the body.
const rpcCalls = (wire: { writes: { method: string; table: string; body: unknown }[] }) =>
  wire.writes.filter((w) => w.method === 'RPC' && w.table === 'repair_orphan_cash_transfer');

test('a transfer backed by a fund leaves the card clean and counts in the holders\' hands', async ({ page }) => {
  await stubSupabase(page, { custodies: [custody], cash_transfers: [transfer('ct-ok', FUND_ID, 1000)] });
  const region = await openFunds(page);
  await expect(region.getByText('لا توجد تحويلات بلا مصدر')).toBeVisible();
  await expect(region.getByText('لا توجد عمليات إصلاح مسجّلة لهذا المشروع')).toBeVisible();
  await expect(holders(page)).toContainText('9,000.00 ر.س');
});

test('an orphan transfer is named, needs a reason, and is repaired through the database function', async ({ page }) => {
  const wire = await stubSupabase(page, { custodies: [custody], cash_transfers: [transfer('ct-ok', FUND_ID, 1000), transfer('ct-orphan', MISSING_FUND, 2500)] }, {}, {
    repair_orphan_cash_transfer: (args, tables) => {
      const a = args as Record<string, string>;
      tables.cash_transfers = tables.cash_transfers.filter((t) => t.id !== a._transfer_id);
      tables.cash_transfer_repairs = [...(tables.cash_transfer_repairs ?? []), {
        id: 'rep-1', project_id: PROJECT_ID, transfer_id: a._transfer_id, custody_id: 'cu-1', custody_name: 'عهدة سامي', amount: 2500,
        transfer_date: '2026-02-15', missing_fund_id: MISSING_FUND, reason: a._reason, before_snapshot: null, after_snapshot: null,
        performed_by: USER_ID, performed_by_email: 'e2e@example.com', created_at: '2026-09-19T12:00:00Z',
      }];
      return { repair_id: 'rep-1' };
    },
  });
  const region = await openFunds(page);
  await expect(region.getByText('1 تحويل بلا مصدر')).toBeVisible();
  await expect(region.getByText('هذه التحويلات ترفع رصيد العهدة بمقدار 2,500.00 ر.س دون دفعة أصل.')).toBeVisible();
  await expect(region.getByText('عهدة سامي · 2,500.00 ر.س')).toBeVisible();
  await expect(holders(page)).toContainText('11,500.00 ر.س');

  await region.getByRole('button', { name: 'إصلاح', exact: true }).click();
  await expect(page.getByText('إصلاح تحويل بلا دفعة أصل')).toBeVisible();
  await page.getByPlaceholder(/سجل يتيم ناتج عن حذف دفعة سابقة/).fill('قصير');
  await page.getByRole('button', { name: 'تنفيذ الإصلاح' }).click();
  await expect(page.getByText('سبب الإصلاح مطلوب', { exact: true })).toBeVisible();
  expect(rpcCalls(wire)).toHaveLength(0);

  await page.getByPlaceholder(/سجل يتيم ناتج عن حذف دفعة سابقة/).fill('  سجل يتيم بعد حذف الدفعة الثانية  ');
  await page.getByRole('button', { name: 'تنفيذ الإصلاح' }).click();
  await expect(page.getByText('تم الإصلاح', { exact: true })).toBeVisible();
  expect(rpcCalls(wire)).toHaveLength(1);
  expect(rpcCalls(wire)[0].body).toStrictEqual({ _transfer_id: 'ct-orphan', _reason: 'سجل يتيم بعد حذف الدفعة الثانية' });
  await expect(region.getByText('لا توجد تحويلات بلا مصدر')).toBeVisible();
  await expect(holders(page)).toContainText('9,000.00 ر.س');
  await expect(region.getByText('سجل يتيم بعد حذف الدفعة الثانية')).toBeVisible();
  await expect(region.getByText('لا توجد عمليات إصلاح مسجّلة لهذا المشروع')).toHaveCount(0);
});
