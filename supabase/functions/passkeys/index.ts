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
  ALLOWED_ORIGINS,
  MAX_CHALLENGES_PER_WINDOW,
  RATE_WINDOW_MS,
  base64urlToBytes,
  bytesToBase64url,
  challengeExpiresAt,
  isAllowedOrigin,
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
  type LoginChallengeStore,
} from "../_shared/passkeyLogin.ts";

const RP_NAME = "رؤية بصيرة";
const TRUSTED_DEVICE_DAYS = 30;

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

async function trustDevice(supabase: SupabaseClient, userId: string, fingerprint: string, now: Date) {
  await supabase.from("trusted_devices").upsert(
    {
      user_id: userId,
      fingerprint,
      expires_at: new Date(now.getTime() + TRUSTED_DEVICE_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    },
    { onConflict: "user_id,fingerprint" },
  );
}

/** Challenges minted before sign-in, held apart from the per-user ones. */
function loginChallengeStore(supabase: SupabaseClient): LoginChallengeStore {
  const table = () => supabase.from("passkey_login_challenges");
  return {
    async purgeExpired(now) {
      await table().delete().lt("expires_at", now.toISOString());
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
    // Deleted and read in one statement: two answers racing for one
    // challenge cannot both get it.
    async take(id) {
      const { data } = await table().delete().eq("id", id).select("challenge, expires_at").maybeSingle();
      return data ?? null;
    },
  };
}

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const rp = relyingPartyFor(req.headers.get("origin"));
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const now = new Date();

    // Signing in with a passkey alone happens before there is a session, so
    // these two come before the check every other action needs.
    if (action === "login-options" || action === "login-verify") {
      if (!rp) return json(403, { error: "مصدر الطلب غير مسموح" });
      const store = loginChallengeStore(supabase);
      if (action === "login-options") {
        return json(200, await beginPasskeyLogin({
          store,
          // No allowCredentials: the device offers whichever passkey it holds
          // for this site. Verification is required: with no password behind
          // it, a bare tap is not enough.
          generateOptions: () => generateAuthenticationOptions({ rpID: rp.rpID, userVerification: "required", allowCredentials: [] }),
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
              expectedOrigin: rp.origin,
              expectedRPID: rp.rpID,
              requireUserVerification: true,
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

    if (action === "register-options") {
      const existing = await ownPasskeys();
      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: rp.rpID,
        userName: user.email ?? user.id,
        userDisplayName: (user.user_metadata?.full_name as string | undefined) || user.email || "",
        userID: new TextEncoder().encode(user.id),
        attestationType: "none",
        excludeCredentials: existing.map((p) => ({ id: p.credential_id, transports: transportsOf(p) })),
        // Discoverable, so the key can later sign in on its own with no email typed.
        authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
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
      const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
      const { data, error } = await supabase.from("passkeys").insert({
        user_id: user.id,
        credential_id: credential.id,
        public_key: bytesToBase64url(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports ?? [],
        device_type: credentialDeviceType,
        backed_up: credentialBackedUp,
        name: passkeyName(body.name),
      }).select().single();
      if (error) throw error;
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
