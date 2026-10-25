import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID, USER_ID } from './support/seed';

/**
 * The central financial screen shows what a project has earned so far beside
 * what it was planned to earn: collected less counted spend, and that over
 * what was collected. A project that has spent more than it collected shows
 * the loss in red; a rejected expense does not count.
 */
test('the projects tab shows actual profit and margin beside the planned ones', async ({ page }) => {
  await stubSupabase(page, {
    revenues: [
      { id: 'rv-1', project_id: PROJECT_ID, description: 'دفعة أولى', amount: 10000, date: '2026-03-10', month: 3, status: 'collected', user_id: USER_ID, created_at: '2026-03-10T00:00:00Z' },
      { id: 'rv-2', project_id: PROJECT_ID, description: 'دفعة لاحقة', amount: 90000, date: '2026-06-10', month: 6, status: 'planned', user_id: USER_ID, created_at: '2026-03-10T00:00:00Z' },
    ],
    expenses: [
      // Added to the seeded 12,000 of materials: a rejected row the figures must leave out.
      { id: 'ex-rej', project_id: PROJECT_ID, category: 'other', description: 'مرفوض', amount: 50000, date: '2026-03-06', month: 3, approval_status: 'rejected', is_vat_exempt: true, user_id: USER_ID, created_at: '2026-03-06T00:00:00Z' },
    ],
  });
  await page.goto('/finance');
  await page.getByRole('tab', { name: /المشاريع/ }).click();
  await expect(page.getByRole('columnheader', { name: 'الربح الفعلي' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'الهامش الفعلي' })).toBeVisible();

  const row = page.getByRole('row').filter({ hasText: 'مشروع الاختبار' });
  // 10,000 collected (the planned 90,000 not), 12,000 spent (the rejected 50,000 not).
  const cells = row.getByRole('cell');
  const headers = await page.getByRole('columnheader').allInnerTexts();
  const at = (label: string) => cells.nth(headers.findIndex((h) => h.trim() === label));
  await expect(at('الربح الفعلي')).toHaveText('-2,000.00 ر.س');
  await expect(at('الربح الفعلي')).toHaveClass(/text-destructive/);
  await expect(at('الهامش الفعلي')).toHaveText('-20.0%');
  // The planned figures stay as they were: 1,000,000 contract less the 400,000 plan.
  await expect(at('الربح المخطط')).toHaveText('600,000.00 ر.س');
});
