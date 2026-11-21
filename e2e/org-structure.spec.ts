import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { COMPANY_ID, PROJECT_ID, USER_ID, seed } from './support/seed';

/**
 * «هيكل المنظومة» on the real company page: «قائمة / هيكل» switches the map
 * to the drawn structure and keeps the choice in the address bar. The company
 * is at the top, its portfolios beneath, each portfolio's projects under it,
 * and «دون محفظة» for the rest. The lines between them carry the money: out
 * solid, back dashed, each as thick as its amount. Every box is a link.
 *
 * MAP_SHOTS=<dir> also saves light, dark and phone screenshots there, for
 * the owner's review of the design.
 */
const ROADS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const BUILDINGS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const TOWER = '99999999-9999-4999-8999-999999999991';
const BRIDGE = '99999999-9999-4999-8999-999999999992';
const DEPOT = '99999999-9999-4999-8999-999999999993';
const portfolio = (id: string, name: string) => ({ id, company_id: COMPANY_ID, name, description: null, fiscal_year: null, notes: null, target_margin: 0, target_revenue: 0, user_id: USER_ID, created_at: '2026-01-01T00:00:00Z' });
const project = (id: string, name: string, portfolio_id: string | null, over: Record<string, unknown> = {}) => ({ ...seed.projects[0], id, name, portfolio_id, contract_value: 600000, ...over });
const budget = (n: number, project_id: string, planned_amount: number) => ({ ...seed.budget_items[0], id: `66666666-6666-4666-8666-66666666666${n}`, project_id, planned_amount });
const entry = (id: string, from: [string, string | null], to: [string, string | null], amount: number, type: string) => ({
  id, company_id: COMPANY_ID, date: '2026-03-01', amount, type, note: '', due_date: null, salary_expense_id: null, source_fund_id: null,
  from_kind: from[0], from_id: from[1], to_kind: to[0], to_id: to[1], user_id: USER_ID, created_at: '2026-03-01T00:00:00Z',
});
// The seed's «مشروع الاختبار» has no portfolio. Two portfolios are added: «محفظة الطرق»
// with the bridge and the depot, «محفظة المباني» with the tower (on hold).
const rows = {
  portfolios: [portfolio(ROADS, 'محفظة الطرق'), portfolio(BUILDINGS, 'محفظة المباني')],
  projects: [
    project(BRIDGE, 'جسر الوادي', ROADS),
    project(DEPOT, 'مستودع الميناء', ROADS, { contract_value: 250000 }),
    project(TOWER, 'برج الأعمال', BUILDINGS, { status: 'on-hold' }),
  ],
  budget_items: [budget(1, BRIDGE, 500000), budget(2, DEPOT, 200000), budget(3, TOWER, 450000)],
  parties: [],
  intercompany_entries: [
    entry('fund-1', ['company', null], ['project', PROJECT_ID], 80000, 'advance'),
    entry('back-1', ['project', PROJECT_ID], ['company', null], 30000, 'repayment'),
    entry('fund-2', ['company', null], ['project', BRIDGE], 200000, 'advance'),
    entry('back-2', ['project', BRIDGE], ['company', null], 120000, 'repayment'),
    entry('fund-3', ['company', null], ['project', TOWER], 20000, 'advance'),
  ],
  company_expenses: [{ id: 'ce-1', company_id: COMPANY_ID, date: '2026-03-02', amount: 12000, description: 'رواتب مارس', kind: 'salary', party_id: null, paid_by_party_id: null, user_id: USER_ID, created_at: '2026-03-02T00:00:00Z' }],
  company_expense_allocations: [{ id: 'al-1', expense_id: 'ce-1', project_id: PROJECT_ID, amount: 9000, settled_in_project: false, user_id: USER_ID, created_at: '2026-03-02T00:00:00Z' }],
};
const shots = process.env.MAP_SHOTS;

