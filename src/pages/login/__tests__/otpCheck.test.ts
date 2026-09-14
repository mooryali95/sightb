import { describe, expect, it, vi } from 'vitest';
import { readOtpCheck } from '../otpCheck';
import { getDeviceFingerprint } from '../deviceFingerprint';

describe('readOtpCheck', () => {
  it('reads a transport error before anything the body says', () => {
    expect(readOtpCheck({ error: new Error('down'), data: { requiresOtp: true, sent: true } })).toEqual({ kind: 'error' });
  });

  it('reads a rate limit with the server message or the default one', () => {
    expect(readOtpCheck({ data: { rateLimited: true, error: 'كثير' } })).toEqual({ kind: 'rate-limited', message: 'كثير' });
    expect(readOtpCheck({ data: { rateLimited: true } })).toEqual({ kind: 'rate-limited', message: 'تم تجاوز الحد الأقصى للمحاولات' });
  });

  it('reads no roles, a code sent or not, and the plain way in', () => {
    expect(readOtpCheck({ data: { noRoles: true, requiresOtp: true } })).toEqual({ kind: 'no-roles' });
    expect(readOtpCheck({ data: { requiresOtp: true, sent: true } })).toEqual({ kind: 'otp-sent' });
    expect(readOtpCheck({ data: { requiresOtp: true } })).toEqual({ kind: 'otp-failed' });
    expect(readOtpCheck({ data: { requiresOtp: false } })).toEqual({ kind: 'ok' });
    expect(readOtpCheck({ data: null })).toEqual({ kind: 'ok' });
    expect(readOtpCheck({})).toEqual({ kind: 'ok' });
  });
});

describe('getDeviceFingerprint', () => {
  it('mints one id and keeps returning it', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
    } as unknown as Storage;
    const spy = vi.spyOn(crypto, 'randomUUID');
    const first = getDeviceFingerprint(storage);
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(getDeviceFingerprint(storage)).toBe(first);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(store.get('rouya_device_fp')).toBe(first);
    spy.mockRestore();
  });
});
