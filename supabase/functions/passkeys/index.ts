/**
 * Passkeys (WebAuthn) as the second factor beside the emailed code.
 *
 * Every action needs a signed-in user with a role, exactly like admin-otp:
 * the password is the first factor, the passkey the second. A successful
 * `auth-verify` trusts the device for thirty days the way a correct code
 * does, so the login page can treat the two interchangeably.
 *
 * Actions: list · register-options · register-verify · auth-options ·
 * auth-verify · delete.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
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

const RP_NAME = "رؤية بصيرة";
const TRUSTED_DEVICE_DAYS = 30;

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

    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (!token) return json(401, { error: "Unauthorized" });
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return json(401, { error: "Unauthorized" });

    const { count: roleCount } = await supabase
      .from("user_roles").select("id", { count: "exact", head: true }).eq("user_id", user.id);
    if ((roleCount ?? 0) === 0) return json(403, { error: "لا صلاحيات لهذا الحساب" });

    const rp = relyingPartyFor(req.headers.get("origin"));
    if (!rp) return json(403, { error: "مصدر الطلب غير مسموح" });

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const now = new Date();

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
        excludeCredentials: existing.map((p) => ({ id: p.credential_id, transports: p.transports ?? undefined })),
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
        allowCredentials: existing.map((p) => ({ id: p.credential_id, transports: p.transports ?? undefined })),
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
        credential: {
          id: passkey.credential_id,
          publicKey: base64urlToBytes(passkey.public_key),
          counter: Number(passkey.counter),
          transports: (passkey.transports ?? undefined) as never,
        },
      });
      if (!verification.verified) return json(400, { verified: false, error: "تعذّر التحقق من مفتاح المرور" });

      await supabase.from("passkeys")
        .update({ counter: verification.authenticationInfo.newCounter, last_used_at: now.toISOString() })
        .eq("id", passkey.id);

      const fingerprint = typeof body.fingerprint === "string" ? body.fingerprint : "";
      if (fingerprint) {
        await supabase.from("trusted_devices").upsert(
          {
            user_id: user.id,
            fingerprint,
            expires_at: new Date(now.getTime() + TRUSTED_DEVICE_DAYS * 24 * 60 * 60 * 1000).toISOString(),
          },
          { onConflict: "user_id,fingerprint" },
        );
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
