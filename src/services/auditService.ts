/**
 * auditService
 * ---------------------------------------------------------------
 * Read-only access to the server-written system audit trail.
 * Writes happen exclusively through database triggers.
 */

import { db, unwrap } from './db';

export interface SystemAuditEntry {
  id: string;
  userId: string;
  userEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  entityName: string | null;
  details: unknown;
  createdAt: string;
}

export async function listSystemAuditEntries(limit = 500): Promise<SystemAuditEntry[]> {
  const res = await db
    .from('system_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  const rows = unwrap<any[]>(res, 'تعذّر تحميل سجل التدقيق');
  return (rows || []).map((e) => ({
    id: e.id,
    userId: e.user_id,
    userEmail: e.user_email,
    action: e.action,
    entityType: e.entity_type,
    entityId: e.entity_id,
    entityName: e.entity_name,
    details: e.details,
    createdAt: e.created_at,
  }));
}
