/**
 * The login second factor, decided on the server and recorded per session.
 *
 * The page used to ask admin-otp whether a code was needed after the
 * password had already opened a full session; nothing on the server knew
 * whether the code was ever given. Now a session that passes is recorded in
 * session_second_factor, and row-level security (second_factor_ok) refuses
 * data to one that has not, once the owner switches enforcement on.
 *
 * Owners, admins and editors need a second factor; viewers do not. It is
 * passed by an emailed code (sent to the Supabase Auth address, checked
 * under a row lock), by a passkey, or by a device that passed one within
 * thirty days and keeps the secret fingerprint to prove it.
 *
 * Deno and database calls are injected so this runs under the unit tests.
 */
import type { StepUpAnswer } from "./passkeyGate.ts";
import { fingerprintOf } from "./fingerprint.ts";

export const SECOND_FACTOR_ROLES = ["owner", "admin", "editor"] as const;

export const SECOND_FACTOR_MESSAGES = {
  noSession: "تعذّر التعرّف على الجلسة. سجّل الدخول من جديد.",
} as const;

export type SecondFactorMethod = "code" | "passkey" | "device";

export function secondFactorRequired(roles: readonly string[]): boolean {
  return roles.some((r) => (SECOND_FACTOR_ROLES as readonly string[]).includes(r));
}

export interface SecondFactorDeps {
  roles(userId: string): Promise<string[]>;
  isRecorded(sessionId: string, userId: string): Promise<boolean>;
  isTrustedDevice(userId: string, fingerprint: string, now: Date): Promise<boolean>;
  record(sessionId: string, userId: string, method: SecondFactorMethod): Promise<void>;
}

export type CheckAnswer =
  | { noRoles: true; requiresOtp: false }
  | { requiresOtp: false }
  | { requiresOtp: true; sent: boolean }
  | { error: string; rateLimited?: true };

/**
 * What a session needs after sign-in. The answer keeps admin-otp's shape
 * ({requiresOtp, sent, noRoles, rateLimited, error}) so the page reads it the
 * same way.
 */
export async function checkSecondFactor(
  deps: SecondFactorDeps & { sendCode(): Promise<StepUpAnswer> },
  input: { userId: string; sessionId: string; fingerprint: unknown },
  now: Date = new Date(),
): Promise<CheckAnswer> {
  const roles = await deps.roles(input.userId);
  if (roles.length === 0) return { noRoles: true, requiresOtp: false };
  if (!secondFactorRequired(roles)) return { requiresOtp: false };
  if (!input.sessionId) return { error: SECOND_FACTOR_MESSAGES.noSession };
  if (await deps.isRecorded(input.sessionId, input.userId)) return { requiresOtp: false };

  const fingerprint = fingerprintOf(input.fingerprint);
  if (fingerprint && (await deps.isTrustedDevice(input.userId, fingerprint, now))) {
    await deps.record(input.sessionId, input.userId, "device");
    return { requiresOtp: false };
  }

  const sent = await deps.sendCode();
  if ("error" in sent) return { error: sent.error, ...(sent.rateLimited ? { rateLimited: true as const } : {}) };
  return { requiresOtp: true, sent: "sent" in sent ? sent.sent : false };
}

/** A correct code records the session and trusts the device for the next thirty days. */
export async function verifySecondFactor(
  deps: Pick<SecondFactorDeps, "record"> & {
    verifyCode(code: unknown, sessionId: string): Promise<StepUpAnswer>;
    trustDevice(userId: string, fingerprint: string, now: Date): Promise<void>;
  },
  input: { userId: string; sessionId: string; code: unknown; fingerprint: unknown },
  now: Date = new Date(),
): Promise<{ verified: true } | { verified: false; error: string }> {
  if (!input.sessionId) return { verified: false, error: SECOND_FACTOR_MESSAGES.noSession };
  const answer = await deps.verifyCode(input.code, input.sessionId);
  if (!("verified" in answer) || answer.verified !== true) {
    return { verified: false, error: "error" in answer ? answer.error : "الرمز غير صحيح أو انتهت صلاحيته" };
  }
  await deps.record(input.sessionId, input.userId, "code");
  const fingerprint = fingerprintOf(input.fingerprint);
  if (fingerprint) await deps.trustDevice(input.userId, fingerprint, now);
  return { verified: true };
}

/** Where the session stands, for the page to route on. */
export async function secondFactorStatus(
  deps: Pick<SecondFactorDeps, "roles" | "isRecorded">,
  input: { userId: string; sessionId: string },
): Promise<{ required: boolean; verified: boolean }> {
  const required = secondFactorRequired(await deps.roles(input.userId));
  if (!required) return { required, verified: true };
  const verified = !!input.sessionId && (await deps.isRecorded(input.sessionId, input.userId));
  return { required, verified };
}
