/// <reference types="node" />
/**
 * The gate on the paid AI features (ai-executive-summary, extract-receipt-data):
 * an owner, admin or editor whose session passed its second factor goes on; a
 * viewer, or someone with no role, is refused with 403 even with the factor
 * passed; and a session that owes its second factor is refused first.
 */
import { describe, it, expect } from 'vitest';
import { requireWorkingRole } from '../../../supabase/functions/_shared/workingRole.ts';

const SESSION = '0b1c2d3e-4f50-4617-8829-3a4b5c6d7e8f';
const token = `h.${Buffer.from(JSON.stringify({ session_id: SESSION })).toString('base64url')}.s`;
type Answer = { data: unknown; error: unknown };
function client(answers: { enforce: boolean; roles: string[]; passed: boolean }) {
  const builder = (table: string) => {
    const answer: Answer = table === 'second_factor_settings' ? { data: { enforce: answers.enforce }, error: null }
      : table === 'user_roles' ? { data: answers.roles.map((role) => ({ role })), error: null }
      : { data: answers.passed ? { session_id: SESSION } : null, error: null };
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq']) chain[m] = () => chain;
    chain.maybeSingle = async () => answer;
    chain.then = (resolve: (v: unknown) => unknown) => resolve(answer);
    return chain;
  };
  return { from: builder } as unknown as Parameters<typeof requireWorkingRole>[0];
}

describe('requireWorkingRole', () => {
  it('lets an owner, admin or editor through once their session passed its second factor', async () => {
    for (const role of ['owner', 'admin', 'editor']) {
      expect(await requireWorkingRole(client({ enforce: true, roles: [role], passed: true }), token, 'u1', {})).toBeNull();
    }
  });

  it('refuses a viewer or someone with no role with 403', async () => {
    for (const roles of [['viewer'], []]) {
      const res = await requireWorkingRole(client({ enforce: true, roles, passed: true }), token, 'u1', {});
      expect(res?.status).toBe(403);
      expect((await res!.json()).error).toContain('مالك أو مدير أو محرّر');
    }
  });

  it('refuses an editor whose session owes its second factor, before reading the role', async () => {
    const res = await requireWorkingRole(client({ enforce: true, roles: ['editor'], passed: false }), token, 'u1', {});
    expect(res?.status).toBe(403);
    expect((await res!.json()).needsSecondFactor).toBe(true);
  });
});
