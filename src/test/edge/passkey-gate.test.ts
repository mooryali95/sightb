/**
 * Adding a passkey takes more than a password. What must hold: the grant is
 * bound to the session that confirmed the code, and a token without a
 * session claim gets none; sends are limited per ten minutes and per day,
 * and a limited request sends nothing; every guess, malformed ones too, goes
 * through the locked database check; and a key the authenticator could not
 * keep discoverable is marked verification-only.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  sendStepUp, verifyStepUp, stepUpCode, signInCapability, sessionIdOf, grantCutoff,
  GATE_MESSAGES, STEP_UP_MAX_SENDS, STEP_UP_MAX_SENDS_PER_DAY, type StepUpStore,
} from '../../../supabase/functions/_shared/passkeyGate.ts';

const NOW = new Date('2026-09-24T12:00:00Z');
const SESSION = '0b1c2d3e-4f50-4617-8829-3a4b5c6d7e8f';
const hash = async (code: string) => `h(${code})`;

const jwt = (claims: Record<string, unknown>) => {
  const part = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${part({ alg: 'HS256' })}.${part(claims)}.signature`;
};

function store(outcome: 'ok' | 'wrong' | 'spent' | 'none' = 'ok'): StepUpStore {
  return {
    countSince: vi.fn(async () => 0),
    insert: vi.fn(async () => {}),
    check: vi.fn(async () => outcome),
    hasGrant: vi.fn(async () => false),
    consumeGrant: vi.fn(async () => false),
  };
}

describe('sessionIdOf', () => {
  it('reads the session claim of a token, and nothing from a malformed one', () => {
    expect(sessionIdOf(jwt({ sub: 'u1', session_id: SESSION }))).toBe(SESSION);
    expect(sessionIdOf(jwt({ sub: 'u1' }))).toBe('');
    expect(sessionIdOf(jwt({ session_id: 'not-a-uuid' }))).toBe('');
    expect(sessionIdOf(jwt({ session_id: 42 }))).toBe('');
    expect(sessionIdOf('publishable-key')).toBe('');
    expect(sessionIdOf('a.%%%.c')).toBe('');
    expect(sessionIdOf('')).toBe('');
  });
});

describe('stepUpCode', () => {
  it('is always six digits', () => {
    for (const draw of [0, 1, 899999, 900000, 4294967295]) expect(stepUpCode(draw)).toMatch(/^\d{6}$/);
    expect(stepUpCode(0)).toBe('100000');
    expect(stepUpCode(899999)).toBe('999999');
  });
});

describe('sendStepUp', () => {
  it('stores only the hash, ten minutes live, and emails the code itself', async () => {
    const s = store();
    const email = vi.fn(async () => true);
    expect(await sendStepUp({ store: s, draw: () => 23456, hash, email }, 'u1', NOW)).toEqual({ sent: true });
    expect(s.insert).toHaveBeenCalledWith({ user_id: 'u1', code_hash: 'h(123456)', expires_at: '2026-09-24T12:10:00.000Z' });
    expect(email).toHaveBeenCalledWith('123456');
  });

  it('reports a code that could not be emailed', async () => {
    expect(await sendStepUp({ store: store(), draw: () => 1, hash, email: async () => false }, 'u1', NOW)).toEqual({ sent: false });
  });

  it('refuses past the ten-minute limit, and past the daily one, sending nothing', async () => {
    const email = vi.fn(async () => true);
    const windowFull = store();
    vi.mocked(windowFull.countSince).mockImplementation(async (_u, since) =>
      since.getTime() === new Date('2026-09-24T11:50:00Z').getTime() ? STEP_UP_MAX_SENDS : 0);
    expect(await sendStepUp({ store: windowFull, draw: () => 1, hash, email }, 'u1', NOW)).toEqual({ error: GATE_MESSAGES.rateLimited, rateLimited: true });

    const dayFull = store();
    vi.mocked(dayFull.countSince).mockImplementation(async (_u, since) =>
      since.getTime() === new Date('2026-09-23T12:00:00Z').getTime() ? STEP_UP_MAX_SENDS_PER_DAY : 0);
    expect(await sendStepUp({ store: dayFull, draw: () => 1, hash, email }, 'u1', NOW)).toEqual({ error: GATE_MESSAGES.dailyLimit, rateLimited: true });

    expect(windowFull.insert).not.toHaveBeenCalled();
    expect(dayFull.insert).not.toHaveBeenCalled();
    expect(email).not.toHaveBeenCalled();
  });
});

describe('verifyStepUp', () => {
  it('confirms a correct code for this session', async () => {
    const s = store('ok');
    expect(await verifyStepUp({ store: s, hash }, 'u1', { code: ' 123456 ', sessionId: SESSION })).toEqual({ verified: true });
    expect(s.check).toHaveBeenCalledWith('u1', 'h(123456)', SESSION);
  });

  it('refuses a wrong code, a spent one, or none at all', async () => {
    expect(await verifyStepUp({ store: store('wrong'), hash }, 'u1', { code: '654321', sessionId: SESSION })).toEqual({ verified: false, error: GATE_MESSAGES.badCode });
    expect(await verifyStepUp({ store: store('spent'), hash }, 'u1', { code: '123456', sessionId: SESSION })).toEqual({ verified: false, error: GATE_MESSAGES.spentCode });
    expect(await verifyStepUp({ store: store('none'), hash }, 'u1', { code: '123456', sessionId: SESSION })).toEqual({ verified: false, error: GATE_MESSAGES.badCode });
  });

  it('counts a malformed code as a guess that can never match', async () => {
    const s = store('wrong');
    await verifyStepUp({ store: s, hash }, 'u1', { code: '12ab56', sessionId: SESSION });
    expect(s.check).toHaveBeenCalledWith('u1', 'h(invalid:12ab56)', SESSION);
  });

  it('grants nothing to a token with no session', async () => {
    const s = store('ok');
    expect(await verifyStepUp({ store: s, hash }, 'u1', { code: '123456', sessionId: '' })).toEqual({ verified: false, error: GATE_MESSAGES.noSession });
    expect(s.check).not.toHaveBeenCalled();
  });
});

describe('grantCutoff', () => {
  it('lets a confirmed code grant a registration for ten minutes', () => {
    expect(grantCutoff(NOW)).toEqual(new Date('2026-09-24T11:50:00Z'));
  });
});

describe('signInCapability', () => {
  it('marks a key the authenticator could not keep discoverable as verification-only', () => {
    expect(signInCapability({ credProps: { rk: true } })).toEqual({ can_sign_in: true, discoverable: true });
    expect(signInCapability({ credProps: { rk: false } })).toEqual({ can_sign_in: false, discoverable: false });
    expect(signInCapability({})).toEqual({ can_sign_in: true, discoverable: null });
    expect(signInCapability(undefined)).toEqual({ can_sign_in: true, discoverable: null });
    expect(signInCapability({ credProps: { rk: 'yes' } })).toEqual({ can_sign_in: true, discoverable: null });
  });
});
