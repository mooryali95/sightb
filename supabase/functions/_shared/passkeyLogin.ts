/**
 * Signing in with a passkey alone: no email, no password, no code.
 *
 * The browser asks for options before anyone is signed in, so the challenge
 * cannot belong to a user; it is stored on its own and handed back by id.
 * The authenticator then offers whichever passkey it holds for this site,
 * and the answer names the credential and, through the user handle, the
 * account it was made for.
 *
 * What must hold before a session is minted:
 *   * the challenge is ours, unused and live (it is consumed either way);
 *   * the credential is registered, and to the account its handle names;
 *   * the signature verifies and the person was verified on the device (a
 *     fingerprint, a face or a PIN, never a bare tap), which with the device
 *     itself makes two factors, the reason no emailed code follows;
 *   * the account has a role, like every other door into the app.
 *
 * The Deno and library calls are injected, so this runs under the app's
 * unit tests; the edge function only wires them.
 */
import {
  base64urlToBytes,
  challengeExpiresAt,
  isChallengeLive,
  type PasskeyRow,
} from "./passkeys.ts";

/** Ceremonies one address may start in the window; the table cannot be flooded past it. */
export const MAX_LOGIN_CHALLENGES_PER_CLIENT = 20;
export const LOGIN_RATE_WINDOW_MS = 10 * 60 * 1000;

export const LOGIN_MESSAGES = {
  rateLimited: "تم تجاوز عدد المحاولات. حاول بعد قليل.",
  expired: "انتهت مهلة الدخول، حاول مرة أخرى",
  unknownCredential: "مفتاح المرور هذا غير مسجّل. ادخل بكلمة المرور، ثم أضفه من صفحة الأمان.",
  refused: "تعذّر التحقق من مفتاح المرور",
  notVerified: "يلزم التحقق بالبصمة أو الوجه أو رمز الجهاز",
  noRoles: "لا صلاحيات لهذا الحساب",
  noSession: "تعذّر فتح الجلسة، حاول مرة أخرى",
} as const;

/** The address a request came from, as the platform's proxy reports it. */
export function clientAddress(headers: { get(name: string): string | null }): string {
  const forwarded = (headers.get("x-forwarded-for") || "").split(",")[0].trim();
  return (forwarded || headers.get("x-real-ip") || "unknown").slice(0, 64);
}

/** Whether a WebAuthn user handle (base64url of the id bytes) names this user. */
export function userHandleIs(userHandle: unknown, userId: string): boolean {
  if (typeof userHandle !== "string" || !userHandle) return false;
  try {
    return new TextDecoder().decode(base64urlToBytes(userHandle)) === userId;
  } catch {
    return false;
  }
}

export interface LoginChallengeStore {
  purgeExpired(now: Date): Promise<void>;
  countSince(client: string, since: Date): Promise<number>;
  insert(row: { challenge: string; client: string; expires_at: string }): Promise<string>;
  /** Removes the challenge and returns what it held, or null when there is none. */
  take(id: string): Promise<{ challenge: string; expires_at: string } | null>;
}

/**
 * What the browser is answered. A refusal is an ordinary answer with an
 * `error`, not an HTTP failure: the client reads the body of a 200, and a
 * 4xx would reach the person as the library's English "non-2xx status".
 */
export type LoginAnswer =
  | { options: unknown; challengeId: string }
  | { verified: true; tokenHash: string }
  | { verified?: false; error: string; rateLimited?: true; unknownCredential?: true };

/** Mints discoverable-credential options: no email is asked, the device offers its passkeys. */
export async function beginPasskeyLogin(
  deps: {
    store: LoginChallengeStore;
    generateOptions(): Promise<{ challenge: string }>;
  },
  client: string,
  now: Date = new Date(),
): Promise<LoginAnswer> {
  await deps.store.purgeExpired(now);
  const recent = await deps.store.countSince(client, new Date(now.getTime() - LOGIN_RATE_WINDOW_MS));
  if (recent >= MAX_LOGIN_CHALLENGES_PER_CLIENT) {
    return { error: LOGIN_MESSAGES.rateLimited, rateLimited: true };
  }
  const options = await deps.generateOptions();
  const challengeId = await deps.store.insert({ challenge: options.challenge, client, expires_at: challengeExpiresAt(now) });
  return { options, challengeId };
}

export interface CompleteDeps {
  store: LoginChallengeStore;
  findPasskey(credentialId: string): Promise<PasskeyRow | null>;
  /** The library's verification against the stored challenge and key. */
  verify(args: { response: unknown; expectedChallenge: string; passkey: PasskeyRow }):
    Promise<{ verified: boolean; userVerified: boolean; newCounter: number }>;
  touchPasskey(id: string, newCounter: number, now: Date): Promise<void>;
  hasRoles(userId: string): Promise<boolean>;
  emailOf(userId: string): Promise<string | null>;
  /** A one-time token the browser exchanges for a session. */
  mintTokenHash(email: string): Promise<string | null>;
  trustDevice(userId: string, fingerprint: string, now: Date): Promise<void>;
}

/** Checks the answer and, when every condition holds, returns the token a session is opened with. */
export async function completePasskeyLogin(
  deps: CompleteDeps,
  input: { challengeId: unknown; response: unknown; fingerprint: unknown },
  now: Date = new Date(),
): Promise<LoginAnswer> {
  const refuse = (error: string, extra: { unknownCredential?: true } = {}): LoginAnswer =>
    ({ verified: false, error, ...extra });

  const challengeId = typeof input.challengeId === "string" ? input.challengeId : "";
  const held = challengeId ? await deps.store.take(challengeId) : null;
  if (!held || !isChallengeLive(held, now)) return refuse(LOGIN_MESSAGES.expired);

  const response = (input.response ?? {}) as { id?: unknown; response?: { userHandle?: unknown } };
  const credentialId = typeof response.id === "string" ? response.id : "";
  const passkey = credentialId ? await deps.findPasskey(credentialId) : null;
  if (!passkey) return refuse(LOGIN_MESSAGES.unknownCredential, { unknownCredential: true });
  if (!userHandleIs(response.response?.userHandle, passkey.user_id)) return refuse(LOGIN_MESSAGES.refused);

  const result = await deps.verify({ response: input.response, expectedChallenge: held.challenge, passkey });
  if (!result.verified) return refuse(LOGIN_MESSAGES.refused);
  await deps.touchPasskey(passkey.id, result.newCounter, now);
  if (!result.userVerified) return refuse(LOGIN_MESSAGES.notVerified);

  if (!(await deps.hasRoles(passkey.user_id))) return refuse(LOGIN_MESSAGES.noRoles);

  const email = await deps.emailOf(passkey.user_id);
  const tokenHash = email ? await deps.mintTokenHash(email) : null;
  if (!tokenHash) return refuse(LOGIN_MESSAGES.noSession);

  const fingerprint = typeof input.fingerprint === "string" ? input.fingerprint.slice(0, 128) : "";
  if (fingerprint) await deps.trustDevice(passkey.user_id, fingerprint, now);

  return { verified: true, tokenHash };
}
