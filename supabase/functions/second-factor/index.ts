/**
 * The login second factor, recorded per session so the database can enforce
 * it (see ../_shared/secondFactor.ts and the migration
 * 20260924150000_second_factor_on_the_server.sql).
 *
 * The login page used to ask admin-otp, which Lovable owns and may
 * regenerate, and which mails its code to the editable profile address.
 * This function answers in the same shape, mails the code to the Supabase
 * Auth address, checks it under a row lock, and records the session.
 *
 * Actions: status · check {fingerprint} · verify {code, fingerprint}.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isMissingSchema } from "../_shared/passkeyLogin.ts";
import { sendStepUp, sessionIdOf, verifyStepUp } from "../_shared/passkeyGate.ts";
import { checkSecondFactor, secondFactorStatus, verifySecondFactor } from "../_shared/secondFactor.ts";
import {
  accountMail,
  corsHeaders,
  isTrustedDevice,
  recordSecondFactor,
  sendAccountEmail,
  sha256Hex,
  stepUpStore,
  trustDevice,
} from "../_shared/account.ts";

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

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const sessionId = sessionIdOf(token);
    const now = new Date();
    const steps = stepUpStore(supabase);

    const deps = {
      async roles(userId: string) {
        const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
        if (error) throw error;
        return (data ?? []).map((r: { role: string }) => r.role);
      },
      async isRecorded(sid: string, userId: string) {
        const { data, error } = await supabase.from("session_second_factor")
          .select("session_id").eq("session_id", sid).eq("user_id", userId).maybeSingle();
        if (error) throw error;
        return !!data;
      },
      isTrustedDevice: (userId: string, fp: string, at: Date) => isTrustedDevice(supabase, userId, fp, at),
      record: (sid: string, userId: string, method: "code" | "passkey" | "device") =>
        recordSecondFactor(supabase, sid, userId, method),
    };

    try {
      if (action === "status") {
        return json(200, await secondFactorStatus(deps, { userId: user.id, sessionId }));
      }

      if (action === "check") {
        const email = user.email;
        return json(200, await checkSecondFactor({
          ...deps,
          sendCode: () => email
            ? sendStepUp({
              store: steps,
              draw: () => crypto.getRandomValues(new Uint32Array(1))[0],
              hash: sha256Hex,
              email: (code) => sendAccountEmail(supabase, {
                to: email,
                subject: "رمز التحقق لتسجيل الدخول - SightB",
                label: "otp",
                html: accountMail("رمز التحقق", `<p style="color: #555;">رمز التحقق الخاص بك لتسجيل الدخول:</p>
  <div style="background: #f0f4ff; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0; border: 1px solid #d0d8ff;">
    <span style="font-size: 36px; font-weight: bold; letter-spacing: 10px; color: #1a1a1a;">${code}</span>
  </div>
  <p style="color: #888; font-size: 13px;">صالح عشر دقائق. إن لم تطلبه فكلمة مرورك في يد غيرك: غيّرها الآن، ولا تعطِ هذا الرمز لأحد.</p>`),
              }),
            }, user.id, now)
            : Promise.resolve({ sent: false }),
        }, { userId: user.id, sessionId, fingerprint: body.fingerprint }, now));
      }

      if (action === "verify") {
        return json(200, await verifySecondFactor({
          record: deps.record,
          verifyCode: (code, sid) => verifyStepUp({ store: steps, hash: sha256Hex }, user.id, { code, sessionId: sid }),
          trustDevice: (userId, fp, at) => trustDevice(supabase, userId, fp, at),
        }, { userId: user.id, sessionId, code: body.code, fingerprint: body.fingerprint }, now));
      }
    } catch (err) {
      // Before the owner applies the migration there is nothing to record into:
      // say so plainly, never let it look like the code was accepted.
      if (isMissingSchema(err)) {
        console.error("[second-factor] schema not applied yet", err);
        return json(200, { error: "التحقق بخطوتين غير متاح بعد. حاول بعد قليل.", unavailable: true });
      }
      throw err;
    }

    return json(400, { error: "إجراء غير معروف" });
  } catch (err) {
    console.error("[second-factor]", err);
    return json(500, { error: "حدث خطأ غير متوقع" });
  }
});
