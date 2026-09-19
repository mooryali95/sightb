import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID, USER_ID } from './support/seed';

/**
 * Moving a milestone. The project's own percent complete is not typed by
 * anyone: it is the weighted roll-up of its milestones, and it feeds earned
 * value on every chart. So a milestone edit must leave the project row
 * carrying the weighted figure, and only when every milestone is done may
 * the project flip to completed on its own.
 */
const A_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const B_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const milestone = (id: string, name: string, weight: number, pct: number, status: string, sort: number) => ({
  id, project_id: PROJECT_ID, name, description: null, weight, percent_complete: pct, status, sort_order: sort,
  planned_start: null, planned_end: null, actual_start: null, actual_end: null, linked_revenue_id: null, user_id: USER_ID,
  created_at: '2026-01-01T00:00:00Z',
});
const milestones = [
  milestone(A_ID, 'المرحلة أ', 0.6, 0, 'planned', 1),
  milestone(B_ID, 'المرحلة ب', 0.4, 100, 'completed', 2),
];

async function openMilestones(page: import('@playwright/test').Page) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'التخطيط' }).click();
  await expect(page.getByText('المرحلة أ')).toBeVisible();
  return page.getByText('المرحلة أ').locator('xpath=ancestor::div[.//input[@type="number"]][1]').locator('input[type="number"]');
}
const patches = (wire: { writes: { method: string; table: string; body: unknown }[] }, table: string) =>
  wire.writes.filter((w) => w.table === table && w.method === 'PATCH').map((w) => w.body as Record<string, unknown>);

test('a partial milestone rolls up weighted into the project without completing it', async ({ page }) => {
  const wire = await stubSupabase(page, { milestones });
  const percent = await openMilestones(page);
  await percent.fill('50');
  // 0.6 × 50 + 0.4 × 100 = 70.
  await expect.poll(() => patches(wire, 'projects').at(-1)?.percent_complete).toBe(70);
  expect(patches(wire, 'milestones').at(-1)).toMatchObject({ percent_complete: 50 });
  expect(patches(wire, 'projects').some((p) => p.status === 'completed')).toBe(false);
});

test('finishing the last milestone completes the project on its own', async ({ page }) => {
  const wire = await stubSupabase(page, { milestones });
  const percent = await openMilestones(page);
  await percent.fill('100');
  await expect(page.getByText('🎉 المشروع اكتمل — تم تحويل حالته إلى "مكتمل" تلقائياً')).toBeVisible();
  expect(patches(wire, 'milestones').at(-1)).toMatchObject({ percent_complete: 100, status: 'completed' });
  const last = patches(wire, 'projects').at(-1);
  expect(last).toMatchObject({ status: 'completed', percent_complete: 100 });
});
