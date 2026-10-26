import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID, USER_ID } from './support/seed';

/**
 * Closing a fund. A submitted settlement is the manager's account of a
 * fund; approving it is the moment the fund leaves the books, so the
 * approval must stamp who approved and when, and settle the fund in the
 * same breath. A rejection must carry a written reason and hand the fund
 * back as acknowledged, still open, so nothing disappears unexplained.
 */
const FUND2_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SETTLEMENT2_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const extra = {
  project_funds: [{
    id: FUND2_ID, project_id: PROJECT_ID, fund_number: 2, amount: 20000, transfer_date: '2026-04-01', status: 'acknowledged',
    notes: null, created_by: USER_ID, acknowledged_at: '2026-04-02T00:00:00Z', acknowledged_by: USER_ID,
    created_at: '2026-04-01T00:00:00Z', updated_at: '2026-04-02T00:00:00Z',
  }],
  fund_settlements: [{
    id: SETTLEMENT2_ID, fund_id: FUND2_ID, project_id: PROJECT_ID, total_received: 20000, total_spent: 0, remaining_cash: 20000,
    difference: 0, status: 'submitted', attachments: [], created_at: '2026-04-03T00:00:00Z', updated_at: '2026-04-03T00:00:00Z',
  }],
};

async function openFunds(page: import('@playwright/test').Page) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'المالية' }).click();
  await page.getByRole('button', { name: 'الدفعات', exact: true }).click();
  await expect(page.getByText('سجل الدفعات')).toBeVisible();
  // The section keeps fetching (ledger, repairs) after it shows; act once the wire is quiet so a click lands on a settled row.
  await page.waitForLoadState('networkidle');
}
const patches = (wire: { writes: { method: string; table: string; body: unknown }[] }, table: string) =>
  wire.writes.filter((w) => w.table === table && w.method === 'PATCH').map((w) => w.body as Record<string, unknown>);

test('approving a submitted settlement stamps the approver and settles the fund', async ({ page }) => {
  const wire = await stubSupabase(page, extra);
  await openFunds(page);
  await page.getByRole('button', { name: 'اعتماد', exact: true }).first().click();
  await expect(page.getByText('تم اعتماد التسوية')).toBeVisible();

  await expect.poll(() => patches(wire, 'project_funds').length).toBe(1);
  const approval = patches(wire, 'fund_settlements').find((p) => p.status === 'approved');
  expect(approval).toMatchObject({ status: 'approved', approved_by: USER_ID });
  expect(typeof approval!.approval_date).toBe('string');
  expect(patches(wire, 'project_funds')[0]).toMatchObject({ status: 'settled' });
  // The 20,000 returned in hand is kept for the project's next fund, not dropped.
  await expect.poll(() => patches(wire, 'fund_settlements').at(-1)).toEqual({ carry_status: 'pending' });
});

test('rejecting needs a written reason and hands the fund back as acknowledged', async ({ page }) => {
  const wire = await stubSupabase(page, extra);
  await openFunds(page);
  await page.getByRole('button', { name: /^رفض$/ }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'رفض التسوية' })).toBeVisible();
  await dialog.getByRole('button', { name: 'رفض التسوية' }).click();
  await expect(page.getByText('سبب الرفض مطلوب')).toBeVisible();
  expect(patches(wire, 'fund_settlements')).toHaveLength(0);

  await dialog.getByRole('textbox').fill('الإيصالات ناقصة');
  await dialog.getByRole('button', { name: 'رفض التسوية' }).click();
  await expect(page.getByText('تم رفض التسوية')).toBeVisible();
  await expect.poll(() => patches(wire, 'project_funds').length).toBe(1);
  expect(patches(wire, 'fund_settlements').at(-1)).toMatchObject({ status: 'rejected', rejection_reason: 'الإيصالات ناقصة' });
  expect(patches(wire, 'project_funds')[0]).toMatchObject({ status: 'acknowledged' });
});
