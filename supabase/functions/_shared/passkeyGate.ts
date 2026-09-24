/**
 * Who may add a passkey. A passkey signs in on its own, so adding one must
 * take more than a password: the server never learns whether a session
 * passed the emailed login code (the login page asks for it; the session
 * exists before it), and a key planted from a password-only session would
 * outlive a password reset.
 *
 * So every registration is preceded by a code sent to the account's sign-in
 * address, the one Supabase Auth holds, not the editable profile copy. A
 * correct code grants one registration, to this session, for ten minutes.
 * Nothing kept in the browser counts: a trusted-device fingerprint lives in
 * localStorage and is earned through admin-otp, which mails the editable
 * profile address, so it proves nothing here.
 *
 * The code check itself runs in one database function under a row lock
 * (passkey_step_up_verify), so parallel guesses cannot outrun the limit.
 * Deno and library calls are injected so this runs under the unit tests.
 */

export const STEP_UP_TTL_MS = 10 * 60 * 1000;
export const STEP_UP_WINDOW_MS = 10 * 60 * 1000;
export const STEP_UP_DAY_MS = 24 * 60 * 60 * 1000;
/** Codes one user may be sent in ten minutes, and in a day. */
export const STEP_UP_MAX_SENDS = 3;
export const STEP_UP_MAX_SENDS_PER_DAY = 10;
/** How long a confirmed code lets this session register a key. */
export const STEP_UP_GRANT_MS = 10 * 60 * 1000;

export const GATE_MESSAGES = {
  stepUpRequired: "أكّد أنه أنت برمز يصلك بالبريد قبل إضافة مفتاح مرور.",
  rateLimited: "طُلبت رموز كثيرة. انتظر قليلاً ثم حاول.",
  dailyLimit: "بلغت حد الرموز لليوم. حاول غداً، أو تواصل مع مدير النظام.",
  badCode: "الرمز غير صحيح أو انتهت صلاحيته",
  spentCode: "تجاوزت المحاولات لهذا الرمز. اطلب رمزاً جديداً.",
  noSession: "تعذّر التعرّف على الجلسة. سجّل الدخول من جديد.",
  notSent: "تعذّر إرسال الرمز. حاول بعد قليل.",
  unavailable: "إضافة مفاتيح المرور متوقفة حتى يُطبَّق تحديث قاعدة البيانات.",
} as const;

/**
 * The session an access token belongs to, from its `session_id` claim. Read
 * only after Supabase Auth has accepted the token; the claim is what binds a
 * confirmed code to the session that confirmed it.
 */
export function sessionIdOf(accessToken: string): string {
  const payload = accessToken.split(".")[1];
  if (!payload) return "";
  try {
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (payload.length % 4)) % 4);
    const claims = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))));
    const id = claims?.session_id;
    return typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id) ? id : "";
  } catch {
    return "";
  }
}

/** Six digits from a uniform 32-bit draw; the bias of the modulo is under one in four thousand. */
export function stepUpCode(draw: number): string {
  return String(100000 + (draw % 900000));
}

export interface StepUpStore {
  countSince(userId: string, since: Date): Promise<number>;
  insert(row: { user_id: string; code_hash: string; expires_at: string }): Promise<void>;
  /**
   * Checks a code hash against the newest live code, atomically: one wrong
   * guess more, the code spent, or the code confirmed for this session.
   */
  check(userId: string, codeHash: string, sessionId: string): Promise<"ok" | "wrong" | "spent" | "none">;
  /** Whether this session holds an unused grant confirmed after the cutoff. */
  hasGrant(userId: string, sessionId: string, since: Date): Promise<boolean>;
  /** Uses up the grant in one statement; false when there was none to use. */
  consumeGrant(userId: string, sessionId: string, since: Date): Promise<boolean>;
}

export type StepUpAnswer =
  | { sent: boolean }
  | { verified: true }
  | { verified?: false; error: string; rateLimited?: true };

/** Emails a fresh code, unless the user has asked for too many lately. Earlier codes stop working. */
export async function sendStepUp(
  deps: {
    store: StepUpStore;
    draw(): number;
    hash(code: string): Promise<string>;
    /** Sends the code to the account's sign-in address; false when it could not. */
    email(code: string): Promise<boolean>;
  },
  userId: string,
  now: Date = new Date(),
): Promise<StepUpAnswer> {
  if (await deps.store.countSince(userId, new Date(now.getTime() - STEP_UP_DAY_MS)) >= STEP_UP_MAX_SENDS_PER_DAY) {
    return { error: GATE_MESSAGES.dailyLimit, rateLimited: true };
  }
  if (await deps.store.countSince(userId, new Date(now.getTime() - STEP_UP_WINDOW_MS)) >= STEP_UP_MAX_SENDS) {
    return { error: GATE_MESSAGES.rateLimited, rateLimited: true };
  }
  const code = stepUpCode(deps.draw());
  await deps.store.insert({
    user_id: userId,
    code_hash: await deps.hash(code),
    expires_at: new Date(now.getTime() + STEP_UP_TTL_MS).toISOString(),
  });
  return { sent: await deps.email(code) };
}

/** Confirms a code for this session; the grant it leaves is what registration consumes. */
export async function verifyStepUp(
  deps: { store: StepUpStore; hash(code: string): Promise<string> },
  userId: string,
  input: { code: unknown; sessionId: string },
): Promise<StepUpAnswer> {
  if (!input.sessionId) return { verified: false, error: GATE_MESSAGES.noSession };
  const code = typeof input.code === "string" ? input.code.trim() : "";
  // A malformed code is still a guess: it is checked, so it is counted.
  const outcome = await deps.store.check(userId, await deps.hash(/^\d{6}$/.test(code) ? code : `invalid:${code}`), input.sessionId);
  if (outcome === "ok") return { verified: true };
  return { verified: false, error: outcome === "spent" ? GATE_MESSAGES.spentCode : GATE_MESSAGES.badCode };
}

/** The cutoff before which a confirmed code no longer grants a registration. */
export function grantCutoff(now: Date): Date {
  return new Date(now.getTime() - STEP_UP_GRANT_MS);
}

/**
 * What a new registration may do. The browser reports through credProps
 * whether the authenticator kept a discoverable credential; only such a
 * key can be offered at a sign-in where no email is typed. The report is the
 * client's word, which is enough: it decides what the key is offered for,
 * not who may use it. A browser that does not report is taken at yes, and
 * the worst case is a key that never appears in the sign-in prompt.
 */
export function signInCapability(clientExtensionResults: unknown): { can_sign_in: boolean; discoverable: boolean | null } {
  const rk = (clientExtensionResults as { credProps?: { rk?: unknown } } | null | undefined)?.credProps?.rk;
  const discoverable = typeof rk === "boolean" ? rk : null;
  return { can_sign_in: discoverable !== false, discoverable };
}
