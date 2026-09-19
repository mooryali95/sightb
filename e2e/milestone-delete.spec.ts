import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID, USER_ID, seed } from './support/seed';

/**
 * Removing a milestone. The project's own percent is the weighted roll-up
 * of what remains, so a deletion must rewrite it at once; and because the
 * roll-up can now be whole, or no longer whole, the project must complete
 * or come back to active in the same breath.
 */
const A_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const B_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const DONE_ID = '66666666-6666-4666-8666-666666666601';
const milestone = (id: string, projectId: string, name: string, weight: number, pct: number, status: string, sort: number) => ({
  id, project_id: projectId, name, description: null, weight, percent_complete: pct, status, sort_order: sort,
  planned_start: null, planned_end: null, actual_start: null, actual_end: null, linked_revenue_id: null, user_id: USER_ID,
  created_at: '2026-01-01T00:00:00Z',
});
const patches = (wire: { writes: { method: string; table: string; body: unknown }[] }, table: string) =>
  wire.writes.filter((w) => w.table === table && w.method === 'PATCH').map((w) => w.body as Record<string, unknown>);
const deletes = (wire: { writes: { method: string; table: string; body: unknown }[] }) =>
  wire.writes.filter((w) => w.method === 'DELETE').map((w) => w.table);

async function openMilestones(page: Page, projectId: string, projectName: string) {
  await page.goto(`/project/${projectId}`);
  await expect(page.getByText(projectName).first()).toBeVisible();
  await page.getByRole('tab', { name: 'التخطيط' }).click();
  await expect(page.getByText('المرحلة أ')).toBeVisible();
}
async function deleteMilestone(page: Page, name: string) {
  const card = page.getByText(name, { exact: true }).locator('xpath=ancestor::div[.//input[@type="number"]][1]');
  await card.locator('button', { has: page.locator('svg.text-destructive') }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm.getByRole('heading', { name: 'حذف المرحلة' })).toBeVisible();
  await confirm.getByRole('button', { name: 'حذف' }).click();
}

test('deleting the only unfinished milestone rolls the project to 100 and completes it', async ({ page }) => {
  const wire = await stubSupabase(page, { milestones: [
    milestone(A_ID, PROJECT_ID, 'المرحلة أ', 0.6, 0, 'planned', 1),
    milestone(B_ID, PROJECT_ID, 'المرحلة ب', 0.4, 100, 'completed', 2),
  ] });
  await openMilestones(page, PROJECT_ID, 'مشروع الاختبار');
  await deleteMilestone(page, 'المرحلة أ');
  await expect(page.getByText('🎉 المشروع اكتمل — تم تحويل حالته إلى "مكتمل" تلقائياً')).toBeVisible();

  await expect.poll(() => patches(wire, 'projects').length).toBe(2);
  expect(deletes(wire)).toEqual(['milestones']);
  // 0.4 × 100 over a remaining weight of 0.4: whole.
  expect(patches(wire, 'projects')[0]).toStrictEqual({ percent_complete: 100 });
  expect(patches(wire, 'projects')[1]).toStrictEqual({ status: 'completed', percent_complete: 100 });
  await expect(page.getByText('المرحلة أ')).toHaveCount(0);
  await expect(page.getByText('المرحلة ب')).toBeVisible();
});

test('deleting a finished milestone from a completed project brings it back to active', async ({ page }) => {
  const project = { ...seed.projects[0], id: DONE_ID, name: 'مشروع مكتمل', status: 'completed', percent_complete: 100 };
  const wire = await stubSupabase(page, {
    projects: [project],
    milestones: [
      milestone('m-done', DONE_ID, 'المرحلة أ', 0.5, 100, 'completed', 1),
      milestone('m-open', DONE_ID, 'المرحلة ب', 0.5, 40, 'in_progress', 2),
    ],
  });
  await openMilestones(page, DONE_ID, 'مشروع مكتمل');
  await deleteMilestone(page, 'المرحلة أ');
  await expect(page.getByText('المشروع عاد لحالة "نشط" — بعض المراحل لم تكتمل')).toBeVisible();

  await expect.poll(() => patches(wire, 'projects').length).toBe(2);
  // Only the 40% milestone remains: the roll-up is 40, and the project is no longer complete.
  expect(patches(wire, 'projects')[0]).toStrictEqual({ percent_complete: 40 });
  expect(patches(wire, 'projects')[1]).toStrictEqual({ status: 'active' });
  expect(deletes(wire)).toEqual(['milestones']);
});
