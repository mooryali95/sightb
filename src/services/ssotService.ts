/**
 * ssotService
 * ---------------------------------------------------------------
 * Source-of-truth transparency: returns the exact SQL, its result and
 * the query plan behind a single financial figure. Admin only (enforced
 * server-side by `ssot_explain`).
 */

import { db } from './db';

export interface SsotExplanation {
  sql: string;
  result: number;
  plan: unknown;
}

export async function explainSsotKey(key: string, projectId: string): Promise<SsotExplanation> {
  const { data, error } = await db.rpc<SsotExplanation>('ssot_explain', {
    _key: key,
    _project_id: projectId,
  });
  if (error) {
    const message = (error as { message?: string })?.message ?? '';
    throw new Error(
      message.includes('admin_only')
        ? 'هذه الأداة متاحة لمدير النظام فقط.'
        : message || 'تعذّر جلب المصدر.'
    );
  }
  return data as SsotExplanation;
}
