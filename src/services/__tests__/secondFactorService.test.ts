/**
 * The browser half of the second factor. What must hold: while second-factor
 * is not deployed the page falls back to admin-otp, whether the browser saw
 * the failed preflight (a fetch error) or a 404; a refusal from a deployed
 * second-factor never falls back; a resend is asked for explicitly; and a
 * status that cannot be read is null, never a pass or a fail.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));

import { functionMissing, checkSecondFactor, verifySecondFactor, secondFactorStatus } from '../secondFactorService';

const fetchError = () => Object.assign(new Error('Failed to send a request to the Edge Function'), { name: 'FunctionsFetchError', context: new TypeError('Failed to fetch') });
const httpError = (status: number) => Object.assign(new Error('Edge Function returned a non-2xx status code'), { name: 'FunctionsHttpError', context: new Response('{}', { status }) });

describe('secondFactorService', () => {
  beforeEach(() => invoke.mockReset());

  it('counts as missing: a failed preflight, a relay error, a 404, or the function saying it is not ready', () => {
    expect(functionMissing({ error: fetchError() })).toBe(true);
    expect(functionMissing({ error: Object.assign(new Error('relay'), { name: 'FunctionsRelayError' }) })).toBe(true);
    expect(functionMissing({ error: httpError(404) })).toBe(true);
    expect(functionMissing({ data: { unavailable: true } })).toBe(true);
    expect(functionMissing({ error: httpError(500) })).toBe(false);
    expect(functionMissing({ data: { requiresOtp: true } })).toBe(false);
  });

  it('falls back to admin-otp only when second-factor is missing', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: fetchError() }).mockResolvedValueOnce({ data: { requiresOtp: true, sent: true }, error: null });
    expect((await checkSecondFactor('fp-1')).data).toEqual({ requiresOtp: true, sent: true });
    expect(invoke.mock.calls.map((c) => c[0])).toEqual(['second-factor', 'admin-otp']);

    invoke.mockReset();
    invoke.mockResolvedValueOnce({ data: null, error: httpError(500) });
    expect((await checkSecondFactor('fp-1')).error).toBeTruthy();
    expect(invoke.mock.calls.map((c) => c[0])).toEqual(['second-factor']);
  });

  it('asks for a fresh code only on resend', async () => {
    invoke.mockResolvedValue({ data: { requiresOtp: true, sent: true }, error: null });
    await checkSecondFactor('fp-1');
    expect(invoke).toHaveBeenLastCalledWith('second-factor', { body: { action: 'check', fingerprint: 'fp-1' } });
    await checkSecondFactor('fp-1', true);
    expect(invoke).toHaveBeenLastCalledWith('second-factor', { body: { action: 'check', fingerprint: 'fp-1', resend: true } });
  });

  it('reads a verification, a refusal and a rate limit', async () => {
    invoke.mockResolvedValueOnce({ data: { verified: true }, error: null });
    expect(await verifySecondFactor('123456', 'fp')).toEqual({ verified: true, error: undefined, rateLimited: undefined });
    invoke.mockResolvedValueOnce({ data: { verified: false, error: 'الرمز غير صحيح' }, error: null });
    expect(await verifySecondFactor('000000', 'fp')).toMatchObject({ verified: false, error: 'الرمز غير صحيح' });
    invoke.mockResolvedValueOnce({ data: { verified: false, error: 'كثير', rateLimited: true }, error: null });
    expect(await verifySecondFactor('000000', 'fp')).toMatchObject({ verified: false, rateLimited: true });
  });

  it('reads the status, and says null when it cannot', async () => {
    invoke.mockResolvedValueOnce({ data: { required: true, verified: false }, error: null });
    expect(await secondFactorStatus()).toEqual({ required: true, verified: false });
    invoke.mockResolvedValueOnce({ data: null, error: fetchError() });
    expect(await secondFactorStatus()).toBeNull();
    invoke.mockResolvedValueOnce({ data: {}, error: null });
    expect(await secondFactorStatus()).toBeNull();
    invoke.mockRejectedValueOnce(new Error('offline'));
    expect(await secondFactorStatus()).toBeNull();
  });
});
