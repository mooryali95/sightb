import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { COMPANY_ID, PROJECT_ID, USER_ID, seed } from './support/seed';

/**
 * «خريطة المنظومة» on the real company page: the company at the head, each
 * project with its status symbol, what the company sent it (funding and a
 * charged cost), what came back, and what it still owes.
 *
 * MAP_SHOTS=<dir> also saves light and dark screenshots of the map there,
 * for the owner's review of the design.
 */
const SECOND = '99999999-9999-4999-8999-999999999999';
const second = { ...seed.projects[0], id: SECOND, name: 'برج الأعمال', contract_value: 600000 };
const entry = (id: string, from: [string, string | null], to: [string, string | null], amount: number, type: string) => ({
  id, company_id: COMPANY_ID, date: '2026-03-01', amount, type, note: '', due_date: null, salary_expense_id: null, source_fund_id: null,
  from_kind: from[0], from_id: from[1], to_kind: to[0], to_id: to[1], user_id: USER_ID, created_at: '2026-03-01T00:00:00Z',
});
const rows = {
  projects: [second],
  budget_items: [{ ...seed.budget_items[0], id: '66666666-6666-4666-8666-666666666667', project_id: SECOND, planned_amount: 500000 }],
  parties: [],
  intercompany_entries: [
    entry('fund-1', ['company', null], ['project', PROJECT_ID], 80000, 'advance'),
    entry('back-1', ['project', PROJECT_ID], ['company', null], 30000, 'repayment'),
    entry('fund-2', ['company', null], ['project', SECOND], 20000, 'advance'),
  ],
  company_expenses: [{ id: 'ce-1', company_id: COMPANY_ID, date: '2026-03-02', amount: 12000, description: 'رواتب مارس', kind: 'salary', party_id: null, paid_by_party_id: null, user_id: USER_ID, created_at: '2026-03-02T00:00:00Z' }],
  company_expense_allocations: [{ id: 'al-1', expense_id: 'ce-1', project_id: PROJECT_ID, amount: 9000, settled_in_project: false, user_id: USER_ID, created_at: '2026-03-02T00:00:00Z' }],
};

for (const theme of ['light', 'dark'] as const) {
  test.describe(theme, () => {
    test.use({ colorScheme: theme, viewport: { width: 1280, height: 900 } });

    test('heads the company page with the company, its projects and the money between them', async ({ page }) => {
      // The app's theme is next-themes' stored choice (default light), not the system setting.
      await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
      await stubSupabase(page, rows);
      await page.goto(`/company/${COMPANY_ID}`);
      await expect(page.locator('html')).toHaveClass(new RegExp(theme === 'dark' ? '\\bdark\\b' : '^(?!.*\\bdark\\b)'));
      const map = page.getByRole('region', { name: 'خريطة المنظومة' });
      await expect(map).toBeVisible();

      const project = map.getByRole('button', { name: /^مشروع الاختبار:/ });
      await expect(project).toContainText('✓ على المسار');
      await expect(project).toContainText('من المنظومة89,000.00');     // 80,000 funding + 9,000 charged
      await expect(project).toContainText('إلى المنظومة30,000.00');
      await expect(project).toContainText('عليه للمنظومة 50,000.00');
      await expect(map.getByRole('button', { name: /^برج الأعمال:/ })).toContainText('عليه للمنظومة 20,000.00');

      await expect(map.getByText('مصاريف المنظومة').locator('..')).toContainText('9,000.00 ر.س حُمِّلت على المشاريع · 3,000.00 ر.س بقيت عليها');
      await expect(map.getByRole('img', { name: /للمنظومة وحدها 3,000.00 ر.س، بينهما 109,000.00 ر.س/ })).toBeVisible();

      const dir = process.env.MAP_SHOTS;
      if (dir) await map.screenshot({ path: `${dir}/company-map-${theme}.png`, animations: 'disabled' });

      await project.click();
      await expect(page).toHaveURL(new RegExp(`/project/${PROJECT_ID}$`));
    });
  });
}
