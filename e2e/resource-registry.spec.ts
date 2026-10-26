import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { COMPANY_ID, PROJECT_ID, USER_ID } from './support/seed';

/**
 * The registry built from names already on expenses: one person written
 * three ways links in one click to the entry they match, a name nobody has
 * yet is added from the same screen and its rows follow it, and the person's
 * page adds up what every project paid them.
 */
const AYMAN = 'aaaaaaaa-0000-4000-8000-000000000001';
const expense = (id: string, vendor: string, amount: number, category = 'salary') => ({
  id, project_id: PROJECT_ID, category, description: `صرف ${id}`, amount, date: '2026-05-06', month: 2,
  approval_status: 'approved', is_vat_exempt: true, user_id: USER_ID, vendor, created_at: '2026-05-06T00:00:00Z',
});

test('names on expenses become registry entries, and a person\'s page adds up what they were paid', async ({ page }) => {
  const wire = await stubSupabase(page, {
    parties: [{ id: AYMAN, company_id: COMPANY_ID, name: 'د أيمن أصلان', kind: 'person', archived: false, role: 'مستشار', aliases: [], user_id: USER_ID, created_at: '2026-01-01T00:00:00Z' }],
    company_expenses: [], intercompany_entries: [], company_expense_allocations: [],
    expenses: [
      expense('e1', 'دأيمن أصلان', 10000),
      expense('e2', 'د. أيمن أصلان', 10000),
      expense('e3', 'دكتور أيمن اصلان', 190, 'travel'),
      expense('e4', 'مؤسسة الضيافة', 7000, 'other'),
    ],
  });
  await page.goto(`/company/${COMPANY_ID}`);
  const registry = page.getByRole('region', { name: 'سجل الموارد' });
  await expect(registry.getByText('د أيمن أصلان')).toBeVisible();

  // Four rows carry names; open the linking screen.
  await registry.getByRole('button', { name: /ربط الأسماء/ }).click();
  const sheet = page.getByRole('dialog', { name: /ربط الأسماء بسجل الموارد/ });
  const ayman = sheet.getByRole('article', { name: 'دأيمن أصلان' });
  await expect(ayman.getByText('مطابق:')).toBeVisible();
  await expect(ayman.getByText('3 حركة')).toBeVisible();
  await ayman.getByRole('button', { name: 'ربط' }).click();
  await expect(page.getByText('رُبطت 3 حركة بـ «د أيمن أصلان»')).toBeVisible();

  const links = wire.writes.filter((w) => w.method === 'PATCH' && w.table === 'expenses');
  expect(links.map((w) => w.body)).toEqual([{ party_id: AYMAN }]);
  // The spellings are remembered for next time.
  const remembered = wire.writes.find((w) => w.method === 'PATCH' && w.table === 'parties')?.body as { aliases: string[] };
  expect(remembered.aliases).toEqual(expect.arrayContaining(['دأيمن أصلان', 'د. أيمن أصلان', 'دكتور أيمن اصلان']));

  // A name nobody has yet: added from the same screen, as a vendor.
  const hospitality = sheet.getByRole('article', { name: 'مؤسسة الضيافة' });
  await hospitality.getByRole('button', { name: 'إضافة إلى السجل' }).click();
  const form = page.getByRole('dialog', { name: /إضافة إلى سجل الموارد/ });
  await expect(form.getByLabel('الاسم *')).toHaveValue('مؤسسة الضيافة');
  await form.getByRole('radio', { name: /مورد/ }).click();
  await form.getByRole('button', { name: 'إضافة إلى السجل' }).click();
  await expect(page.getByText('أُضيف «مؤسسة الضيافة» إلى السجل')).toBeVisible();
  const created = wire.writes.find((w) => w.method === 'POST' && w.table === 'parties')?.body as Record<string, unknown>;
  expect(created).toMatchObject({ company_id: COMPANY_ID, name: 'مؤسسة الضيافة', kind: 'vendor' });
  await expect(sheet.getByText('كل الأسماء مربوطة بالسجل')).toBeVisible();
  await sheet.getByRole('button', { name: 'تم' }).click();
  await expect(sheet).toBeHidden();

  // Dr Ayman's page: 20,190 from the project, by kind, every row linked to it.
  await registry.getByRole('link', { name: /د أيمن أصلان/ }).click();
  await expect(page).toHaveURL(new RegExp(`/company/${COMPANY_ID}/party/${AYMAN}$`));
  await expect(page.getByRole('heading', { level: 1 })).toContainText('د أيمن أصلان');
  await expect(page.getByText('إجمالي ما صُرف له').locator('..')).toContainText('20,190.00');
  await expect(page.getByRole('region', { name: 'حسب المشروع' })).toContainText('3 حركة');
  await expect(page.getByRole('region', { name: 'كل الحركات' }).getByRole('row')).toHaveCount(4);
  await expect(page.getByRole('navigation', { name: 'مسار التنقل' })).toContainText('سجل الموارد');
});
