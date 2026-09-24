/**
 * Signing in with a passkey alone. No password stands behind it, so every
 * condition is the whole door: a stale or foreign challenge, an unknown
 * credential, a handle naming someone else, a bad signature, a bare tap
 * without verifying the person, a key registered before the gate, or an
 * account without a role must each end with no session minted and no device
 * trusted. Localhost is no door, and a migration not yet applied reads as
 * "not available yet", never as a server error.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  beginPasskeyLogin, completePasskeyLogin, clientAddress, userHandleIs, loginRelyingPartyFor, isMissingSchema, LOGIN_MESSAGES,
  MAX_LOGIN_CHALLENGES_PER_CLIENT, type CompleteDeps, type LoginChallengeStore,
} from '../../../supabase/functions/_shared/passkeyLogin.ts';
import { bytesToBase64url, type PasskeyRow } from '../../../supabase/functions/_shared/passkeys.ts';

const NOW = new Date('2026-09-24T10:00:00Z');
const USER = '44444444-4444-4444-8444-444444444444';
const handleOf = (id: string) => bytesToBase64url(new TextEncoder().encode(id));
const headers = (h: Record<string, string>) => ({ get: (k: string) => h[k.toLowerCase()] ?? null });

const passkey: PasskeyRow = {
  id: 'pk-1', user_id: USER, credential_id: 'cred-1', public_key: 'key', counter: 3,
  transports: ['internal'], device_type: 'multiDevice', backed_up: true, name: 'هاتفي',
  created_at: '2026-09-20T00:00:00Z', last_used_at: null, can_sign_in: true,
};
const missingTable = Object.assign(new Error('relation does not exist'), { code: 'PGRST205' });

function store(held: { challenge: string; expires_at: string } | null = { challenge: 'ch', expires_at: '2026-09-24T10:04:00Z' }): LoginChallengeStore {
  return {
    purgeBefore: vi.fn(async () => {}),
    countSince: vi.fn(async () => 0),
    insert: vi.fn(async () => 'challenge-1'),
    take: vi.fn(async () => held),
    forget: vi.fn(async () => {}),
  };
}

function deps(overrides: Partial<CompleteDeps> = {}): CompleteDeps {
  return {
    store: store(),
    findPasskey: vi.fn(async (id: string) => (id === 'cred-1' ? passkey : null)),
    verify: vi.fn(async () => ({ verified: true, userVerified: true, newCounter: 4 })),
    touchPasskey: vi.fn(async () => {}),
    hasRoles: vi.fn(async () => true),
    emailOf: vi.fn(async () => 'pm@example.com'),
    mintTokenHash: vi.fn(async () => 'token-hash-1'),
    trustDevice: vi.fn(async () => {}),
    ...overrides,
  };
}

const answer = (userHandle: unknown = handleOf(USER), id: unknown = 'cred-1') =>
  ({ id, response: { userHandle, signature: 'sig' } });
const input = (over: Record<string, unknown> = {}) =>
  ({ challengeId: 'challenge-1', response: answer(), fingerprint: 'fp-1', ...over });

describe('clientAddress', () => {
  it('takes the first forwarded address, then the real ip, then says unknown', () => {
    expect(clientAddress(headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7');
    expect(clientAddress(headers({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2');
    expect(clientAddress(headers({}))).toBe('unknown');
  });
});

describe('userHandleIs', () => {
  it('accepts the handle made from this user id and nothing else', () => {
    expect(userHandleIs(handleOf(USER), USER)).toBe(true);
    expect(userHandleIs(handleOf('someone-else'), USER)).toBe(false);
    expect(userHandleIs(undefined, USER)).toBe(false);
    expect(userHandleIs('', USER)).toBe(false);
    expect(userHandleIs('%%%', USER)).toBe(false);
  });
});

describe('loginRelyingPartyFor', () => {
  it('signs in from our sites and previews, never from localhost', () => {
    expect(loginRelyingPartyFor('https://sight.basserh.com')).toEqual({ rpID: 'sight.basserh.com', origin: 'https://sight.basserh.com' });
    expect(loginRelyingPartyFor('https://preview-abc.lovable.app')?.rpID).toBe('preview-abc.lovable.app');
    expect(loginRelyingPartyFor('http://localhost:4173')).toBeNull();
    expect(loginRelyingPartyFor('http://localhost:5173')).toBeNull();
    expect(loginRelyingPartyFor('https://evil.example.com')).toBeNull();
    expect(loginRelyingPartyFor(null)).toBeNull();
  });
});

describe('isMissingSchema', () => {
  it('knows the codes for a table or column that is not there yet, and nothing else', () => {
    for (const code of ['PGRST205', '42P01', '42703', 'PGRST204']) expect(isMissingSchema({ code })).toBe(true);
    expect(isMissingSchema({ code: '23505' })).toBe(false);
    expect(isMissingSchema(new Error('boom'))).toBe(false);
    expect(isMissingSchema(null)).toBe(false);
  });
});

describe('beginPasskeyLogin', () => {
  it('stores the challenge for this address, live five minutes, and hands back its id with the options', async () => {
    const s = store();
    const result = await beginPasskeyLogin({ store: s, generateOptions: async () => ({ challenge: 'c-1' }) }, '203.0.113.7', NOW);
    expect(result).toEqual({ options: { challenge: 'c-1' }, challengeId: 'challenge-1' });
    // Only rows older than the rate window go, so used ones keep counting.
    expect(s.purgeBefore).toHaveBeenCalledWith(new Date('2026-09-24T09:50:00Z'));
    expect(s.insert).toHaveBeenCalledWith({ challenge: 'c-1', client: '203.0.113.7', expires_at: '2026-09-24T10:05:00.000Z' });
  });

  it('refuses an address past its limit in the window, and stores nothing', async () => {
    const s = store();
    vi.mocked(s.countSince).mockResolvedValue(MAX_LOGIN_CHALLENGES_PER_CLIENT);
    const generateOptions = vi.fn(async () => ({ challenge: 'c-1' }));
    const result = await beginPasskeyLogin({ store: s, generateOptions }, 'a', NOW);
    expect(result).toEqual({ error: LOGIN_MESSAGES.rateLimited, rateLimited: true });
    expect(s.countSince).toHaveBeenCalledWith('a', new Date('2026-09-24T09:50:00Z'));
    expect(generateOptions).not.toHaveBeenCalled();
    expect(s.insert).not.toHaveBeenCalled();
  });

  it('says "not available yet" while the table is missing, and still fails loudly on anything else', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = store();
    vi.mocked(s.countSince).mockRejectedValueOnce(missingTable);
    expect(await beginPasskeyLogin({ store: s, generateOptions: async () => ({ challenge: 'c' }) }, 'a', NOW))
      .toEqual({ error: LOGIN_MESSAGES.unavailable });
    vi.mocked(s.countSince).mockRejectedValueOnce(new Error('connection reset'));
    await expect(beginPasskeyLogin({ store: s, generateOptions: async () => ({ challenge: 'c' }) }, 'a', NOW)).rejects.toThrow('connection reset');
    // Plain to the person, loud in the function log.
    expect(log).toHaveBeenCalledWith('[passkeys] schema not applied yet', missingTable);
    log.mockRestore();
  });
});

describe('completePasskeyLogin', () => {
  it('mints the session token, moves the counter and trusts the device when every condition holds', async () => {
    const d = deps();
    expect(await completePasskeyLogin(d, input(), NOW)).toEqual({ verified: true, tokenHash: 'token-hash-1' });
    expect(d.store.take).toHaveBeenCalledWith('challenge-1');
    expect(d.verify).toHaveBeenCalledWith({ response: answer(), expectedChallenge: 'ch', passkey });
    expect(d.touchPasskey).toHaveBeenCalledWith('pk-1', 4, NOW);
    expect(d.mintTokenHash).toHaveBeenCalledWith('pm@example.com');
    expect(d.trustDevice).toHaveBeenCalledWith(USER, 'fp-1', NOW);
  });

  const refusals: [string, () => { d: CompleteDeps; i: ReturnType<typeof input> }, string][] = [
    ['no challenge id', () => ({ d: deps(), i: input({ challengeId: undefined }) }), LOGIN_MESSAGES.expired],
    ['a challenge that is not ours or already used', () => ({ d: deps({ store: store(null) }), i: input() }), LOGIN_MESSAGES.expired],
    ['an expired challenge', () => ({ d: deps({ store: store({ challenge: 'ch', expires_at: '2026-09-24T09:59:59Z' }) }), i: input() }), LOGIN_MESSAGES.expired],
    ['an unregistered credential', () => ({ d: deps(), i: input({ response: answer(handleOf(USER), 'cred-9') }) }), LOGIN_MESSAGES.unknownCredential],
    ['a key registered before the sign-in gate', () => ({ d: deps({ findPasskey: vi.fn(async () => ({ ...passkey, can_sign_in: false })) }), i: input() }), LOGIN_MESSAGES.secondFactorOnly],
    ['a handle naming another account', () => ({ d: deps(), i: input({ response: answer(handleOf('someone-else')) }) }), LOGIN_MESSAGES.refused],
    ['no handle at all', () => ({ d: deps(), i: input({ response: { id: 'cred-1', response: { signature: 'sig' } } }) }), LOGIN_MESSAGES.refused],
    ['a signature that does not verify', () => ({ d: deps({ verify: vi.fn(async () => ({ verified: false, userVerified: true, newCounter: 0 })) }), i: input() }), LOGIN_MESSAGES.refused],
    ['a tap without verifying the person', () => ({ d: deps({ verify: vi.fn(async () => ({ verified: true, userVerified: false, newCounter: 4 })) }), i: input() }), LOGIN_MESSAGES.notVerified],
    ['an account without a role', () => ({ d: deps({ hasRoles: vi.fn(async () => false) }), i: input() }), LOGIN_MESSAGES.noRoles],
    ['an account with no email', () => ({ d: deps({ emailOf: vi.fn(async () => null) }), i: input() }), LOGIN_MESSAGES.noSession],
    ['a token the platform would not mint', () => ({ d: deps({ mintTokenHash: vi.fn(async () => null) }), i: input() }), LOGIN_MESSAGES.noSession],
  ];

  it.each(refusals)('refuses %s: no token minted, no device trusted', async (_name, setup, message) => {
    const { d, i } = setup();
    const result = await completePasskeyLogin(d, i, NOW);
    expect(result).toMatchObject({ verified: false, error: message });
    expect(result).not.toHaveProperty('tokenHash');
    expect(d.trustDevice).not.toHaveBeenCalled();
    if (message !== LOGIN_MESSAGES.noSession) expect(d.mintTokenHash).not.toHaveBeenCalled();
  });

  it('says "not available yet" while the table is missing', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const d = deps();
    vi.mocked(d.store.take).mockRejectedValueOnce(Object.assign(new Error('x'), { code: '42P01' }));
    expect(await completePasskeyLogin(d, input(), NOW)).toEqual({ error: LOGIN_MESSAGES.unavailable });
    expect(d.mintTokenHash).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  it('while the column is not there yet, says "not available yet" rather than blaming the key', async () => {
    const d = deps({ findPasskey: vi.fn(async () => ({ ...passkey, can_sign_in: undefined })) });
    expect(await completePasskeyLogin(d, input(), NOW)).toEqual({ error: LOGIN_MESSAGES.unavailable });
    expect(d.mintTokenHash).not.toHaveBeenCalled();
  });

  it('forgets a challenge that ended in a session, and keeps a refused one counted', async () => {
    const ok = deps();
    await completePasskeyLogin(ok, input(), NOW);
    expect(ok.store.forget).toHaveBeenCalledWith('challenge-1');
    const refused = deps({ hasRoles: vi.fn(async () => false) });
    await completePasskeyLogin(refused, input(), NOW);
    expect(refused.store.forget).not.toHaveBeenCalled();
  });

  it('consumes the challenge even when refusing, so an answer is never replayed', async () => {
    const d = deps({ hasRoles: vi.fn(async () => false) });
    await completePasskeyLogin(d, input(), NOW);
    expect(d.store.take).toHaveBeenCalledTimes(1);
  });

  it('never verifies against a key that is not the credential presented', async () => {
    const d = deps();
    await completePasskeyLogin(d, input({ response: answer(handleOf('someone-else')) }), NOW);
    expect(d.verify).not.toHaveBeenCalled();
  });

  it('opens the session without trusting a device when no fingerprint came', async () => {
    const d = deps();
    expect(await completePasskeyLogin(d, input({ fingerprint: undefined }), NOW)).toEqual({ verified: true, tokenHash: 'token-hash-1' });
    expect(d.trustDevice).not.toHaveBeenCalled();
  });
});
