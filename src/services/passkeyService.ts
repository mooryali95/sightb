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
  /**
   * Whether it signs in on its own, or only stands in for the emailed code;
   * null while the server cannot say yet.
   */
  canSignIn: boolean | null;
  /** Whether the authenticator kept a discoverable credential; null when it did not say. */
  discoverable: boolean | null;
}

/** Whether this browser can run a passkey ceremony at all. */
export function passkeysSupported(): boolean {
  try { return browserSupportsWebAuthn(); } catch { return false; }
}

const UNREACHABLE = 'تعذّر الوصول إلى خدمة مفاتيح المرور';
const OFFLINE = 'تعذّر الاتصال. تحقّق من الشبكة وحاول مرة أخرى.';

/**
 * The reason a failed call gives. A refusal the function answered with a
 * non-2xx status reaches here as the client library's English "non-2xx
 * status code"; the function's own Arabic reason is in the response it
 * carries, so it is read from there. A request that never arrived has no
 * reason to read, and is said to be the network.
 */
async function reasonOf(error: unknown): Promise<string> {
  const name = (error as { name?: unknown } | null)?.name;
  if (name === 'FunctionsFetchError' || name === 'FunctionsRelayError') return OFFLINE;
  const context = (error as { context?: { json?: () => Promise<unknown> } } | null)?.context;
  if (typeof context?.json === 'function') {
    try {
      const reason = ((await context.json()) as { error?: unknown } | null)?.error;
      if (typeof reason === 'string' && reason) return reason;
    } catch { /* no JSON body */ }
    return UNREACHABLE;
  }
  return error instanceof Error && error.message ? error.message : UNREACHABLE;
}

async function call<T extends object>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.invoke<T & { error?: string; needsStepUp?: boolean }>('passkeys', body);
  if (data?.needsStepUp) throw new StepUpRequired();
  if (data?.error) throw new Error(data.error);
  if (error) throw new Error(await reasonOf(error));
  return (data ?? {}) as T;
}

export async function listPasskeys(): Promise<PasskeySummary[]> {
  const { passkeys } = await call<{ passkeys?: PasskeySummary[] }>({ action: 'list' });
  return passkeys ?? [];
}

/**
 * Adding a passkey needs a code emailed to the account and confirmed by this
 * session, since a passkey signs in on its own. Without one the server
 * answers with this instead of a ceremony; the page then has a code sent.
 */
export class StepUpRequired extends Error {
  constructor() {
    super('أكّد أنه أنت برمز يصلك بالبريد قبل إضافة مفتاح مرور.');
    this.name = 'StepUpRequired';
  }
}

/** Registers a new passkey for the signed-in user under the given name. */
export async function registerPasskey(name: string): Promise<PasskeySummary> {
  const opts = await call<{ options?: PublicKeyCredentialCreationOptionsJSON; needsStepUp?: boolean }>({ action: 'register-options' });
  if (opts.needsStepUp || !opts.options) throw new StepUpRequired();
  const response = await startRegistration({ optionsJSON: opts.options });
  const { passkey } = await call<{ passkey: PasskeySummary }>({ action: 'register-verify', response, name });
  return passkey;
}

/** Emails a confirmation code to the account's own address. */
export async function sendStepUpCode(): Promise<void> {
  const { sent } = await call<{ sent?: boolean }>({ action: 'step-up-send' });
  if (!sent) throw new Error('تعذّر إرسال الرمز. حاول بعد قليل.');
}

/** Confirms the emailed code, which lets this session register one passkey in the next ten minutes. */
export async function confirmStepUp(code: string): Promise<void> {
  const { verified } = await call<{ verified?: boolean }>({ action: 'step-up-verify', code });
  if (!verified) throw new Error('الرمز غير صحيح أو انتهت صلاحيته');
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

/**
 * Signs in with a passkey alone: no email, no password, no code. The
 * browser offers the passkeys it holds for this site; the one chosen signs
 * the server's challenge once the person is verified on the device, and the
 * server answers with a one-time token the session is opened with. The
 * device is then trusted as a correct code would trust it.
 */
export async function signInWithPasskey(fingerprint: string): Promise<void> {
  const { options, challengeId } = await call<{ options?: PublicKeyCredentialRequestOptionsJSON; challengeId?: string }>({ action: 'login-options' });
  if (!options || !challengeId) throw new Error('تعذّر بدء الدخول بمفتاح المرور');
  const response = await startAuthentication({ optionsJSON: options });
  const { tokenHash } = await call<{ tokenHash?: string }>({ action: 'login-verify', challengeId, response, fingerprint });
  if (!tokenHash) throw new Error('تعذّر الدخول بمفتاح المرور');
  try {
    await db.openSession(tokenHash);
  } catch (e) {
    console.error('[passkey-session]', e);
    throw new Error('تعذّر فتح الجلسة، حاول مرة أخرى');
  }
}

export async function deletePasskey(id: string): Promise<void> {
  await call<{ deleted?: boolean }>({ action: 'delete', id });
}

/**
 * The message for a failed ceremony: the browser's refusals have names,
 * everything else has a fallback. Signing in, a refusal is as often a device
 * holding no passkey for this site as a cancelled prompt, so it says what to
 * do in either case.
 */
export function passkeyErrorMessage(e: unknown, during: 'sign-in' | 'other' = 'other'): string {
  const name = (e as { name?: string } | null)?.name;
  if (name === 'NotAllowedError' && during === 'sign-in') {
    return 'لم يُستخدم مفتاح مرور. إن لم تسجّل مفتاحاً على هذا الجهاز بعد، ادخل بكلمة المرور ثم أضفه من صفحة الأمان.';
  }
  if (name === 'NotAllowedError') return 'أُلغي التحقق أو انتهت مهلته. حاول مرة أخرى.';
  if (name === 'InvalidStateError') return 'هذا الجهاز مسجّل بالفعل لهذا الحساب.';
  if (name === 'NotSupportedError' || name === 'SecurityError') return 'هذا المتصفح أو الموقع لا يدعم مفاتيح المرور.';
  return errorMessage(e, 'تعذّر استخدام مفتاح المرور');
}
