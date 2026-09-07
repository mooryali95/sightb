import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID } from './support/seed';

/**
 * Settling a fund. The fixture is a 50,000 fund with 12,000 already spent
 * against it, so the cash still in hand must be 38,000 for the settlement to
 * balance. The number the user types is reconciled against what the ledger
 * already knows — received − spent − cash-in-hand — and a mismatch of more
 * than one unit has to be explained before it can be sent.
 *
 * That guard is the point of the test. Without it a fund can be closed on a
 * figure nobody accounted for, and the difference disappears into the project.
 */
async function openFundsTab(page: import('@playwright/test').Page) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'المالية' }).click();
  // The sections inside a tab group are an accordion, not nested tabs, so the
  // section header is a button that has to be expanded before its content
  // exists in the DOM at all.
  await page.getByRole('button', { name: 'الدفعات' }).click();
}

test('submits a balanced settlement with the reconciled figures', async ({ page }) => {
  const wire = await stubSupabase(page);
  await openFundsTab(page);

  await page.getByRole('button', { name: 'تسوية' }).first().click();
  await expect(page.getByText('تسوية الدفعة #1')).toBeVisible();

  const cash = page.locator('input[type="number"]').first();
  await cash.fill('38000');

  await page.getByRole('button', { name: 'إرسال للاعتماد' }).click();
  await expect(page.getByText('تم إرسال التسوية للاعتماد')).toBeVisible();

  const write = wire.writes.find((w) => w.table === 'fund_settlements' && w.method === 'PATCH');
  expect(write, 'the settlement should have been patched').toBeTruthy();

  const body = write!.body as Record<string, unknown>;
  expect(Number(body.remaining_cash)).toBe(38000);
  expect(body.status).toBe('submitted');
});

test('will not send an unexplained difference', async ({ page }) => {
  const wire = await stubSupabase(page);
  await openFundsTab(page);

  await page.getByRole('button', { name: 'تسوية' }).first().click();
  await expect(page.getByText('تسوية الدفعة #1')).toBeVisible();

  // 50,000 − 12,000 − 37,000 leaves 1,000 unaccounted for.
  await page.locator('input[type="number"]').first().fill('37000');
  await page.getByRole('button', { name: 'إرسال للاعتماد' }).click();

  // Wait for the refusal before asserting that nothing was written. Checking
  // the wire straight after the click proves nothing: it runs before any
  // request could have been made, so it passes whether the guard exists or
  // not — which is exactly what happened when this was first written, and only
  // showed up when the guard was deleted on purpose and the test stayed green.
  await expect(page.getByText('يجب توضيح سبب الفرق')).toBeVisible();
  expect(wire.writes.filter((w) => w.table === 'fund_settlements')).toHaveLength(0);
});
