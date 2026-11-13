import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { COMPANY_ID, PROJECT_ID, FUND_ID, USER_ID } from './support/seed';

/**
 * Recording an expense from the project page, where every expense must
 * draw on a cash source. With an acknowledged fund the form pre-links it,
 * a VAT-inclusive amount is booked net, the row lands approved on that
 * fund; an amount beyond what the fund still holds (50,000 less the
 * seed's 12,000) is refused, naming the remainder, and nothing is
 * written.
 */
// The expense form is taller than the default viewport; a taller one keeps its footer reachable.
test.use({ viewport: { width: 1280, height: 1800 } });

const posts = (wire: { writes: { method: string; table: string; body: unknown }[] }) =>
  wire.writes.filter((w) => w.table === 'expenses' && w.method === 'POST').map((w) => w.body as Record<string, unknown>);

async function openForm(page: Page) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'المالية' }).click();
  // Expenses is the finance group's default open section; clicking its header would close it.
  const header = page.getByRole('button', { name: 'المصروفات', exact: true });
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
  await page.getByRole('button', { name: 'إضافة مصروف' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('مثال: راتب شهر يناير — أحمد').fill('إيجار رافعة');
  return dialog;
}

test('a VAT-inclusive expense is booked net, approved, on the acknowledged fund', async ({ page }) => {
  const wire = await stubSupabase(page);
  const dialog = await openForm(page);
  await dialog.getByPlaceholder('0').fill('11500');
  await dialog.getByText('المبلغ شامل الضريبة').click();
  await expect(dialog.getByText(/بدون ضريبة: 10,000\.00/)).toBeVisible();
  await dialog.getByRole('button', { name: 'إضافة', exact: true }).click();
  await expect(page.getByText('تمت إضافة المصروف')).toBeVisible();

  await expect.poll(() => posts(wire).length).toBe(1);
  const row = posts(wire)[0];
  expect(row).toMatchObject({
    project_id: PROJECT_ID, user_id: USER_ID, description: 'إيجار رافعة', approval_status: 'approved',
    fund_id: FUND_ID, custody_id: null, is_vat_exempt: false, budget_item_id: null,
  });
  expect(Number(row.amount)).toBe(10000);
  expect(String(row.id)).toMatch(/^[0-9a-f-]{36}$/);
  await expect(page.getByText(/22,000\.00 ر\.س \/ 1,000,000\.00/)).toBeVisible();
});

test('an expense beyond the fund remainder is refused, naming the remainder, with nothing written', async ({ page }) => {
  const wire = await stubSupabase(page);
  const dialog = await openForm(page);
  await dialog.getByPlaceholder('0').fill('40000');
  await dialog.getByRole('button', { name: 'إضافة', exact: true }).click();
  await expect(page.getByText(/المبلغ \(40,000\.00 ر\.س\) يتجاوز المتبقي في الدفعة #1 \(38,000\.00 ر\.س\)/)).toBeVisible();
  expect(posts(wire)).toHaveLength(0);
  await expect(dialog).toBeVisible();
});

test('the vendor is picked from the registry, so the expense is linked to the person, not just their name', async ({ page }) => {
  const ANWAR = 'aaaaaaaa-0000-4000-8000-000000000001';
  const wire = await stubSupabase(page, {
    parties: [{ id: ANWAR, company_id: COMPANY_ID, name: 'د أنور أسعد', kind: 'person', archived: false, role: 'مستشار', aliases: [], user_id: USER_ID, created_at: '2026-01-01T00:00:00Z' }],
  });
  const dialog = await openForm(page);
  await dialog.getByPlaceholder('0').fill('1000');
  await dialog.getByRole('combobox', { name: 'المورّد' }).click();
  await page.getByRole('combobox', { name: 'بحث في سجل الموارد' }).fill('دأنور');
  await page.getByRole('option', { name: /د أنور أسعد/ }).click();
  await expect(dialog.getByRole('combobox', { name: 'المورّد' })).toContainText('من السجل');
  await dialog.getByRole('button', { name: 'إضافة', exact: true }).click();
  await expect(page.getByText('تمت إضافة المصروف')).toBeVisible();
  await expect.poll(() => posts(wire).length).toBe(1);
  expect(posts(wire)[0]).toMatchObject({ vendor: 'د أنور أسعد', party_id: ANWAR });
});

test('more than the fund holds: the fund pays what it has, and the rest is owed to the project manager who paid it', async ({ page }) => {
  const MANAGER = 'bbbbbbbb-0000-4000-8000-0000000000bb';
  const wire = await stubSupabase(page, {
    resources: [{ id: MANAGER, project_id: PROJECT_ID, name: 'عمر عبدالكريم', role: 'مدير مشروع', monthly_cost: 0, user_id: USER_ID, created_at: '2026-01-01T00:00:00Z' }],
  });
  const dialog = await openForm(page);
  await dialog.getByPlaceholder('0').fill('40000');
  const note = dialog.getByRole('status').filter({ hasText: 'المبلغ أكبر مما في المصدر' });
  await expect(note).toContainText('2,000.00');
  await expect(note.getByRole('combobox', { name: 'من دفع الزائد' })).toContainText('عمر عبدالكريم');
  await dialog.getByRole('button', { name: 'إضافة', exact: true }).click();
  await expect(page.getByText(/مستحقة لمن دفع الزائد/)).toBeVisible();

  await expect.poll(() => posts(wire).length).toBe(1);
  expect(posts(wire)[0]).toMatchObject({ fund_id: FUND_ID, amount: 38000, description: 'إيجار رافعة' });
  const owed = wire.writes.find((w) => w.method === 'POST' && w.table === 'resource_reimbursements')?.body as Record<string, unknown>;
  expect(owed).toMatchObject({ resource_id: MANAGER, source_kind: 'resource', amount: 2000, status: 'approved' });
});
