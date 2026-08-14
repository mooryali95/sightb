/**
 * securityService
 * ---------------------------------------------------------------
 * Permission diagnostics. Wraps `explain_attachment_access`, the
 * server-side function that reproduces — rule by rule — the exact
 * decision the storage policies make for one attachment path.
 *
 * Nothing here decides access; it only *explains* the server's answer,
 * so the UI can never drift from the real policy.
 */

import { db } from './db';

export interface AccessCheck {
  rule: string;
  passed: boolean;
  detail: string;
}

export interface AttachmentMatch {
  source: 'expenses' | 'resource_reimbursements' | 'payment_requests' | 'fund_settlements';
  bucket: string;
  record_id: string | null;
  project_id: string | null;
  project_name: string | null;
  company_id: string | null;
  is_record_owner: boolean;
  checks: AccessCheck[];
  decision: 'allow' | 'deny';
}

export interface AttachmentAccessExplanation {
  path: string;
  checked_at?: string;
  subject?: {
    user_id: string;
    is_system_admin: boolean;
    roles: { role: string; scope_type: string; scope_id: string | null }[];
  };
  bucket?: string | null;
  matches?: AttachmentMatch[];
  match_count?: number;
  decision: 'allow' | 'deny';
  reason: string;
}

/** Arabic explanation for each `reason` code the function can return. */
export const REASON_LABELS: Record<string, string> = {
  no_session: 'لا توجد جلسة مستخدم — الوصول مرفوض دائماً.',
  admin_role: 'مسموح: دور نظامي (مدير/مالك) يمنح قراءة كل المرفقات.',
  project_scope_access: 'مسموح: لديك دور على المشروع المالك للمرفق (أو شركته).',
  orphan_path_no_matching_record:
    'مرفوض: لا يوجد أي سجل في قاعدة البيانات يشير إلى هذا المسار (ملف يتيم).',
  no_role_on_owning_project: 'مرفوض: المرفق تابع لمشروع لا تملك أي دور عليه.',
};

export async function explainAttachmentAccess(path: string): Promise<AttachmentAccessExplanation> {
  const { data, error } = await db.rpc<AttachmentAccessExplanation>('explain_attachment_access', {
    _path: path.trim(),
  });
  if (error) {
    throw new Error((error as { message?: string })?.message || 'تعذّر فحص صلاحية المرفق.');
  }
  return data as AttachmentAccessExplanation;
}
