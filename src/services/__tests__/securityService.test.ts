/**
 * Security regression tests (client contract).
 *
 * The database enforces access; these tests pin the *contract* the UI relies
 * on, so a change to the RPC shape or to the reason codes fails CI instead of
 * silently rendering an empty / misleading permission matrix.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('@/services/db', () => ({ db: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { explainAttachmentAccess, REASON_LABELS } from '../securityService';

const allowPayload = {
  path: 'uid/1.jpg',
  decision: 'allow',
  reason: 'project_scope_access',
  subject: { user_id: 'u1', is_system_admin: false, roles: [{ role: 'editor', scope_type: 'project', scope_id: 'p1' }] },
  match_count: 1,
  matches: [
    {
      source: 'expenses',
      bucket: 'expense-receipts',
      record_id: 'e1',
      project_id: 'p1',
      project_name: 'مشروع أ',
      company_id: 'c1',
      is_record_owner: true,
      decision: 'allow',
      checks: [
        { rule: 'has_role(admin|owner)', passed: false, detail: '' },
        { rule: 'has_access(project)', passed: true, detail: '' },
        { rule: 'can_edit(project)', passed: true, detail: '' },
      ],
    },
  ],
};

describe('explainAttachmentAccess', () => {
  beforeEach(() => rpc.mockReset());

  it('calls the server function with a trimmed path', async () => {
    rpc.mockResolvedValue({ data: allowPayload, error: null });
    await explainAttachmentAccess('  uid/1.jpg  ');
    expect(rpc).toHaveBeenCalledWith('explain_attachment_access', { _path: 'uid/1.jpg' });
  });

  it('never decides locally — it returns the server decision verbatim', async () => {
    rpc.mockResolvedValue({
      data: { ...allowPayload, decision: 'deny', reason: 'no_role_on_owning_project' },
      error: null,
    });
    const res = await explainAttachmentAccess('uid/1.jpg');
    expect(res.decision).toBe('deny');
  });

  it('surfaces an orphan path as a deny with zero matches', async () => {
    rpc.mockResolvedValue({
      data: { path: 'x', decision: 'deny', reason: 'orphan_path_no_matching_record', matches: [], match_count: 0 },
      error: null,
    });
    const res = await explainAttachmentAccess('x');
    expect(res.matches).toHaveLength(0);
    expect(REASON_LABELS[res.reason]).toBeTruthy();
  });

  it('throws a user-facing error when the RPC fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    await expect(explainAttachmentAccess('x')).rejects.toThrow('permission denied');
  });

  it('has an Arabic label for every reason code the function can return', () => {
    for (const code of [
      'no_session',
      'admin_role',
      'project_scope_access',
      'orphan_path_no_matching_record',
      'no_role_on_owning_project',
    ]) {
      expect(REASON_LABELS[code]).toBeTruthy();
    }
  });
});
