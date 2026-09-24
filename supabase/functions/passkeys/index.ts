/**
 * Passkeys (WebAuthn): the second factor beside the emailed code, and a door
 * of their own.
 *
 * As a second factor every action needs a signed-in user with a role,
 * exactly like admin-otp: the password is the first factor, the passkey the
 * second. A successful `auth-verify` trusts the device for thirty days the
 * way a correct code does, so the login page can treat the two
 * interchangeably.
 *
 * Alone, `login-options` and `login-verify` sign a person in with no email
 * and no password, so they run before any session exists; the checks that
 * stand in for the password are in ../_shared/passkeyLogin.ts.
 *
 * Actions: login-options · login-verify · list · register-options ·
 * register-verify · auth-options · auth-verify · delete.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticatorTransportFuture,
} from "npm:@simplewebauthn/server@13";
import {
  MAX_CHALLENGES_PER_WINDOW,
  RATE_WINDOW_MS,
  base64urlToBytes,
  bytesToBase64url,
  challengeExpiresAt,
  isChallengeLive,
  passkeyName,
  relyingPartyFor,
  summarizePasskey,
  type PasskeyRow,
} from "../_shared/passkeys.ts";
import {
  beginPasskeyLogin,
  clientAddress,
  completePasskeyLogin,
  isMissingSchema,
  loginRelyingPartyFor,
  type LoginChallengeStore,
} from "../_shared/passkeyLogin.ts";
import {
  GATE_MESSAGES,
  grantCutoff,
  sendStepUp,
  sessionIdOf,
  signInCapability,
  verifyStepUp,
} from "../_shared/passkeyGate.ts";
import {
  accountMail,
  corsHeaders,
  escapeHtml,
  sendAccountEmail,
  sha256Hex,
  recordSecondFactor,
  stepUpStore,
  trustDevice,
} from "../_shared/account.ts";

const RP_NAME = "رؤية بصيرة";

/** A stored credential as the library takes it. */
function credentialOf(p: PasskeyRow) {
  return {
    id: p.credential_id,
    publicKey: base64urlToBytes(p.public_key) as Uint8Array<ArrayBuffer>,
    counter: Number(p.counter),
    transports: transportsOf(p),
  };
}

function transportsOf(p: PasskeyRow) {
  return (p.transports ?? undefined) as AuthenticatorTransportFuture[] | undefined;
}

