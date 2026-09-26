/**
 * The guard the service-role functions call (send-invite, delete-user,
 * admin-email-status, passkeys). What must hold: nothing is refused while
 * enforcement is off or before its migration exists; a viewer passes; an
 * owner, admin or editor passes only with this very session recorded; a
 * token without a session claim never passes once enforcement is on; and a
 * settings read that fails for another reason refuses rather than lets
 * through.
 */
import { describe, it, expect } from 'vitest';
import { requireSecondFactor, sessionPassedSecondFactor } from '../../../supabase/functions/_shared/sessionGate.ts';

const SESSION = '0b1c2d3e-4f50-4617-8829-3a4b5c6d7e8f';
const token = (claims: Record<string, unknown>) =>
  `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;

type Answer = { data: unknown; error: unknown };
/** A stand-in for the service-role client: one canned answer per table. */
function client(answers: { settings?: Answer; roles?: Answer; session?: Answer }) {
  const seen: string[] = [];
  const builder = (table: string) => {
    seen.push(table);
    const answer = table === 'second_factor_settings' ? answers.settings
      : table === 'user_roles' ? answers.roles
      : answers.session;
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq']) chain[m] = () => chain;
    chain.maybeSingle = async () => answer ?? { data: null, error: null };
    chain.then = (resolve: (v: unknown) => unknown) => resolve(answer ?? { data: [], error: null });
    return chain;
  };
  return { from: builder, seen } as unknown as Parameters<typeof sessionPassedSecondFactor>[0] & { seen: string[] };
}
const on = { data: { enforce: true }, error: null };
const editor = { data: [{ role: 'editor' }], error: null };

describe('sessionPassedSecondFactor', () => {
  it('lets everything through while enforcement is off, or before its migration exists', async () => {
    expect(await sessionPassedSecondFactor(client({ settings: { data: { enforce: false }, error: null } }), 'u1', SESSION)).toBe(true);
    expect(await sessionPassedSecondFactor(client({ settings: { data: null, error: { code: 'PGRST205' } } }), 'u1', SESSION)).toBe(true);
    expect(await sessionPassedSecondFactor(client({ settings: { data: null, error: { code: '42P01' } } }), 'u1', SESSION)).toBe(true);
    // No settings row reads as off, as COALESCE(enforce, false) does in second_factor_ok.
    expect(await sessionPassedSecondFactor(client({ settings: { data: null, error: null }, roles: editor, session: { data: null, error: null } }), 'u1', SESSION)).toBe(true);
  });

  it('refuses when the settings cannot be read for another reason', async () => {
    expect(await sessionPassedSecondFactor(client({ settings: { data: null, error: { code: '57014' } } }), 'u1', SESSION)).toBe(false);
  });

  it('lets a viewer through, and an editor only with this session recorded', async () => {
    expect(await sessionPassedSecondFactor(client({ settings: on, roles: { data: [{ role: 'viewer' }], error: null } }), 'u1', SESSION)).toBe(true);
    expect(await sessionPassedSecondFactor(client({ settings: on, roles: editor, session: { data: { session_id: SESSION }, error: null } }), 'u1', SESSION)).toBe(true);
    expect(await sessionPassedSecondFactor(client({ settings: on, roles: editor, session: { data: null, error: null } }), 'u1', SESSION)).toBe(false);
  });

  it('never lets a token without a session claim through once enforcement is on', async () => {
    const c = client({ settings: on, roles: editor, session: { data: { session_id: SESSION }, error: null } });
    expect(await sessionPassedSecondFactor(c, 'u1', '')).toBe(false);
    expect(c.seen).not.toContain('session_second_factor');
  });
});

describe('requireSecondFactor', () => {
  it('answers 403 with a reason for a session that owes it, and nothing for one that passed', async () => {
    const owes = client({ settings: on, roles: editor, session: { data: null, error: null } });
    const refused = await requireSecondFactor(owes, token({ session_id: SESSION }), 'u1', { 'Access-Control-Allow-Origin': 'x' });
    expect(refused?.status).toBe(403);
    expect(refused?.headers.get('Access-Control-Allow-Origin')).toBe('x');
    expect(await refused?.json()).toEqual({ error: 'أكمل التحقق بخطوتين لهذه الجلسة أولاً.', needsSecondFactor: true });

    const passed = client({ settings: on, roles: editor, session: { data: { session_id: SESSION }, error: null } });
    expect(await requireSecondFactor(passed, token({ session_id: SESSION }), 'u1', {})).toBeNull();
  });

  it('reads the session from the token, so a token for another session is refused', async () => {
    const c = client({ settings: on, roles: editor, session: { data: null, error: null } });
    expect((await requireSecondFactor(c, token({ session_id: '11111111-2222-4333-8444-555555555555' }), 'u1', {}))?.status).toBe(403);
  });
});
