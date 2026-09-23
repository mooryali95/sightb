import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID, USER_ID } from './support/seed';

/**
 * Two review actions that change what the ledger counts. Acknowledging a
 * transferred fund is the receipt: it must stamp who received it and when,
 * and open the draft settlement that will later account for every riyal of
 * it. Reviewing a pending expense decides whether it is spend at all: an
 * approved one stays in the totals, a rejected one leaves them.
 */
const FUND3_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const PENDING_ID = '12121212-1212-4121-8121-121212121212';

async function openSection(page: import('@playwright/test').Page, header: string) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'المالية' }).click();
  const trigger = page.getByRole('button', { name: header, exact: true });
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
}
const writes = (wire: { writes: { method: string; table: string; body: unknown }[] }, table: string, method: string) =>
  wire.writes.filter((w) => w.table === table && w.method === method).map((w) => (Array.isArray(w.body) ? w.body[0] : w.body) as Record<string, unknown>);

test('acknowledging a transferred fund stamps the receipt and opens its draft settlement', async ({ page }) => {
  const wire = await stubSupabase(page, {
    project_funds: [{
      id: FUND3_ID, project_id: PROJECT_ID, fund_number: 3, amount: 15000, transfer_date: '2026-05-01', status: 'transferred',
      notes: null, created_by: USER_ID, acknowledged_at: null, acknowledged_by: null, created_at: '2026-05-01T00:00:00Z', updated_at: '2026-05-01T00:00:00Z',
    }],
  });
  await openSection(page, 'الدفعات');
  // Under load a click can land while the row re-renders and do nothing. Click
  // again only when no acknowledgement was written, so it is never sent twice.
  await expect(async () => {
    if (writes(wire, 'project_funds', 'PATCH').length === 0) await page.getByRole('button', { name: /إقرار استلام/ }).first().click();
    await expect.poll(() => writes(wire, 'project_funds', 'PATCH').length, { timeout: 2000 }).toBeGreaterThan(0);
  }).toPass();
  await expect(page.getByText('تم الإقرار بالاستلام')).toBeVisible();
  expect(writes(wire, 'project_funds', 'PATCH')).toHaveLength(1);

  await expect.poll(() => writes(wire, 'fund_settlements', 'POST').length).toBe(1);
  expect(writes(wire, 'project_funds', 'PATCH').at(-1)).toMatchObject({ status: 'acknowledged', acknowledged_by: USER_ID });
  expect(typeof writes(wire, 'project_funds', 'PATCH').at(-1)!.acknowledged_at).toBe('string');
  const draft = writes(wire, 'fund_settlements', 'POST')[0];
  expect(draft).toMatchObject({ fund_id: FUND3_ID, project_id: PROJECT_ID, status: 'draft', settled_by: USER_ID });
  expect(Number(draft.total_received)).toBe(15000);
});

test('a pending expense counts until it is rejected', async ({ page }) => {
  const wire = await stubSupabase(page, {
    expenses: [{
      id: PENDING_ID, project_id: PROJECT_ID, category: 'travel', description: 'مصروف معلّق', amount: 5000, date: '2026-03-05', month: 3,
      approval_status: 'pending', is_vat_exempt: false, fund_id: null, created_at: '2026-03-05T00:00:00Z',
    }],
  });
  await openSection(page, 'المصروفات');
  // 12,000 approved in the seed plus the 5,000 still pending.
  await expect(page.getByText(/17,000\.00 ر\.س \/ 1,000,000\.00/)).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: 'مصروف معلّق' });
  await row.getByRole('button', { name: 'رفض' }).click();
  await expect(page.getByText('تم رفض المصروف')).toBeVisible();
  await expect(page.getByText(/12,000\.00 ر\.س \/ 1,000,000\.00/)).toBeVisible();
  expect(writes(wire, 'expenses', 'PATCH').at(-1)).toMatchObject({ approval_status: 'rejected' });
});

test('approving a pending expense keeps it in the totals', async ({ page }) => {
  const wire = await stubSupabase(page, {
    expenses: [{
      id: PENDING_ID, project_id: PROJECT_ID, category: 'travel', description: 'مصروف معلّق', amount: 5000, date: '2026-03-05', month: 3,
      approval_status: 'pending', is_vat_exempt: false, fund_id: null, created_at: '2026-03-05T00:00:00Z',
    }],
  });
  await openSection(page, 'المصروفات');
  const row = page.getByRole('row').filter({ hasText: 'مصروف معلّق' });
  await row.getByRole('button', { name: 'اعتماد' }).click();
  await expect(page.getByText('تم اعتماد المصروف')).toBeVisible();
  await expect(page.getByText(/17,000\.00 ر\.س \/ 1,000,000\.00/)).toBeVisible();
  expect(writes(wire, 'expenses', 'PATCH').at(-1)).toMatchObject({ approval_status: 'approved' });
  await expect(row.getByRole('button', { name: 'اعتماد' })).toHaveCount(0);
});
