import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { USER_ID } from './support/seed';

/**
 * The error log: an error a person meets in the browser reaches the server,
 * once per load and with long numbers masked; the owner reads it grouped by
 * bug; anyone else is sent away.
 */
const OWNER_ROLE = { id: '77777777-7777-4777-8777-777777777778', user_id: USER_ID, role: 'owner', scope_type: 'system', scope_id: null };
const row = (id: string, user_id: string, occurrences: number, last_seen: string) => ({
  id, user_id, day: last_seen.slice(0, 10), fingerprint: 'ErrorBoundary:abc', scope: 'ErrorBoundary',
  message: 'Cannot read properties of undefined (reading \'amount\')', context: { stack: 'at BudgetRow (BudgetRow.tsx:12)' },
  path: '/project/p1', release: '1730900000', user_agent: 'Mozilla/5.0 (iPhone)', occurrences, first_seen: '2026-11-04T08:00:00Z', last_seen,
});

test('reports an error the page meets, once, with long numbers masked', async ({ page }) => {
  const wire = await stubSupabase(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'إدارة الشركات' })).toBeVisible();
  await page.evaluate(() => {
    for (let i = 0; i < 2; i += 1) setTimeout(() => { throw new Error('failed on account 1234567890'); });
  });
  await expect.poll(() => wire.writes.filter((w) => w.method === 'RPC' && w.table === 'report_client_error').length).toBe(1);
  const sent = wire.writes.find((w) => w.table === 'report_client_error')!.body as Record<string, string>;
  expect(sent._message).toContain('failed on account 12…90');
  expect(sent._message).not.toContain('1234567890');
  expect(sent._scope).toBe('window.error');
  expect(sent._path).toBe('/');
});

test('the owner reads each bug once, added up across people and days', async ({ page }) => {
  await stubSupabase(page, {
    user_roles: [OWNER_ROLE],
    client_errors: [row('c1', USER_ID, 3, '2026-11-05T09:00:00Z'), row('c2', 'other-user', 2, '2026-11-06T09:00:00Z')],
  });
  await page.goto('/errors');
  await expect(page.getByRole('heading', { name: 'سجل الأعطال' })).toBeVisible();
  const card = page.getByRole('listitem').filter({ hasText: 'reading \'amount\'' });
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('5 مرات');
  await expect(card).toContainText('شخصان');
  await card.getByText('reading \'amount\'').click();
  await expect(card).toContainText('at BudgetRow (BudgetRow.tsx:12)');
  await expect(card).toContainText('/project/p1');
});

test('anyone but an owner is sent away from the log', async ({ page }) => {
  await stubSupabase(page);
  await page.goto('/errors');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'سجل الأعطال' })).toHaveCount(0);
});
