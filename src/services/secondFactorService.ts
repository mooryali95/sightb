/**
 * The login second factor from the browser's side. The `second-factor`
 * function decides whether this session needs a code, sends it, checks it,
 * and records the session as passed so the database lets it through.
 *
 * Until that function is deployed (Lovable deploys a function arriving
 * through git when it next builds, which can trail the published page), the
 * page falls back to admin-otp, which answers in the same shape. The fallback
 * records nothing, which is harmless while enforcement is off, and is to be
 * removed once second-factor has been seen answering.
 */
import { supabase } from '@/integrations/supabase/client';
import type { OtpCheckResponse } from '@/pages/login/otpCheck';

type Invoke = { data?: Record<string, unknown> | null; error?: unknown };

/** Whether an answer means the function is not there (yet), not that it refused. */
export function functionMissing(res: Invoke): boolean {
  if (res.data && (res.data as { unavailable?: unknown }).unavailable === true) return true;
  const err = res.error as { name?: string; context?: { status?: number } } | null | undefined;
  return err?.name === 'FunctionsHttpError' && err.context?.status === 404;
}

async function secondFactorOr(body: Record<string, unknown>): Promise<Invoke> {
  const res = (await supabase.functions.invoke('second-factor', { body })) as Invoke;
  if (!functionMissing(res)) return res;
  return (await supabase.functions.invoke('admin-otp', { body })) as Invoke;
}

/** Whether this device must be asked for a code; sends it when so. */
export function checkSecondFactor(fingerprint: string): Promise<OtpCheckResponse> {
  return secondFactorOr({ action: 'check', fingerprint }) as Promise<OtpCheckResponse>;
}

/** Checks the code; a correct one records this session and trusts the device. */
export async function verifySecondFactor(code: string, fingerprint: string): Promise<{ verified: boolean; error?: string; rateLimited?: boolean }> {
  const res = await secondFactorOr({ action: 'verify', code, fingerprint });
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
