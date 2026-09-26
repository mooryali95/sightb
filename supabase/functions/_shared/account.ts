/**
 * What the passkeys and second-factor functions share on the Deno side: the
 * account emails, the emailed-code store, device trust and CORS. Kept out of
 * the unit-tested modules because it imports Deno and npm libraries.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendLovableEmail, EmailAPIError } from "npm:@lovable.dev/email-js@0.1.0";
import { htmlToPlainText } from "./email-text.ts";
import { ALLOWED_ORIGINS, isAllowedOrigin } from "./passkeys.ts";
import { STEP_UP_DAY_MS, type StepUpStore } from "./passkeyGate.ts";

export const TRUSTED_DEVICE_DAYS = 30;

export function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

const SENDER_DOMAIN = "notify.sight.basserh.com";
const FROM_ADDRESS = "SightB <noreply@sight.basserh.com>";

/**
 * Sends an account email the way admin-otp sends the login code, and logs
 * it the same way. Never throws: a mail that could not go is reported as
 * false, and the caller decides whether that stops anything.
 */
export async function sendAccountEmail(
  supabase: SupabaseClient,
  mail: { to: string; subject: string; html: string; label: string },
): Promise<boolean> {
  let status: "sent" | "suppressed" | "failed" = "failed";
  let errorMessage: string | null = null;
  try {
    await sendLovableEmail(
      {
        to: mail.to,
        from: FROM_ADDRESS,
        sender_domain: SENDER_DOMAIN,
        subject: mail.subject,
        html: mail.html,
        text: htmlToPlainText(mail.html),
        purpose: "transactional",
        label: mail.label,
        idempotency_key: `${mail.label}-${crypto.randomUUID()}`,
      },
      { apiKey: Deno.env.get("LOVABLE_API_KEY")!, sendUrl: Deno.env.get("LOVABLE_SEND_URL") },
    );
    status = "sent";
  } catch (err) {
    if (err instanceof EmailAPIError && err.code === "recipient_suppressed") status = "suppressed";
    errorMessage = err instanceof Error ? err.message.slice(0, 1000) : String(err);
  }
  const { error } = await supabase.from("email_send_log").insert({
    recipient_email: mail.to,
    template_name: mail.label,
    status,
    error_message: errorMessage,
    metadata: { type: mail.label },
  });
  if (error) console.error("[passkeys] email log insert failed", error.message);
  return status === "sent";
}

export const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function accountMail(title: string, body: string): string {
  return `<div dir="rtl" style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px; background: #ffffff;">
  <h2 style="color: #1a1a1a; text-align: center;">${title}</h2>
  ${body}
  <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
  <p style="color: #aaa; font-size: 11px; text-align: center;">SightB - نظام إدارة المشاريع المالية</p>
</div>`;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function stepUpStore(supabase: SupabaseClient): StepUpStore {
  const table = () => supabase.from("passkey_step_up_codes");
  return {
    async countSince(userId, since) {
      const { count, error } = await table()
        .select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since.toISOString());
      if (error) throw error;
      return count ?? 0;
    },
    async insert(row) {
      // Rows older than two days count toward nothing any more.
      await table().delete().eq("user_id", row.user_id).lt("created_at", new Date(Date.now() - 2 * STEP_UP_DAY_MS).toISOString());
      const { error } = await table().insert(row);
      if (error) throw error;
    },
    async check(userId, codeHash, sessionId) {
      const { data, error } = await supabase.rpc("passkey_step_up_verify", {
        p_user_id: userId, p_code_hash: codeHash, p_session_id: sessionId,
      });
      if (error) throw error;
      return data as "ok" | "wrong" | "spent" | "none";
    },
    async hasGrant(userId, sessionId, since) {
      const { data, error } = await table().select("id")
        .eq("user_id", userId).eq("session_id", sessionId).gte("confirmed_at", since.toISOString()).is("consumed_at", null)
        .limit(1);
      if (error) throw error;
      return (data ?? []).length > 0;
    },
    // One statement, so two registrations racing for one grant cannot both use it.
    async consumeGrant(userId, sessionId, since) {
      const { data, error } = await table().update({ consumed_at: new Date().toISOString() })
        .eq("user_id", userId).eq("session_id", sessionId).gte("confirmed_at", since.toISOString()).is("consumed_at", null)
        .select("id");
      if (error) throw error;
      return (data ?? []).length > 0;
    },
  };
}

/**
 * Trusts a device for thirty days, as a correct code or passkey does. Written
 * twice: to second_factor_devices, the only trust the second factor honours,
 * and to trusted_devices, which admin-otp reads while it is still the
 * fallback. A second_factor_devices failure before its migration is applied
 * is logged, not fatal: nothing reads it until then.
 */
export async function trustDevice(supabase: SupabaseClient, userId: string, fingerprint: string, now: Date) {
  const expires_at = new Date(now.getTime() + TRUSTED_DEVICE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await supabase.from("trusted_devices").upsert(
    { user_id: userId, fingerprint, expires_at },
    { onConflict: "user_id,fingerprint" },
  );
  const { error } = await supabase.from("second_factor_devices").upsert(
    { user_id: userId, fingerprint_hash: await sha256Hex(fingerprint), expires_at },
    { onConflict: "user_id,fingerprint_hash" },
  );
  if (error) console.error("[account] second_factor_devices upsert failed", error.message);
}

/**
 * Whether this fingerprint is a device the user passed a second factor on,
 * through this code, in the last thirty days. Rows admin-otp wrote to
 * trusted_devices do not count.
 */
export async function isTrustedDevice(supabase: SupabaseClient, userId: string, fingerprint: string, now: Date) {
  const { data, error } = await supabase
    .from("second_factor_devices").select("user_id")
    .eq("user_id", userId).eq("fingerprint_hash", await sha256Hex(fingerprint)).gte("expires_at", now.toISOString())
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

/** Whether an emailed code for this user is still live and unused, so a new one need not be sent. */
export async function liveCodeExists(supabase: SupabaseClient, userId: string, now: Date) {
  const { data, error } = await supabase.from("passkey_step_up_codes").select("id")
    .eq("user_id", userId).is("used_at", null).gt("expires_at", now.toISOString()).limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

/**
 * The database's own rule, second_factor_ok, asked for a session the
 * function holds: through while enforcement is off, for an account whose
 * roles need no second factor, or for a session recorded as having passed.
 * Anything it cannot read counts as not through.
 */
export async function sessionPassedSecondFactor(supabase: SupabaseClient, userId: string, sessionId: string) {
  const { data: settings, error: settingsError } = await supabase
    .from("second_factor_settings").select("enforce").eq("id", 1).maybeSingle();
  if (settingsError) return isMissingRelation(settingsError);
  if (!settings?.enforce) return true;
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!(roles ?? []).some((r: { role: string }) => ["owner", "admin", "editor"].includes(r.role))) return true;
  if (!sessionId) return false;
  const { data } = await supabase.from("session_second_factor").select("session_id")
    .eq("session_id", sessionId).eq("user_id", userId).maybeSingle();
  return !!data;
}

/** Before its migration is applied, the settings table is simply not there: nothing is enforced yet. */
function isMissingRelation(error: { code?: string }) {
  return error.code === "PGRST205" || error.code === "42P01";
}

/** Records that a session passed the second factor; a later pass keeps the first method. */
export async function recordSecondFactor(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string,
  method: "code" | "passkey" | "device",
) {
  const { error } = await supabase.from("session_second_factor")
    .upsert({ session_id: sessionId, user_id: userId, method }, { onConflict: "session_id", ignoreDuplicates: true });
  if (error) throw error;
}