/** Challenges minted before sign-in, held apart from the per-user ones. */
function loginChallengeStore(supabase: SupabaseClient): LoginChallengeStore {
  const table = () => supabase.from("passkey_login_challenges");
  return {
    async purgeBefore(cutoff) {
      await table().delete().lt("created_at", cutoff.toISOString());
    },
    async countSince(client, since) {
      const { count, error } = await table()
        .select("id", { count: "exact", head: true }).eq("client", client).gte("created_at", since.toISOString());
      if (error) throw error;
      return count ?? 0;
    },
    async insert(row) {
      const { data, error } = await table().insert(row).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    // Marked and read in one statement: two answers racing for one
    // challenge cannot both get it. A malformed id is no challenge at all.
    async take(id) {
      const { data, error } = await table()
        .update({ used_at: new Date().toISOString() })
        .eq("id", id).is("used_at", null)
        .select("challenge, expires_at").maybeSingle();
      if (error && error.code !== "22P02") throw error;
      return data ?? null;
    },
    async forget(id) {
      await table().delete().eq("id", id);
    },
  };
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  // A migration not applied yet answers plainly to the person, loudly to the log.
  const schemaMissing = (err: unknown, body: unknown) => {
    console.error("[passkeys] schema not applied yet", err);
    return json(200, body);
  };

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const rp = relyingPartyFor(req.headers.get("origin"));
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const now = new Date();

    // Signing in with a passkey alone happens before there is a session, so
    // these two come before the check every other action needs.
    if (action === "login-options" || action === "login-verify") {
      const loginRp = loginRelyingPartyFor(req.headers.get("origin"));
      if (!loginRp) return json(200, { error: "الدخول بمفتاح المرور غير متاح من هذا الموقع" });
      const store = loginChallengeStore(supabase);
      if (action === "login-options") {
        return json(200, await beginPasskeyLogin({
          store,
          // No allowCredentials: the device offers whichever passkey it holds
          // for this site. Verification is required: with no password behind
          // it, a bare tap is not enough.
          generateOptions: () => generateAuthenticationOptions({ rpID: loginRp.rpID, userVerification: "required", allowCredentials: [] }),
        }, clientAddress(req.headers), now));
      }
      return json(200, await completePasskeyLogin({
        store,
        async findPasskey(credentialId) {
          const { data } = await supabase.from("passkeys").select("*").eq("credential_id", credentialId).maybeSingle();
          return (data as PasskeyRow | null) ?? null;
        },
        async verify({ response, expectedChallenge, passkey }) {
          try {
            const v = await verifyAuthenticationResponse({
              response: response as never,
              expectedChallenge,
              expectedOrigin: loginRp.origin,
              expectedRPID: loginRp.rpID,
              // Reported, not enforced here: completePasskeyLogin refuses a
              // bare tap itself, where the refusal is tested.
              requireUserVerification: false,
              credential: credentialOf(passkey),
            });
            return { verified: v.verified, userVerified: v.authenticationInfo.userVerified, newCounter: v.authenticationInfo.newCounter };
          } catch (err) {
            console.error("[passkeys] login assertion refused", err);
            return { verified: false, userVerified: false, newCounter: 0 };
          }
        },
        async touchPasskey(id, newCounter, at) {
          await supabase.from("passkeys").update({ counter: newCounter, last_used_at: at.toISOString() }).eq("id", id);
        },
        async hasRoles(userId) {
          const { count } = await supabase.from("user_roles").select("id", { count: "exact", head: true }).eq("user_id", userId);
          return (count ?? 0) > 0;
        },
        async emailOf(userId) {
          const { data } = await supabase.auth.admin.getUserById(userId);
          return data.user?.email ?? null;
        },
        // A magic link's token, never sent anywhere: the browser exchanges it
        // for a session at once with verifyOtp.
        async mintTokenHash(email) {
          const { data, error } = await supabase.auth.admin.generateLink({ type: "magiclink", email });
          if (error) console.error("[passkeys] generateLink", error);
          return data?.properties?.hashed_token ?? null;
        },
        trustDevice: (userId, fingerprint, at) => trustDevice(supabase, userId, fingerprint, at),
      }, { challengeId: body.challengeId, response: body.response, fingerprint: body.fingerprint }, now));
    }

    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (!token) return json(401, { error: "Unauthorized" });
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return json(401, { error: "Unauthorized" });

    const { count: roleCount } = await supabase
      .from("user_roles").select("id", { count: "exact", head: true }).eq("user_id", user.id);
    if ((roleCount ?? 0) === 0) return json(403, { error: "لا صلاحيات لهذا الحساب" });

    if (!rp) return json(403, { error: "مصدر الطلب غير مسموح" });

    const ownPasskeys = async (): Promise<PasskeyRow[]> => {
      const { data, error } = await supabase
        .from("passkeys").select("*").eq("user_id", user.id).order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PasskeyRow[];
    };

    const mintChallenge = async (kind: "registration" | "authentication", challenge: string) => {
      await supabase.from("passkey_challenges").delete().eq("user_id", user.id).lt("expires_at", now.toISOString());
      const windowStart = new Date(now.getTime() - RATE_WINDOW_MS).toISOString();
      const { count } = await supabase
        .from("passkey_challenges").select("id", { count: "exact", head: true })
        .eq("user_id", user.id).gte("created_at", windowStart);
      if ((count ?? 0) >= MAX_CHALLENGES_PER_WINDOW) return false;
      const { error } = await supabase.from("passkey_challenges").insert({
        user_id: user.id, kind, challenge, expires_at: challengeExpiresAt(now),
      });
      if (error) throw error;
      return true;
    };

    /** The one live challenge of this kind, consumed on the way out. */
    const takeChallenge = async (kind: "registration" | "authentication"): Promise<string | null> => {
      const { data } = await supabase
        .from("passkey_challenges").select("id, challenge, expires_at")
        .eq("user_id", user.id).eq("kind", kind)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!data) return null;
      await supabase.from("passkey_challenges").delete().eq("id", data.id);
      return isChallengeLive(data, now) ? data.challenge : null;
    };

    if (action === "list") {
      return json(200, { passkeys: (await ownPasskeys()).map(summarizePasskey) });
    }

    // Adding a passkey needs a code confirmed by this session, not just the
    // session: see ../_shared/passkeyGate.ts.
    const sessionId = sessionIdOf(token);
    const steps = stepUpStore(supabase);

    if (action === "step-up-send") {
      if (!user.email) return json(200, { error: GATE_MESSAGES.notSent });
      const email = user.email;
      try {
        return json(200, await sendStepUp({
          store: steps,
          draw: () => crypto.getRandomValues(new Uint32Array(1))[0],
          hash: sha256Hex,
          email: (code) => sendAccountEmail(supabase, {
            to: email,
            subject: "رمز تأكيد إضافة مفتاح مرور - SightB",
            label: "passkey-step-up",
            html: accountMail("رمز التأكيد", `<p style="color: #555;">رمز تأكيد إضافة مفتاح مرور إلى حسابك:</p>
  <div style="background: #f0f4ff; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0; border: 1px solid #d0d8ff;">
    <span style="font-size: 36px; font-weight: bold; letter-spacing: 10px; color: #1a1a1a;">${code}</span>
  </div>
  <p style="color: #888; font-size: 13px;">صالح عشر دقائق. إن لم تطلبه فكلمة مرورك في يد غيرك: غيّرها الآن، ولا تعطِ هذا الرمز لأحد.</p>`),
          }),
        }, user.id, now));
      } catch (err) {
        if (isMissingSchema(err)) return schemaMissing(err, { error: GATE_MESSAGES.unavailable });
        throw err;
      }
    }

    if (action === "step-up-verify") {
      try {
        return json(200, await verifyStepUp({ store: steps, hash: sha256Hex }, user.id, { code: body.code, sessionId }));
      } catch (err) {
        if (isMissingSchema(err)) return schemaMissing(err, { verified: false, error: GATE_MESSAGES.unavailable });
        throw err;
      }
    }

    if (action === "register-options") {
      try {
        // The error is for a page published before this gate, which knows
        // nothing of needsStepUp and would otherwise start an empty ceremony.
        if (!sessionId || !(await steps.hasGrant(user.id, sessionId, grantCutoff(now)))) {
          return json(200, { needsStepUp: true, error: "حدّث الصفحة لتأكيد هويتك برمز البريد، ثم أعد المحاولة." });
        }
      } catch (err) {
        if (isMissingSchema(err)) return schemaMissing(err, { error: GATE_MESSAGES.unavailable });
        throw err;
      }
      const existing = await ownPasskeys();
      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: rp.rpID,
        userName: user.email ?? user.id,
        userDisplayName: (user.user_metadata?.full_name as string | undefined) || user.email || "",
        userID: new TextEncoder().encode(user.id),
        attestationType: "none",
        // Only keys that already sign in are excluded, so an older
        // verification-only key can be replaced from the same device.
        excludeCredentials: existing.filter((p) => p.can_sign_in === true)
          .map((p) => ({ id: p.credential_id, transports: transportsOf(p) })),
        // Discoverable where the authenticator can, so the key can sign in on
        // its own; a key that cannot is still registered, as a second factor.
        authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
      });
      if (!(await mintChallenge("registration", options.challenge))) {
        return json(429, { error: "تم تجاوز عدد المحاولات. حاول بعد قليل.", rateLimited: true });
      }
      return json(200, { options });
    }

    if (action === "register-verify") {
      const expectedChallenge = await takeChallenge("registration");
      if (!expectedChallenge) return json(400, { error: "انتهت مهلة التسجيل، ابدأ من جديد" });
      const verification = await verifyRegistrationResponse({
        response: body.response,
        expectedChallenge,
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpID,
      });
      if (!verification.verified || !verification.registrationInfo) {
        return json(400, { error: "تعذّر التحقق من مفتاح المرور" });
      }
      // The grant is used up only by a registration that verified, so a
      // cancelled or failed ceremony can be retried within the ten minutes.
      if (!sessionId || !(await steps.consumeGrant(user.id, sessionId, grantCutoff(now)))) {
        return json(200, { error: GATE_MESSAGES.stepUpRequired, needsStepUp: true });
      }
      const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
      const name = passkeyName(body.name);
      const { data, error } = await supabase.from("passkeys").insert({
        user_id: user.id,
        credential_id: credential.id,
        public_key: bytesToBase64url(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports ?? [],
        device_type: credentialDeviceType,
        backed_up: credentialBackedUp,
        name,
        ...signInCapability(body.response?.clientExtensionResults),
      }).select().single();
      if (error && isMissingSchema(error)) return schemaMissing(error, { error: GATE_MESSAGES.unavailable });
      if (error) throw error;
      // The owner hears of every key added, so one they did not add is seen.
      if (user.email) {
        await sendAccountEmail(supabase, {
          to: user.email,
          subject: "أُضيف مفتاح مرور إلى حسابك - SightB",
          label: "passkey-added",
          html: accountMail("مفتاح مرور جديد", `<p style="color: #555;">أُضيف مفتاح المرور «${escapeHtml(name)}» إلى حسابك في ${now.toISOString().slice(0, 16).replace("T", " ")} بتوقيت غرينتش.</p>
  <p style="color: #555;">إن لم تضفه أنت فاحذفه من صفحة الأمان، وغيّر كلمة المرور.</p>`),
        });
      }
      return json(200, { registered: true, passkey: summarizePasskey(data as PasskeyRow) });
    }

    if (action === "auth-options") {
      const existing = await ownPasskeys();
      if (existing.length === 0) return json(200, { noPasskeys: true });
      const options = await generateAuthenticationOptions({
        rpID: rp.rpID,
        userVerification: "preferred",
        allowCredentials: existing.map((p) => ({ id: p.credential_id, transports: transportsOf(p) })),
      });
      if (!(await mintChallenge("authentication", options.challenge))) {
        return json(429, { error: "تم تجاوز عدد المحاولات. حاول بعد قليل.", rateLimited: true });
      }
      return json(200, { options });
    }

    if (action === "auth-verify") {
      const expectedChallenge = await takeChallenge("authentication");
      if (!expectedChallenge) return json(400, { verified: false, error: "انتهت مهلة التحقق، حاول مرة أخرى" });
      const credentialId = String(body.response?.id || "");
      const passkey = (await ownPasskeys()).find((p) => p.credential_id === credentialId);
      if (!passkey) return json(400, { verified: false, error: "مفتاح المرور غير مسجّل لهذا الحساب" });
      const verification = await verifyAuthenticationResponse({
        response: body.response,
        expectedChallenge,
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpID,
        credential: credentialOf(passkey),
      });
      if (!verification.verified) return json(400, { verified: false, error: "تعذّر التحقق من مفتاح المرور" });

      await supabase.from("passkeys")
        .update({ counter: verification.authenticationInfo.newCounter, last_used_at: now.toISOString() })
        .eq("id", passkey.id);

      const fingerprint = typeof body.fingerprint === "string" ? body.fingerprint : "";
      if (fingerprint) await trustDevice(supabase, user.id, fingerprint, now);
      // This session has passed the second factor; row-level security reads this.
      try {
        if (sessionId) await recordSecondFactor(supabase, sessionId, user.id, "passkey");
      } catch (err) {
        if (!isMissingSchema(err)) throw err;
        console.error("[passkeys] schema not applied yet", err);
      }
      return json(200, { verified: true });
    }

    if (action === "delete") {
      const id = String(body.id || "");
      if (!id) return json(400, { error: "المعرّف مطلوب" });
      const { error } = await supabase.from("passkeys").delete().eq("id", id).eq("user_id", user.id);
      if (error) throw error;
      return json(200, { deleted: true });
    }

    return json(400, { error: "إجراء غير معروف" });
  } catch (err) {
    console.error("[passkeys]", err);
    return json(500, { error: "حدث خطأ غير متوقع" });
  }
});
