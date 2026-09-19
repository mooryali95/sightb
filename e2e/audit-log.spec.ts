import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { USER_ID } from './support/seed';

/**
 * The system audit log. It is the owner's page: an admin who is not the
 * owner is sent back to the dashboard. For the owner it lists what the
 * database triggers recorded, newest first under day headings, describing
 * a role change in words and an update by the fields that changed, and
 * the kind chips, the action chips and the search box narrow the list
 * with the count following them.
 */
const OWNER_ROLE = { id: '77777777-7777-4777-8777-777777777778', user_id: USER_ID, role: 'owner', scope_type: 'system', scope_id: null };
const entry = (id: string, over: Record<string, unknown>) => ({
  id, user_id: USER_ID, user_email: 'owner@example.com', entity_id: null, entity_name: null, details: null, ...over,
});
const ENTRIES = [
  entry('a1', { action: 'update', entity_type: 'user_role', created_at: '2026-09-18T08:00:00Z',
    details: { target_email: 'sami@example.com', old_role: 'viewer', new_role: 'editor', scope_type: 'project' } }),
  entry('a2', { action: 'update', entity_type: 'project', entity_name: 'مشروع الاختبار', created_at: '2026-09-17T10:00:00Z', user_email: 'admin@example.com',
    details: { old: { status: 'active', name: 'مشروع الاختبار' }, new: { status: 'archived', name: 'مشروع الاختبار' } } }),
  entry('a3', { action: 'insert', entity_type: 'company', entity_name: 'شركة الاختبار', created_at: '2026-09-17T09:00:00Z', user_email: null,
    details: { name: 'شركة الاختبار' } }),
];

const count = (page: Page) => page.getByText(/^\d+ سجل$/);
const chip = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

test('an admin who is not the owner is sent back to the dashboard', async ({ page }) => {
  await stubSupabase(page, { system_audit_log: ENTRIES });
  await page.goto('/audit');
  await expect(page.getByRole('heading', { name: 'إدارة الشركات' })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test('the owner sees the entries by day, in words, and narrows them by kind, action and search', async ({ page }) => {
  await stubSupabase(page, { system_audit_log: ENTRIES, user_roles: [OWNER_ROLE] });
  await page.goto('/audit');
  await expect(page.getByRole('heading', { name: 'السجل الرئيسي' })).toBeVisible();
  await expect(count(page)).toHaveText('3 سجل');

  // Two days, newest first; the role change in words, the update by what changed, the trigger's own entry as the system.
  const days = page.locator('span.rounded-full.bg-muted.text-xs.font-semibold');
  await expect(days).toHaveCount(2);
  await expect(page.getByText('sami@example.com • مشاهد → محرر • مشروع')).toBeVisible();
  await expect(page.getByText('status: active → archived', { exact: true })).toBeVisible();
  await expect(page.getByText('نظام', { exact: true })).toBeVisible();

  await chip(page, 'مشروع').click();
  await expect(count(page)).toHaveText('1 سجل');
  await expect(page.getByText('status: active → archived', { exact: true })).toBeVisible();
  await expect(page.getByText('sami@example.com • مشاهد → محرر • مشروع')).toHaveCount(0);

  await chip(page, 'حذف').click();
  await expect(count(page)).toHaveText('0 سجل');
  await expect(page.getByText('لا توجد سجلات تطابق البحث')).toBeVisible();

  await chip(page, 'الكل').first().click();
  await chip(page, 'الكل').last().click();
  await expect(count(page)).toHaveText('3 سجل');
  await page.getByPlaceholder('بحث بالإيميل أو الاسم أو التفاصيل...').fill('SAMI');
  await expect(count(page)).toHaveText('1 سجل');
  await expect(page.getByText('sami@example.com • مشاهد → محرر • مشروع')).toBeVisible();
});
