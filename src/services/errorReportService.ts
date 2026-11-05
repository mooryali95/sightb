/**
 * errorReportService
 * ---------------------------------------------------------------
 * Sends an error the app met to the server's log, and reads that log back
 * for an owner. The server dedupes and rate limits (report_client_error),
 * and only an owner can read the table.
 */
import { supabase } from '@/integrations/supabase/client';

// Not in the generated types until Lovable regenerates them after the
// migration is applied; every row is mapped to a typed value below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface ClientErrorReport {
  fingerprint: string;
  scope: string;
  message: string;
  context?: Record<string, unknown>;
  path?: string;
  release?: string;
  userAgent?: string;
}

export interface ClientErrorRow {
  id: string;
  userId: string;
  day: string;
  fingerprint: string;
  scope: string;
  message: string;
  context: Record<string, unknown>;
  path: string | null;
  release: string | null;
  userAgent: string | null;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
}

/** Records one error; resolves false instead of throwing, since a failed report must never become a second error. */
export async function reportClientError(r: ClientErrorReport): Promise<boolean> {
  try {
    const { error } = await db.rpc('report_client_error', {
      _fingerprint: r.fingerprint,
      _scope: r.scope,
      _message: r.message,
      _context: r.context ?? {},
      _path: r.path ?? null,
      _release: r.release ?? null,
      _user_agent: r.userAgent ?? null,
    });
    return !error;
  } catch {
    return false;
  }
}

export async function listClientErrors(limit = 300): Promise<ClientErrorRow[]> {
  const { data, error } = await db.from('client_errors').select('*').order('last_seen', { ascending: false }).limit(limit);
  if (error) throw new Error('تعذّر تحميل سجل الأعطال');
  return ((data ?? []) as Record<string, unknown>[]).map((e) => ({
    id: String(e.id),
    userId: String(e.user_id),
    day: String(e.day),
    fingerprint: String(e.fingerprint),
    scope: String(e.scope),
    message: String(e.message),
    context: (e.context as Record<string, unknown>) ?? {},
    path: (e.path as string | null) ?? null,
    release: (e.release as string | null) ?? null,
    userAgent: (e.user_agent as string | null) ?? null,
    occurrences: Number(e.occurrences) || 1,
    firstSeen: String(e.first_seen),
    lastSeen: String(e.last_seen),
  }));
}
