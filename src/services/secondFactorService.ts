/**
 * The login second factor from the browser's side. The `second-factor`
 * function decides whether this session needs a code, sends it, checks it,
 * and records the session as passed so the database lets it through.
 *
 * There is no fallback. admin-otp once answered while second-factor was
 * not yet deployed, but it records nothing, and with the database enforcing
 * the second factor (5 November 2026) a session let through by it could
 * read nothing. An unreachable second-factor is a failure, and the page
 * signs out and says so.
 */
import { supabase } from '@/integrations/supabase/client';
import type { OtpCheckResponse } from '@/pages/login/otpCheck';

type Invoke = { data?: Record<string, unknown> | null; error?: unknown };

function callSecondFactor(body: Record<string, unknown>): Promise<Invoke> {
  return supabase.functions.invoke('second-factor', { body }) as Promise<Invoke>;
}

/**
 * Whether this device must be asked for a code; sends one when so, unless a
 * code sent earlier is still live. `resend` sends a fresh one regardless.
 */
export function checkSecondFactor(fingerprint: string, resend = false): Promise<OtpCheckResponse> {
  return callSecondFactor(resend ? { action: 'check', fingerprint, resend: true } : { action: 'check', fingerprint }) as Promise<OtpCheckResponse>;
}

/** Checks the code; a correct one records this session and trusts the device. */
export async function verifySecondFactor(code: string, fingerprint: string): Promise<{ verified: boolean; error?: string; rateLimited?: boolean }> {
  const res = await callSecondFactor({ action: 'verify', code, fingerprint });
  const d = (res.data ?? {}) as { verified?: boolean; error?: string; rateLimited?: boolean };
  if (res.error && !d.error) return { verified: false, error: 'الرمز غير صحيح' };
  return { verified: d.verified === true, error: d.error, rateLimited: d.rateLimited };
}

/**
 * Where this session stands. null when it cannot be told (the function is
 * not deployed, or the network failed): the page then lets the person
 * through, because the database is what enforces, not the page.
 */
export async function secondFactorStatus(): Promise<{ required: boolean; verified: boolean } | null> {
  try {
    const res = (await supabase.functions.invoke('second-factor', { body: { action: 'status' } })) as Invoke;
    const d = res.data as { required?: unknown; verified?: unknown } | null | undefined;
    if (res.error || typeof d?.required !== 'boolean' || typeof d?.verified !== 'boolean') return null;
    return { required: d.required, verified: d.verified };
  } catch {
    return null;
  }
}
