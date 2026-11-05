/**
 * The browser half of the second factor. What must hold: only second-factor
 * is ever asked, and an unreachable one is reported as the failure it is,
 * never answered by admin-otp, which records no session; a resend is asked
 * for explicitly; and a status that cannot be read is null, never a pass or
 * a fail.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));

import { checkSecondFactor, verifySecondFactor, secondFactorStatus } from '../secondFactorService';

const fetchError = () => Object.assign(new Error('Failed to send a request to the Edge Function'), { name: 'FunctionsFetchError', context: new TypeError('Failed to fetch') });
const httpError = (status: number) => Object.assign(new Error('Edge Function returned a non-2xx status code'), { name: 'FunctionsHttpError', context: new Response('{}', { status }) });

describe('secondFactorService', () => {
  beforeEach(() => invoke.mockReset());

  it('asks second-factor only, and hands back its failure, unreachable or refused', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: fetchError() });
    expect((await checkSecondFactor('fp-1')).error).toBeTruthy();
    invoke.mockResolvedValueOnce({ data: null, error: httpError(404) });
    expect((await checkSecondFactor('fp-1')).error).toBeTruthy();
    invoke.mockResolvedValueOnce({ data: null, error: httpError(500) });
    expect((await checkSecondFactor('fp-1')).error).toBeTruthy();
    expect(invoke.mock.calls.map((c) => c[0])).toEqual(['second-factor', 'second-factor', 'second-factor']);
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
