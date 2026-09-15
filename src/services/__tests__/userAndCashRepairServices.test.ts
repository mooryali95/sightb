/**
 * Unit tests for the two admin-facing services that still had none: the
 * user lifecycle (profiles, roles, invites and the privileged edge
 * functions behind them) and the orphan cash transfer repair. Both go
 * through the retry-aware facade, which is replaced here by a recorder
 * for table chains and plain mocks for edge functions and RPCs; `unwrap`
 * stays the real one so its error normalisation is under test too.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

interface Call { table: string; ops: [string, unknown[]][] }
const calls: Call[] = [];
const answers: unknown[] = [];
const invoke = vi.fn();
const rpc = vi.fn();
function builder(table: string) {
  const call: Call = { table, ops: [] };
  calls.push(call);
  const b: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(answers.shift() ?? { data: null, error: null }).then(resolve, reject),
  };
  for (const op of ['select', 'eq', 'order', 'delete']) {
    b[op] = (...args: unknown[]) => { call.ops.push([op, args]); return b; };
  }
  return b;
}
vi.mock('../db', async (orig) => ({
  ...(await orig<typeof import('../db')>()),
  db: { from: (table: string) => builder(table), invoke: (...a: unknown[]) => invoke(...a), rpc: (...a: unknown[]) => rpc(...a) },
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import * as users from '../userService';
import { listCashTransferRepairs, repairOrphanCashTransfer } from '../cashRepairService';

const ops = (i = 0) => calls[i].ops.map(([op, args]) => [op, ...args]);

beforeEach(() => { calls.length = 0; answers.length = 0; invoke.mockReset(); rpc.mockReset(); });

describe('user lists', () => {
  it('reads profiles newest first and maps a missing name to an empty string', async () => {
    answers.push({ data: [{ id: 'u1', email: 'a@x.co', full_name: null, status: 'active', created_at: '' }], error: null });
    expect(await users.listProfiles()).toEqual([{ id: 'u1', email: 'a@x.co', fullName: '', status: 'active' }]);
    expect(calls[0].table).toBe('profiles');
    expect(ops()).toEqual([['select', '*'], ['order', 'created_at', { ascending: false }]]);
  });

  it('reads every role, or one user\'s roles, in the store\'s shape', async () => {
    const row = { id: 'r1', user_id: 'u1', role: 'editor', scope_type: 'project', scope_id: 'p1' };
    answers.push({ data: [row], error: null });
    expect(await users.listRoles()).toEqual([{ id: 'r1', userId: 'u1', role: 'editor', scopeType: 'project', scopeId: 'p1' }]);
    expect(ops(0)).toEqual([['select', '*']]);

    answers.push({ data: [{ ...row, scope_type: 'system', scope_id: null }], error: null });
    expect(await users.listRolesForUser('u1')).toEqual([expect.objectContaining({ scopeType: 'system', scopeId: null })]);
    expect(calls[1].table).toBe('user_roles');
    expect(ops(1)).toEqual([['select', '*'], ['eq', 'user_id', 'u1']]);
  });

  it('reads invites newest first with their status and date', async () => {
    answers.push({ data: [{ id: 'i1', email: 'b@x.co', role: 'viewer', scope_type: 'company', scope_id: 'c1', status: 'pending', created_at: '2026-09-01' }], error: null });
    expect(await users.listInvites()).toEqual([{ id: 'i1', email: 'b@x.co', role: 'viewer', scopeType: 'company', scopeId: 'c1', status: 'pending', createdAt: '2026-09-01' }]);
    expect(calls[0].table).toBe('user_invites');
    expect(ops()).toEqual([['select', '*'], ['order', 'created_at', { ascending: false }]]);
  });

  it('answers empty lists for no rows and throws the database error otherwise', async () => {
    answers.push({ data: null, error: null });
    expect(await users.listProfiles()).toEqual([]);
    answers.push({ data: null, error: { message: 'permission denied' } });
    await expect(users.listRoles()).rejects.toThrow('permission denied');
    answers.push({ data: null, error: new Error('offline') });
    await expect(users.listInvites()).rejects.toThrow('offline');
  });
});

describe('invite email status', () => {
  it('asks the edge function for the given emails and normalises every field of the answer', async () => {
    invoke.mockResolvedValue({ data: { items: [
      { inviteId: 'i1', email: 'Big@X.CO', status: 'delivered', errorMessage: null, createdAt: '2026-09-01' },
      { email: undefined },
    ] }, error: null });
    expect(await users.fetchInviteEmailStatus(['big@x.co'])).toEqual([
      { inviteId: 'i1', email: 'big@x.co', status: 'delivered', errorMessage: null, createdAt: '2026-09-01' },
      { inviteId: null, email: '', status: 'unknown', errorMessage: null, createdAt: '' },
    ]);
    expect(invoke).toHaveBeenCalledWith('admin-email-status', { emails: ['big@x.co'] });
  });

  it('answers an empty list without items and throws a real error or the Arabic fallback', async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    expect(await users.fetchInviteEmailStatus([])).toEqual([]);
    invoke.mockResolvedValue({ data: null, error: new Error('401') });
    await expect(users.fetchInviteEmailStatus([])).rejects.toThrow('401');
    invoke.mockResolvedValue({ data: null, error: { status: 500 } });
    await expect(users.fetchInviteEmailStatus([])).rejects.toThrow('تعذّر جلب حالة البريد');
  });
});

describe('sending an invite', () => {
  it('sends the scope as given, and no scope id for a system role', async () => {
    invoke.mockResolvedValue({ data: { emailSent: true }, error: null });
    expect(await users.sendInvite({ email: 'c@x.co', role: 'editor', scopeType: 'project', scopeId: 'p1' })).toEqual({ emailSent: true });
    // Strict: a plain invite must not carry resend keys, even undefined ones.
    expect(invoke.mock.calls[0]).toStrictEqual(['send-invite', { email: 'c@x.co', role: 'editor', scope_type: 'project', scope_id: 'p1' }]);

    await users.sendInvite({ email: 'c@x.co', role: 'admin', scopeType: 'system', scopeId: 'p1' });
    expect(invoke.mock.calls[1]).toStrictEqual(['send-invite', { email: 'c@x.co', role: 'admin', scope_type: 'system', scope_id: null }]);
  });

  it('marks a resend with the invite it repeats and answers an empty object for no data', async () => {
    invoke.mockResolvedValue({ data: null, error: null });
    expect(await users.sendInvite({ email: 'c@x.co', role: 'viewer', scopeType: 'company', scopeId: 'c1', resend: true, inviteId: 'i1' })).toEqual({});
    expect(invoke).toHaveBeenCalledWith('send-invite', expect.objectContaining({ resend: true, invite_id: 'i1' }));
    expect(invoke.mock.calls[0][1]).not.toHaveProperty('inviteId');
  });

  it('throws the edge function\'s error or the Arabic fallback', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('rate limited') });
    await expect(users.sendInvite({ email: 'c@x.co', role: 'viewer', scopeType: 'company', scopeId: 'c1' })).rejects.toThrow('rate limited');
    invoke.mockResolvedValue({ data: null, error: 'boom' });
    await expect(users.sendInvite({ email: 'c@x.co', role: 'viewer', scopeType: 'company', scopeId: 'c1' })).rejects.toThrow('تعذّر إرسال الدعوة');
  });
});

describe('removals', () => {
  it('deletes an invite and a role by id and throws the database error', async () => {
    answers.push({ data: null, error: null });
    await users.deleteInvite('i1');
    expect(calls[0].table).toBe('user_invites');
    expect(ops(0)).toEqual([['delete'], ['eq', 'id', 'i1']]);

    answers.push({ data: null, error: null });
    await users.deleteRole('r1');
    expect(calls[1].table).toBe('user_roles');
    expect(ops(1)).toEqual([['delete'], ['eq', 'id', 'r1']]);

    answers.push({ data: null, error: { message: 'last admin' } });
    await expect(users.deleteRole('r1')).rejects.toThrow('last admin');
  });

  it('deletes a user through the edge function and surfaces an error it reports in its body', async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    await users.deleteUser('u9');
    expect(invoke).toHaveBeenCalledWith('delete-user', { targetUserId: 'u9' });

    invoke.mockResolvedValue({ data: { error: 'لا يمكن حذف حسابك' }, error: null });
    await expect(users.deleteUser('u9')).rejects.toThrow('لا يمكن حذف حسابك');
    invoke.mockResolvedValue({ data: null, error: { status: 403 } });
    await expect(users.deleteUser('u9')).rejects.toThrow('تعذّر حذف الحساب');
  });
});

describe('cash transfer repairs', () => {
  it('reads a project\'s repair log newest first and maps the row, with null snapshots kept null', async () => {
    answers.push({ data: [{
      id: 'rep-1', project_id: 'p1', transfer_id: 't1', custody_id: 'c1', custody_name: 'عمر', amount: '2500', transfer_date: '2026-08-02',
      missing_fund_id: 'f-missing', reason: 'دفعة محذوفة', before_snapshot: { custody: { custody_id: 'c1', available: 10000 } }, after_snapshot: undefined,
      performed_by: 'u1', performed_by_email: 'a@x.co', created_at: '2026-09-01',
    }], error: null });
    expect(await listCashTransferRepairs('p1')).toEqual([{
      id: 'rep-1', projectId: 'p1', transferId: 't1', custodyId: 'c1', custodyName: 'عمر', amount: 2500, transferDate: '2026-08-02',
      missingFundId: 'f-missing', reason: 'دفعة محذوفة', before: { custody: { custody_id: 'c1', available: 10000 } }, after: null,
      performedBy: 'u1', performedByEmail: 'a@x.co', createdAt: '2026-09-01',
    }]);
    expect(calls[0].table).toBe('cash_transfer_repairs');
    expect(ops()).toEqual([['select', '*'], ['eq', 'project_id', 'p1'], ['order', 'created_at', { ascending: false }]]);

    answers.push({ data: null, error: null });
    expect(await listCashTransferRepairs('p1')).toEqual([]);
    answers.push({ data: null, error: { message: 'no access' } });
    await expect(listCashTransferRepairs('p1')).rejects.toThrow('no access');
  });

  it('repairs only through the server function and returns the repair id', async () => {
    rpc.mockResolvedValue({ data: { repair_id: 'rep-2' }, error: null });
    expect(await repairOrphanCashTransfer('t1', 'الدفعة حُذفت')).toEqual({ repair_id: 'rep-2' });
    expect(rpc).toHaveBeenCalledWith('repair_orphan_cash_transfer', { _transfer_id: 't1', _reason: 'الدفعة حُذفت' });
    expect(calls).toHaveLength(0);
  });

  it('throws the server message, or the Arabic fallback when there is none', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'transfer already repaired' } });
    await expect(repairOrphanCashTransfer('t1', 'x')).rejects.toThrow('transfer already repaired');
    rpc.mockResolvedValue({ data: null, error: {} });
    await expect(repairOrphanCashTransfer('t1', 'x')).rejects.toThrow('تعذّر تنفيذ الإصلاح');
  });
});
