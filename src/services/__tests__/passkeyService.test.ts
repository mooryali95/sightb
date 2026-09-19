/**
 * The browser half of the passkey ceremony: it asks the edge function for
 * options, hands them to the authenticator, and posts the answer back with
 * the device fingerprint. What must hold: a function error or an `error`
 * field stops the ceremony; an account with no passkeys is reported rather
 * than attempted; and the browser's refusals become readable messages.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const m = vi.hoisted(() => ({
  invoke: vi.fn(),
  supports: vi.fn(() => true),
  startRegistration: vi.fn(),
  startAuthentication: vi.fn(),
}));
vi.mock('../db', () => ({ db: { invoke: m.invoke } }));
vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: m.supports,
  startRegistration: m.startRegistration,
  startAuthentication: m.startAuthentication,
}));

import { listPasskeys, registerPasskey, verifyWithPasskey, deletePasskey, passkeysSupported, passkeyErrorMessage } from '../passkeyService';

const answer = (data: unknown) => m.invoke.mockResolvedValueOnce({ data, error: null });

describe('passkeyService', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('reports support from the browser, and false when the check itself throws', () => {
    expect(passkeysSupported()).toBe(true);
    m.supports.mockImplementationOnce(() => { throw new Error('no window'); });
    expect(passkeysSupported()).toBe(false);
  });

  it('lists what the function returns, and nothing when it returns nothing', async () => {
    answer({ passkeys: [{ id: 'a', name: 'هاتفي' }] });
    expect(await listPasskeys()).toEqual([{ id: 'a', name: 'هاتفي' }]);
    expect(m.invoke).toHaveBeenCalledWith('passkeys', { action: 'list' });
    answer({});
    expect(await listPasskeys()).toEqual([]);
  });

  it('registers: options in, attestation out, name attached', async () => {
    answer({ options: { challenge: 'c1' } });
    m.startRegistration.mockResolvedValue({ id: 'cred-1', response: {} });
    answer({ passkey: { id: 'pk-1', name: 'هاتفي' } });
    expect(await registerPasskey('هاتفي')).toEqual({ id: 'pk-1', name: 'هاتفي' });
    expect(m.startRegistration).toHaveBeenCalledWith({ optionsJSON: { challenge: 'c1' } });
    expect(m.invoke).toHaveBeenLastCalledWith('passkeys', { action: 'register-verify', response: { id: 'cred-1', response: {} }, name: 'هاتفي' });
  });

  it('verifies with the fingerprint, and never opens the ceremony for an account with no passkeys', async () => {
    answer({ noPasskeys: true });
    expect(await verifyWithPasskey('fp-1')).toBe('no-passkeys');
    expect(m.startAuthentication).not.toHaveBeenCalled();

    answer({ options: { challenge: 'c2' } });
    m.startAuthentication.mockResolvedValue({ id: 'cred-1', response: { signature: 'sig' } });
    answer({ verified: true });
    expect(await verifyWithPasskey('fp-1')).toBe('verified');
    expect(m.startAuthentication).toHaveBeenCalledWith({ optionsJSON: { challenge: 'c2' } });
    expect(m.invoke).toHaveBeenLastCalledWith('passkeys', { action: 'auth-verify', response: { id: 'cred-1', response: { signature: 'sig' } }, fingerprint: 'fp-1' });
  });

  it('stops on a refused verification, a function error, or an error field', async () => {
    answer({ options: { challenge: 'c3' } });
    m.startAuthentication.mockResolvedValue({ id: 'x' });
    answer({ verified: false });
    await expect(verifyWithPasskey('fp')).rejects.toThrow('تعذّر التحقق من مفتاح المرور');

    m.invoke.mockResolvedValueOnce({ data: null, error: new Error('boom') });
    await expect(listPasskeys()).rejects.toThrow('boom');

    answer({ error: 'انتهت مهلة التحقق، حاول مرة أخرى' });
    await expect(deletePasskey('pk-1')).rejects.toThrow('انتهت مهلة التحقق، حاول مرة أخرى');
  });

  it('deletes by id', async () => {
    answer({ deleted: true });
    await deletePasskey('pk-9');
    expect(m.invoke).toHaveBeenCalledWith('passkeys', { action: 'delete', id: 'pk-9' });
  });

  it('names the browser refusals and falls back for the rest', () => {
    expect(passkeyErrorMessage({ name: 'NotAllowedError' })).toBe('أُلغي التحقق أو انتهت مهلته. حاول مرة أخرى.');
    expect(passkeyErrorMessage({ name: 'InvalidStateError' })).toBe('هذا الجهاز مسجّل بالفعل لهذا الحساب.');
    expect(passkeyErrorMessage({ name: 'SecurityError' })).toBe('هذا المتصفح أو الموقع لا يدعم مفاتيح المرور.');
    expect(passkeyErrorMessage(new Error('خطأ من الخادم'))).toBe('خطأ من الخادم');
    expect(passkeyErrorMessage(undefined)).toBe('تعذّر استخدام مفتاح المرور');
  });
});
