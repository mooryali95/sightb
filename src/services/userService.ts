/**
 * userService
 * ---------------------------------------------------------------
 * Admin-facing user lifecycle I/O: profiles, roles, invites and the
 * privileged edge functions behind them. Pages must not talk to the
 * database client directly — they call these functions.
 */

import { db, unwrap } from './db';

export interface ProfileRow {
  id: string;
  email: string;
  fullName: string;
  status: string;
}

export interface RoleRow {
  id: string;
  userId: string;
  role: string;
  scopeType: string;
  scopeId: string | null;
}

export interface InviteRow {
  id: string;
  email: string;
  role: string;
  scopeType: string;
  scopeId: string | null;
  status: string;
  createdAt: string;
}

export interface EmailStatusItem {
  inviteId: string | null;
  email: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
}

export interface InvitePayload {
  email: string;
  role: string;
  scopeType: string;
  scopeId: string | null;
  resend?: boolean;
  inviteId?: string;
}

export async function listProfiles(): Promise<ProfileRow[]> {
  const res = await db.from('profiles').select('*').order('created_at', { ascending: false });
  const rows = unwrap<any[]>(res, 'تعذّر تحميل المستخدمين');
  return (rows || []).map((p) => ({
    id: p.id,
    email: p.email,
    fullName: p.full_name || '',
    status: p.status,
  }));
}

export async function listRoles(): Promise<RoleRow[]> {
  const res = await db.from('user_roles').select('*');
  const rows = unwrap<any[]>(res, 'تعذّر تحميل الصلاحيات');
  return (rows || []).map((r) => ({
    id: r.id,
    userId: r.user_id,
    role: r.role,
    scopeType: r.scope_type,
    scopeId: r.scope_id,
  }));
}

export async function listRolesForUser(userId: string): Promise<RoleRow[]> {
  const res = await db.from('user_roles').select('*').eq('user_id', userId);
  const rows = unwrap<any[]>(res, 'تعذّر تحميل صلاحيات المستخدم');
  return (rows || []).map((r) => ({
    id: r.id,
    userId: r.user_id,
    role: r.role,
    scopeType: r.scope_type,
    scopeId: r.scope_id,
  }));
}

export async function listInvites(): Promise<InviteRow[]> {
  const res = await db.from('user_invites').select('*').order('created_at', { ascending: false });
  const rows = unwrap<any[]>(res, 'تعذّر تحميل الدعوات');
  return (rows || []).map((i) => ({
    id: i.id,
    email: i.email,
    role: i.role,
    scopeType: i.scope_type,
    scopeId: i.scope_id,
    status: i.status,
    createdAt: i.created_at,
  }));
}

/**
 * One row as `admin-email-status` returns it. Every field is optional because
 * it crosses an edge-function boundary the compiler cannot see through — which
 * is the reason to write the shape down rather than accept `any[]` and let a
 * renamed field read as `undefined` in the UI.
 */
interface EmailStatusResponseItem {
  inviteId?: string | null;
  email?: string;
  status?: EmailStatusItem['status'];
  errorMessage?: string | null;
  createdAt?: string;
}

export async function fetchInviteEmailStatus(emails: string[]): Promise<EmailStatusItem[]> {
  const { data, error } = await db.invoke<{ items?: EmailStatusResponseItem[] }>('admin-email-status', { emails });
  if (error) throw error instanceof Error ? error : new Error('تعذّر جلب حالة البريد');
  return (data?.items || []).map((item) => ({
    inviteId: item.inviteId ?? null,
    email: String(item.email || '').toLowerCase(),
    // These two were previously read straight off an `any`, so the declared
    // `string` was a claim the data never had to honour: a response without
    // them put `undefined` into a field typed as present. The UI already falls
    // back for a status it does not recognise, so naming the gap costs nothing
    // and stops it travelling any further.
    status: item.status ?? 'unknown',
    errorMessage: item.errorMessage ?? null,
    createdAt: item.createdAt ?? '',
  }));
}

export async function sendInvite(payload: InvitePayload): Promise<{ existingUser?: boolean; emailSent?: boolean }> {
  const { data, error } = await db.invoke<{ existingUser?: boolean; emailSent?: boolean }>('send-invite', {
    email: payload.email,
    role: payload.role,
    scope_type: payload.scopeType,
    scope_id: payload.scopeType === 'system' ? null : payload.scopeId,
    ...(payload.resend ? { resend: true, invite_id: payload.inviteId } : {}),
  });
  if (error) throw error instanceof Error ? error : new Error('تعذّر إرسال الدعوة');
  return data || {};
}

export async function deleteInvite(id: string): Promise<void> {
  unwrap(await db.from('user_invites').delete().eq('id', id), 'تعذّر حذف الدعوة');
}

export async function deleteRole(id: string): Promise<void> {
  unwrap(await db.from('user_roles').delete().eq('id', id), 'تعذّر حذف الصلاحية');
}

export async function deleteUser(targetUserId: string): Promise<void> {
  const { data, error } = await db.invoke<{ error?: string }>('delete-user', { targetUserId });
  if (error) throw error instanceof Error ? error : new Error('تعذّر حذف الحساب');
  if (data?.error) throw new Error(data.error);
}
