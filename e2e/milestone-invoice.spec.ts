import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID, USER_ID } from './support/seed';

/**
 * Completing a milestone that is linked to a revenue. A planned revenue
 * tied to a finished milestone is an invoice waiting to be raised, so the
 * app offers to move it to invoiced on the spot. Saying yes must write
 * exactly that status change and nothing else; "later" must write nothing;
 * and a revenue already invoiced must not be asked about at all.
 */
const A_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const B_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const REV_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const milestone = (id: string, name: string, weight: number, pct: number, status: string, sort: number, link: string | null) => ({
  id, project_id: PROJECT_ID, name, description: null, weight, percent_complete: pct, status, sort_order: sort,
  planned_start: null, planned_end: null, actual_start: null, actual_end: null, linked_revenue_id: link, user_id: USER_ID,
  created_at: '2026-01-01T00:00:00Z',
});
const revenue = (status: string) => ({
  id: REV_ID, project_id: PROJECT_ID, user_id: USER_ID, description: 'الدفعة الأولى', amount: 300000, date: '2026-03-01',
  month: 3, revenue_type: 'milestone', status, invoice_number: null, invoice_date: null, collection_date: null,
  milestone_id: null, created_at: '2026-01-01T00:00:00Z',
});
const rows = (status: string) => ({
  milestones: [milestone(A_ID, 'المرحلة أ', 0.6, 0, 'planned', 1, REV_ID), milestone(B_ID, 'المرحلة ب', 0.4, 100, 'completed', 2, null)],
  revenues: [revenue(status)],
});
const patches = (wire: { writes: { method: string; table: string; body: unknown }[] }, table: string) =>
  wire.writes.filter((w) => w.table === table && w.method === 'PATCH').map((w) => w.body as Record<string, unknown>);

async function finishMilestoneA(page: import('@playwright/test').Page) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'التخطيط' }).click();
  await expect(page.getByText('المرحلة أ')).toBeVisible();
  const percent = page.getByText('المرحلة أ').locator('xpath=ancestor::div[.//input[@type="number"]][1]').locator('input[type="number"]');
  await percent.fill('100');
  await expect(page.getByText('✓ المرحلة "المرحلة أ" اكتملت تلقائياً')).toBeVisible();
}

test('finishing a milestone linked to a planned revenue offers the invoice, and yes moves it to invoiced', async ({ page }) => {
  const wire = await stubSupabase(page, rows('planned'));
  await finishMilestoneA(page);

  const prompt = page.getByRole('dialog');
  await expect(prompt.getByRole('heading', { name: 'إصدار فاتورة؟' })).toBeVisible();
  await expect(prompt).toContainText('الدفعة الأولى');
  await expect(prompt).toContainText('300,000.00');
  await expect(prompt).toContainText('الحالة: مخطط');

  await prompt.getByRole('button', { name: 'نعم — أصدر الفاتورة' }).click();
  await expect(page.getByText('تم تحويل الدفعة إلى مُفوتر')).toBeVisible();
  await expect(prompt).toBeHidden();
  await expect.poll(() => patches(wire, 'revenues').length).toBe(1);
  expect(patches(wire, 'revenues')[0]).toStrictEqual({ status: 'invoiced' });
});

test('"later" closes the offer without touching the revenue', async ({ page }) => {
  const wire = await stubSupabase(page, rows('planned'));
  await finishMilestoneA(page);

  const prompt = page.getByRole('dialog');
  await expect(prompt.getByRole('heading', { name: 'إصدار فاتورة؟' })).toBeVisible();
  await prompt.getByRole('button', { name: 'لاحقاً' }).click();
  await expect(prompt).toBeHidden();
  // The milestone and project writes have landed by now; the revenue has none.
  await expect.poll(() => patches(wire, 'projects').length).toBeGreaterThan(0);
  expect(patches(wire, 'revenues')).toHaveLength(0);
});

test('a revenue already invoiced is not offered again', async ({ page }) => {
  const wire = await stubSupabase(page, rows('invoiced'));
  await finishMilestoneA(page);

  await expect.poll(() => patches(wire, 'projects').at(-1)?.status).toBe('completed');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(patches(wire, 'revenues')).toHaveLength(0);
});