for (const theme of ['light', 'dark'] as const) {
  test.describe(theme, () => {
    test.use({ colorScheme: theme, viewport: { width: 1280, height: 900 } });

    test('draws the company, its portfolios and their projects, with the money on the lines', async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
      await stubSupabase(page, rows);
      await page.goto(`/company/${COMPANY_ID}`);
      await expect(page.locator('html')).toHaveClass(new RegExp(theme === 'dark' ? '\\bdark\\b' : '^(?!.*\\bdark\\b)'));
      const map = page.getByRole('region', { name: 'خريطة المنظومة' });

      // The strips first; the toggle switches to the structure and writes it in the link.
      await expect(map.getByRole('button', { name: /^مشروع الاختبار:/ })).toBeVisible();
      await expect(map.getByRole('button', { name: 'قائمة' })).toHaveAttribute('aria-pressed', 'true');
      await map.getByRole('button', { name: 'هيكل' }).click();
      await expect(page).toHaveURL(/[?&]map=structure/);
      const org = map.getByRole('navigation', { name: 'هيكل المنظومة' });
      await expect(org).toBeVisible();
      await expect(map.getByRole('button', { name: /^مشروع الاختبار:/ })).toHaveCount(0);

      // Every box is a link with a name that says what it is, its state in words, and its money.
      await expect(org.getByRole('link', { name: /^المنظومة شركة الاختبار/ })).toHaveAttribute('href', `/?company=${COMPANY_ID}`);
      await expect(org.getByRole('link', { name: 'محفظة الطرق: مشروعان، من المنظومة 200,000.00 ر.س، إلى المنظومة 120,000.00 ر.س' })).toHaveAttribute('href', `/portfolio/${ROADS}`);
      await expect(org.getByRole('link', { name: /^دون محفظة: مشروع واحد، من المنظومة 89,000.00/ })).toHaveAttribute('href', `/?company=${COMPANY_ID}&portfolio=standalone`);
      const tower = org.getByRole('link', { name: /^برج الأعمال:/ });
      await expect(tower).toHaveAccessibleName('برج الأعمال: يحتاج انتباه، صُرف 0% من الموازنة، من المنظومة 20,000.00 ر.س، إلى المنظومة 0.00 ر.س');
      await expect(tower).toContainText('▲ يحتاج انتباه');
      const seeded = org.getByRole('link', { name: /^مشروع الاختبار:/ });
      await expect(seeded).toContainText('✓ على المسار');
      await expect(seeded).toContainText('89,000.00');   // 80,000 funding + 9,000 charged
      await expect(seeded).toContainText('30,000.00');

      // The lines: the bridge's is the thickest going out; the depot got nothing, so its line is the thin belongs-to one.
      const widths = (kind: string) => org.locator(`path[data-line="${kind}"]`).evaluateAll((els) => els.map((e) => Number(e.getAttribute('stroke-width'))));
      const out = await widths('out');
      expect(Math.max(...out)).toBe(10);                 // 200,000, the largest flow, at full thickness
      expect(out.filter((w) => w === 10)).toHaveLength(2); // the bridge, and its portfolio's line from the company
      expect(Math.min(...out)).toBeLessThan(3);          // 20,000 to the tower
      expect(await widths('back')).toHaveLength(4);      // two projects returned money, and so did their two groups
      await expect(org.locator('path[data-line="back"]').first()).toHaveAttribute('stroke-dasharray', /\d/);

      // Nothing in the structure is cut off or overlapping: every link is inside the diagram and apart from the others.
      const boxes = await org.getByRole('link').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }));
      expect(boxes).toHaveLength(8);
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i], boxes[j]];
        expect(a[0] >= b[2] || b[0] >= a[2] || a[1] >= b[3] || b[1] >= a[3], `boxes ${i} and ${j} overlap`).toBe(true);
      }
      // Right to left: the first portfolio is the rightmost column.
      const x = async (name: RegExp) => (await org.getByRole('link', { name }).boundingBox())!.x;
      expect(await x(/^محفظة الطرق:/)).toBeGreaterThan(await x(/^محفظة المباني:/));

      if (shots) await map.screenshot({ path: `${shots}/org-structure-${theme}.png`, animations: 'disabled' });

      // Keyboard: the links are reached in reading order, and Enter opens the project.
      await org.getByRole('link', { name: /^المنظومة شركة الاختبار/ }).focus();
      await page.keyboard.press('Tab');
      await expect(org.getByRole('link', { name: /^محفظة الطرق:/ })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(org.getByRole('link', { name: /^جسر الوادي:/ })).toBeFocused();
      if (shots) await map.screenshot({ path: `${shots}/org-structure-${theme}-focus.png`, animations: 'disabled' });
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(new RegExp(`/project/${BRIDGE}$`));
    });
  });
}

test.describe('a shared link, at phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('opens on the structure as an indented tree that fits the screen, and goes back to the strips', async ({ page }) => {
    await stubSupabase(page, rows);
    await page.goto(`/company/${COMPANY_ID}?map=structure`);
    const map = page.getByRole('region', { name: 'خريطة المنظومة' });
    const org = map.getByRole('navigation', { name: 'هيكل المنظومة' });
    await expect(org.getByRole('link', { name: /^جسر الوادي:/ })).toBeVisible();
    await expect(map.getByRole('button', { name: 'هيكل' })).toHaveAttribute('aria-pressed', 'true');
    // No sideways scroll: every link is inside the screen.
    const edges = await org.getByRole('link').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.right]; }));
    expect(edges).toHaveLength(8);
    for (const [left, right] of edges) { expect(left).toBeGreaterThanOrEqual(0); expect(right).toBeLessThanOrEqual(390); }
    // A project sits under its portfolio, indented from it.
    const box = async (name: RegExp) => (await org.getByRole('link', { name }).boundingBox())!;
    const [group, child] = [await box(/^محفظة الطرق:/), await box(/^جسر الوادي:/)];
    expect(child.y).toBeGreaterThan(group.y + group.height - 1);
    expect(child.x + child.width).toBeLessThan(group.x + group.width);
    if (shots) await map.screenshot({ path: `${shots}/org-structure-phone.png`, animations: 'disabled' });

    await map.getByRole('button', { name: 'قائمة' }).click();
    await expect(page).not.toHaveURL(/map=structure/);
    await expect(map.getByRole('button', { name: /^جسر الوادي:/ })).toBeVisible();
  });
});

test('says the ledger is not live and draws the structure without money on its lines', async ({ page }) => {
  await stubSupabase(page, { portfolios: rows.portfolios, projects: rows.projects, budget_items: rows.budget_items });
  // The ledger tables are not there: PostgREST answers 404 for a missing relation.
  await page.route('**/rest/v1/intercompany_entries*', (route) => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST205', message: "Could not find the table 'public.intercompany_entries' in the schema cache" }) }));
  await page.goto(`/company/${COMPANY_ID}?map=structure`);
  const map = page.getByRole('region', { name: 'خريطة المنظومة' });
  await expect(map.getByRole('status')).toContainText('دفتر المنظومة غير مفعّل بعد');
  const org = map.getByRole('navigation', { name: 'هيكل المنظومة' });
  await expect(org.getByRole('link', { name: 'جسر الوادي: على المسار' })).toBeVisible();
  await expect(org.locator('path[data-line="out"], path[data-line="back"]')).toHaveCount(0);
  await expect(org.locator('path[data-line="tree"]').first()).toBeVisible();
});
