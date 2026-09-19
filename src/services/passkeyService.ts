/**
 * Passkeys (WebAuthn) from the browser's side. The ceremony is two halves:
 * the `passkeys` edge function mints the options and verifies the answer;
 * this module runs the browser half in between and turns the library's
 * DOMExceptions into messages a person can act on.
 */
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { db } from './db';
import { errorMessage } from '@/lib/utils';

export interface PasskeySummary {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  deviceType: string | null;
  backedUp: boolean;
  transports: string[];
}

/** Whether this browser can run a passkey ceremony at all. */
export function passkeysSupported(): boolean {
  try { return browserSupportsWebAuthn(); } catch { return false; }
}

async function call<T extends object>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.invoke<T & { error?: string }>('passkeys', body);
  if (data?.error) throw new Error(data.error);
  if (error) throw error instanceof Error ? error : new Error('تعذّر الوصول إلى خدمة مفاتيح المرور');
  return (data ?? {}) as T;
}

export async function listPasskeys(): Promise<PasskeySummary[]> {
  const { passkeys } = await call<{ passkeys?: PasskeySummary[] }>({ action: 'list' });
  return passkeys ?? [];
}

/** Registers a new passkey for the signed-in user under the given name. */
export async function registerPasskey(name: string): Promise<PasskeySummary> {
  const { options } = await call<{ options: PublicKeyCredentialCreationOptionsJSON }>({ action: 'register-options' });
  const response = await startRegistration({ optionsJSON: options });
  const { passkey } = await call<{ passkey: PasskeySummary }>({ action: 'register-verify', response, name });
  return passkey;
}

/**
 * Proves the second factor with a passkey. Resolves to 'no-passkeys' when
 * the account has none registered, so the page can say so instead of
 * opening a ceremony that cannot succeed.
 */
export async function verifyWithPasskey(fingerprint: string): Promise<'verified' | 'no-passkeys'> {
  const opts = await call<{ options?: PublicKeyCredentialRequestOptionsJSON; noPasskeys?: boolean }>({ action: 'auth-options' });
  if (opts.noPasskeys || !opts.options) return 'no-passkeys';
  const response = await startAuthentication({ optionsJSON: opts.options });
  const { verified } = await call<{ verified?: boolean }>({ action: 'auth-verify', response, fingerprint });
  if (!verified) throw new Error('تعذّر التحقق من مفتاح المرور');
  return 'verified';
}

export async function deletePasskey(id: string): Promise<void> {
  await call<{ deleted?: boolean }>({ action: 'delete', id });
}

/** The message for a failed ceremony: the browser's refusals have names, everything else has a fallback. */
export function passkeyErrorMessage(e: unknown): string {
  const name = (e as { name?: string } | null)?.name;
  if (name === 'NotAllowedError') return 'أُلغي التحقق أو انتهت مهلته. حاول مرة أخرى.';
  if (name === 'InvalidStateError') return 'هذا الجهاز مسجّل بالفعل لهذا الحساب.';
  if (name === 'NotSupportedError' || name === 'SecurityError') return 'هذا المتصفح أو الموقع لا يدعم مفاتيح المرور.';
  return errorMessage(e, 'تعذّر استخدام مفتاح المرور');
}
