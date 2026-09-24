/**
 * The login second factor on the server. What must hold: viewers and
 * accounts without roles are never asked; an owner, admin or editor is asked
 * unless this very session already passed or the device is trusted, and a
 * trusted device records the session; a correct code records the session
 * and trusts the device, a wrong one records nothing; and a token without a
 * session claim can never be recorded as having passed.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  checkSecondFactor, verifySecondFactor, secondFactorStatus, secondFactorRequired, SECOND_FACTOR_MESSAGES,
} from '../../../supabase/functions/_shared/secondFactor.ts';

const NOW = new Date('2026-09-24T15:00:00Z');
const SESSION = '0b1c2d3e-4f50-4617-8829-3a4b5c6d7e8f';
const FP = '6f1c2d3e-4a5b-4c6d-8e7f-001122334455';

function deps(o: { roles?: string[]; recorded?: boolean; trusted?: boolean; send?: unknown } = {}) {
  return {
    roles: vi.fn(async () => o.roles ?? ['editor']),
    isRecorded: vi.fn(async () => o.recorded ?? false),
    isTrustedDevice: vi.fn(async () => o.trusted ?? false),
    record: vi.fn(async () => {}),
    sendCode: vi.fn(async () => (o.send ?? { sent: true }) as never),
  };
}
const input = (over: Record<string, unknown> = {}) => ({ userId: 'u1', sessionId: SESSION, fingerprint: FP, ...over });

describe('secondFactorRequired', () => {
  it('asks owners, admins and editors, never viewers', () => {
    expect(secondFactorRequired(['owner'])).toBe(true);
    expect(secondFactorRequired(['viewer', 'admin'])).toBe(true);
    expect(secondFactorRequired(['editor'])).toBe(true);
    expect(secondFactorRequired(['viewer'])).toBe(false);
    expect(secondFactorRequired([])).toBe(false);
  });
});

describe('checkSecondFactor', () => {
  it('says so for an account with no role, and asks nothing', async () => {
    const d = deps({ roles: [] });
    expect(await checkSecondFactor(d, input(), NOW)).toEqual({ noRoles: true, requiresOtp: false });
    expect(d.sendCode).not.toHaveBeenCalled();
  });

  it('lets a viewer through without a code or a record', async () => {
    const d = deps({ roles: ['viewer'] });
    expect(await checkSecondFactor(d, input(), NOW)).toEqual({ requiresOtp: false });
    expect(d.sendCode).not.toHaveBeenCalled();
    expect(d.record).not.toHaveBeenCalled();
  });

  it('lets a session that already passed through without another code', async () => {
    const d = deps({ recorded: true });
    expect(await checkSecondFactor(d, input(), NOW)).toEqual({ requiresOtp: false });
    expect(d.isRecorded).toHaveBeenCalledWith(SESSION, 'u1');
    expect(d.sendCode).not.toHaveBeenCalled();
  });

  it('records the session as passed on a trusted device', async () => {
    const d = deps({ trusted: true });
    expect(await checkSecondFactor(d, input(), NOW)).toEqual({ requiresOtp: false });
    expect(d.isTrustedDevice).toHaveBeenCalledWith('u1', FP, NOW);
    expect(d.record).toHaveBeenCalledWith(SESSION, 'u1', 'device');
    expect(d.sendCode).not.toHaveBeenCalled();
  });

  it('sends a code otherwise, and says whether it went', async () => {
    expect(await checkSecondFactor(deps(), input(), NOW)).toEqual({ requiresOtp: true, sent: true });
    expect(await checkSecondFactor(deps({ send: { sent: false } }), input(), NOW)).toEqual({ requiresOtp: true, sent: false });
    const noDevice = deps({ trusted: true });
    expect(await checkSecondFactor(noDevice, input({ fingerprint: undefined }), NOW)).toEqual({ requiresOtp: true, sent: true });
    expect(noDevice.isTrustedDevice).not.toHaveBeenCalled();
    expect(noDevice.record).not.toHaveBeenCalled();
  });

  it('passes a rate limit through in the shape the page reads', async () => {
    expect(await checkSecondFactor(deps({ send: { error: 'كثير', rateLimited: true } }), input(), NOW)).toEqual({ error: 'كثير', rateLimited: true });
  });

  it('refuses a token with no session claim rather than trusting a device for it', async () => {
    const d = deps({ trusted: true });
    expect(await checkSecondFactor(d, input({ sessionId: '' }), NOW)).toEqual({ error: SECOND_FACTOR_MESSAGES.noSession });
    expect(d.record).not.toHaveBeenCalled();
    expect(d.sendCode).not.toHaveBeenCalled();
  });
});

describe('verifySecondFactor', () => {
  const run = (answer: unknown, over: Record<string, unknown> = {}) => {
    const d = { record: vi.fn(async () => {}), verifyCode: vi.fn(async () => answer as never), trustDevice: vi.fn(async () => {}) };
    return verifySecondFactor(d, { userId: 'u1', sessionId: SESSION, code: '123456', fingerprint: FP, ...over }, NOW).then((r) => ({ r, d }));
  };

  it('records the session and trusts the device on a correct code', async () => {
    const { r, d } = await run({ verified: true });
    expect(r).toEqual({ verified: true });
    expect(d.verifyCode).toHaveBeenCalledWith('123456', SESSION);
    expect(d.record).toHaveBeenCalledWith(SESSION, 'u1', 'code');
    expect(d.trustDevice).toHaveBeenCalledWith('u1', FP, NOW);
  });

  it('records nothing and trusts nothing on a wrong code', async () => {
    const { r, d } = await run({ verified: false, error: 'الرمز غير صحيح أو انتهت صلاحيته' });
    expect(r).toEqual({ verified: false, error: 'الرمز غير صحيح أو انتهت صلاحيته' });
    expect(d.record).not.toHaveBeenCalled();
    expect(d.trustDevice).not.toHaveBeenCalled();
  });

  it('records the session without trusting a device when none was sent', async () => {
    const { r, d } = await run({ verified: true }, { fingerprint: null });
    expect(r).toEqual({ verified: true });
    expect(d.record).toHaveBeenCalled();
    expect(d.trustDevice).not.toHaveBeenCalled();
  });

  it('checks no code for a token with no session claim', async () => {
    const { r, d } = await run({ verified: true }, { sessionId: '' });
    expect(r).toEqual({ verified: false, error: SECOND_FACTOR_MESSAGES.noSession });
    expect(d.verifyCode).not.toHaveBeenCalled();
  });
});

describe('secondFactorStatus', () => {
  it('reads required from the roles and verified from this session', async () => {
    expect(await secondFactorStatus(deps({ roles: ['viewer'] }), { userId: 'u1', sessionId: SESSION })).toEqual({ required: false, verified: true });
    expect(await secondFactorStatus(deps({ recorded: true }), { userId: 'u1', sessionId: SESSION })).toEqual({ required: true, verified: true });
    expect(await secondFactorStatus(deps({ recorded: false }), { userId: 'u1', sessionId: SESSION })).toEqual({ required: true, verified: false });
    const d = deps({ recorded: true });
    expect(await secondFactorStatus(d, { userId: 'u1', sessionId: '' })).toEqual({ required: true, verified: false });
    expect(d.isRecorded).not.toHaveBeenCalled();
  });
});
