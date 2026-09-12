/**
 * Resource Payable Service
 * ---------------------------------------------------------------
 * Owns ALL remote I/O for:
 *   - resource_reimbursements (resource + vendor payables)
 *   - payment_requests
 *   - resource_settlements
 *   - settlement_events
 *
 * Returns raw rows (snake_case). Mapping to domain types stays in the
 * slice so the service remains free of store concerns.
 * Errors are thrown as `Error` with Arabic user-facing messages.
 */

import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

/** A write payload in the table's own column names. */
type Row = Record<string, unknown>;
type Reimbursement = Tables<'resource_reimbursements'>;
type Request = Tables<'payment_requests'>;
type Settlement = Tables<'resource_settlements'>;
type SettlementEvent = Tables<'settlement_events'>;

// The one loose read of the client in this module: payloads are built by
// column name, which the generated Insert types cannot follow. Every row
// that comes back is typed below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

function fail(error: unknown, fallback: string): never {
  throw new Error((error as { message?: string } | null)?.message || fallback);
}

/* ─────────────── Reimbursements ─────────────── */

export interface CreateReimbursementInput {
  projectId: string;
  resourceId?: string | null;
  sourceKind: 'resource' | 'vendor';
  vendorName?: string | null;
  category: string;
  description: string;
  amount: number;
  expenseDate: string;
  receiptAttachments?: unknown[];
  budgetItemId?: string | null;
  notes?: string | null;
  userId: string;
  autoApprove?: boolean;
}

export async function listReimbursementsRaw(projectId: string): Promise<Reimbursement[]> {
  const { data, error } = await db
    .from('resource_reimbursements')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) fail(error, 'فشل تحميل الاستردادات');
  return data ?? [];
}

export async function createReimbursementRaw(input: CreateReimbursementInput): Promise<Reimbursement> {
  const now = new Date().toISOString();
  const { data, error } = await db
    .from('resource_reimbursements')
    .insert({
      project_id: input.projectId,
      resource_id: input.sourceKind === 'resource' ? input.resourceId : null,
      source_kind: input.sourceKind,
      vendor_name: input.sourceKind === 'vendor' ? (input.vendorName || '').trim() : null,
      category: input.category,
      description: input.description.trim(),
      amount: input.amount,
      expense_date: input.expenseDate,
      receipt_attachments: input.receiptAttachments || [],
      budget_item_id: input.budgetItemId || null,
      notes: input.notes?.trim() || null,
      user_id: input.userId,
      status: input.autoApprove ? 'approved' : 'pending_review',
      approved_by: input.autoApprove ? input.userId : null,
      approved_at: input.autoApprove ? now : null,
    })
    .select()
    .single();
  if (error) fail(error, 'فشل تسجيل الاسترداد');
  return data;
}

export async function updateReimbursementRaw(id: string, payload: Row): Promise<Reimbursement> {
  const { data, error } = await db
    .from('resource_reimbursements').update(payload).eq('id', id).select().single();
  if (error) fail(error, 'فشل تحديث الاسترداد');
  return data;
}

export async function closeReimbursementsRaw(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await db
    .from('resource_reimbursements').update({ status: 'reimbursed' }).in('id', ids);
  if (error) fail(error, 'فشل إغلاق الاستردادات');
}

export async function deleteReimbursementRaw(id: string): Promise<void> {
  const { error } = await db.from('resource_reimbursements').delete().eq('id', id);
  if (error) fail(error, 'فشل حذف الاسترداد');
}

/* ─────────────── Payment Requests ─────────────── */

export async function listPaymentRequestsRaw(projectId: string): Promise<Request[]> {
  const { data, error } = await db
    .from('payment_requests')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) fail(error, 'فشل تحميل طلبات الصرف');
  return data ?? [];
}

export async function createPaymentRequestRaw(payload: Row): Promise<Request> {
  const { data, error } = await db
    .from('payment_requests').insert(payload).select().single();
  if (error) fail(error, 'فشل إنشاء طلب الصرف');
  return data;
}

export async function updatePaymentRequestRaw(id: string, payload: Row): Promise<Request> {
  const { data, error } = await db
    .from('payment_requests').update(payload).eq('id', id).select().single();
  if (error) fail(error, 'فشل تحديث طلب الصرف');
  return data;
}

export async function deletePaymentRequestRaw(id: string): Promise<void> {
  const { error } = await db.from('payment_requests').delete().eq('id', id);
  if (error) fail(error, 'فشل حذف طلب الصرف');
}

/* ─────────────── Expenses (settlement side-effects) ─────────────── */

export async function createSettlementExpenseRaw(payload: Row): Promise<Tables<'expenses'>> {
  const { data, error } = await db.from('expenses').insert(payload).select().single();
  if (error) fail(error, 'فشل إنشاء مصروف التسوية');
  return data;
}

export async function deleteExpenseRaw(id: string): Promise<void> {
  const { error } = await db.from('expenses').delete().eq('id', id);
  if (error) fail(error, 'فشل حذف المصروف المرتبط');
}

/* ─────────────── Settlement Events ─────────────── */

export async function createSettlementEventRaw(payload: Row): Promise<void> {
  const { error } = await db.from('settlement_events').insert(payload);
  if (error) fail(error, 'فشل تسجيل حدث التسوية');
}

export async function getSettlementEventRaw(id: string): Promise<SettlementEvent | null> {
  const { data, error } = await db
    .from('settlement_events').select('*').eq('id', id).maybeSingle();
  if (error) fail(error, 'فشل تحميل حدث التسوية');
  return data ?? null;
}

export async function findReverseEventRaw(eventId: string): Promise<SettlementEvent | null> {
  const { data, error } = await db
    .from('settlement_events')
    .select('id')
    .eq('reversed_event_id', eventId)
    .eq('event_type', 'reverse')
    .maybeSingle();
  if (error) fail(error, 'فشل التحقق من حالة التراجع');
  return data ?? null;
}

/* ─────────────── Resource Settlements ─────────────── */

export async function listResourceSettlementsRaw(projectId: string): Promise<Settlement[]> {
  const { data, error } = await db
    .from('resource_settlements')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) fail(error, 'فشل تحميل المخالصات');
  return data ?? [];
}

export async function createResourceSettlementRaw(payload: Row): Promise<Settlement> {
  const { data, error } = await db
    .from('resource_settlements').insert(payload).select().single();
  if (error) fail(error, 'فشل إنشاء المخالصة');
  return data;
}

export async function updateResourceSettlementRaw(id: string, payload: Row): Promise<Settlement> {
  const { data, error } = await db
    .from('resource_settlements').update(payload).eq('id', id).select().single();
  if (error) fail(error, 'فشل تحديث المخالصة');
  return data;
}

export async function deleteResourceSettlementRaw(id: string): Promise<void> {
  const { error } = await db.from('resource_settlements').delete().eq('id', id);
  if (error) fail(error, 'فشل حذف المخالصة');
}
