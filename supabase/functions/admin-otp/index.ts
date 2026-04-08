import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://sightb.lovable.app",
  "https://sight.basserh.com",
  "http://localhost:5173",
  "http://localhost:8080",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const isAllowed = ALLOWED_ORIGINS.includes(origin) || origin.endsWith(".lovable.app") || origin.endsWith(".lovableproject.com");
  const allowedOrigin = isAllowed ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

const MAX_OTP_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MINUTES = 10;

async function sendViaResend(to: string, subject: string, html: string) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    console.error("[admin-otp] RESEND_API_KEY not set");
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendKey}`,
    },
    body: JSON.stringify({
      from: "SightB <noreply@notify.sight.basserh.com>",
      to: [to],
      subject,
      html,
    }),
  });
  const data = await res.json();
  console.log("[admin-otp] Resend response:", JSON.stringify(data));
  return res.ok;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, code, fingerprint } = await req.json();

    // Check if user has ANY role at all
    const { data: allRoles } = await supabase
      .from("user_roles")
      .select("id, role")
      .eq("user_id", user.id);

    const hasAnyRole = allRoles && allRoles.length > 0;

    if (!hasAnyRole) {
      // No roles at all — user is not authorized to use the system
      return new Response(JSON.stringify({ requiresOtp: false, noRoles: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user has any edit-capable role (owner, admin, editor)
    const canEditAnything = allRoles.some((r: any) =>
      ["owner", "admin", "editor"].includes(r.role)
    );

    if (!canEditAnything) {
      // Viewer — no OTP required
      return new Response(JSON.stringify({ requiresOtp: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "check") {
      if (fingerprint) {
        // Clean up expired devices for this user
        await supabase
          .from("trusted_devices")
          .delete()
          .eq("user_id", user.id)
          .lt("expires_at", new Date().toISOString());

        const { data: trusted } = await supabase
          .from("trusted_devices")
          .select("id")
          .eq("user_id", user.id)
          .eq("fingerprint", fingerprint)
          .gte("expires_at", new Date().toISOString())
          .maybeSingle();

        if (trusted) {
          return new Response(JSON.stringify({ requiresOtp: false }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Rate limiting: check recent OTP codes in the last N minutes
      const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("admin_otp_codes")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", windowStart);

      if ((count ?? 0) >= MAX_OTP_ATTEMPTS) {
        // Sign out the user to prevent session abuse
        await supabase.auth.admin.signOut(user.id);
        return new Response(
          JSON.stringify({ error: "تم تجاوز الحد الأقصى للمحاولات. يرجى المحاولة بعد 10 دقائق.", rateLimited: true }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const array = new Uint32Array(1);
      crypto.getRandomValues(array);
      const otpCode = String(100000 + (array[0] % 900000));
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await supabase
        .from("admin_otp_codes")
        .update({ used: true })
        .eq("user_id", user.id)
        .eq("used", false);

      await supabase.from("admin_otp_codes").insert({
        user_id: user.id,
        code: otpCode,
        expires_at: expiresAt.toISOString(),
      });

      const { data: profile } = await supabase
        .from("profiles")
        .select("email, full_name")
        .eq("id", user.id)
        .single();

      let emailSent = false;
      if (profile?.email) {
        const emailHtml = `
          <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px; background: #ffffff;">
            <div style="text-align: center; margin-bottom: 20px;">
              <h2 style="color: #1a1a1a;">رمز التحقق - SightB</h2>
            </div>
            <p style="color: #555;">مرحباً ${profile.full_name || ''},</p>
            <p style="color: #555;">رمز التحقق الخاص بك لتسجيل الدخول:</p>
            <div style="background: #f0f4ff; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0; border: 1px solid #d0d8ff;">
              <span style="font-size: 36px; font-weight: bold; letter-spacing: 10px; color: #1a1a1a;">${otpCode}</span>
            </div>
            <p style="color: #888; font-size: 13px;">هذا الرمز صالح لمدة 10 دقائق. إذا لم تطلب هذا الرمز، يرجى تجاهل هذا البريد.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="color: #aaa; font-size: 11px; text-align: center;">SightB - نظام إدارة المشاريع المالية</p>
          </div>
        `;
        emailSent = await sendViaResend(profile.email, 'رمز التحقق لتسجيل الدخول - SightB', emailHtml);
        console.log("[admin-otp] Email sent:", emailSent, "to:", profile.email);
      }

      return new Response(
        JSON.stringify({ requiresOtp: true, sent: emailSent }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "verify") {
      if (!code) {
        return new Response(
          JSON.stringify({ verified: false, error: "الرمز مطلوب" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Rate limiting on verify attempts too
      const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("admin_otp_codes")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", windowStart);

      if ((count ?? 0) >= MAX_OTP_ATTEMPTS * 2) {
        await supabase.auth.admin.signOut(user.id);
        return new Response(
          JSON.stringify({ verified: false, error: "تم تجاوز الحد الأقصى للمحاولات.", rateLimited: true }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Find the latest unused, unexpired OTP for this user (regardless of code match)
      const { data: latestOtp } = await supabase
        .from("admin_otp_codes")
        .select("*")
        .eq("user_id", user.id)
        .eq("used", false)
        .gte("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!latestOtp) {
        return new Response(
          JSON.stringify({ verified: false, error: "الرمز غير صحيح أو منتهي الصلاحية" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const MAX_FAILED_ATTEMPTS = 5;

      // Check if too many failed attempts on this code
      if (latestOtp.failed_attempts >= MAX_FAILED_ATTEMPTS) {
        await supabase
          .from("admin_otp_codes")
          .update({ used: true })
          .eq("id", latestOtp.id);
        return new Response(
          JSON.stringify({ verified: false, error: "تم تجاوز عدد المحاولات لهذا الرمز. اطلب رمزاً جديداً." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if code matches
      if (latestOtp.code !== code) {
        await supabase
          .from("admin_otp_codes")
          .update({ failed_attempts: (latestOtp.failed_attempts || 0) + 1 })
          .eq("id", latestOtp.id);
        return new Response(
          JSON.stringify({ verified: false, error: "الرمز غير صحيح أو منتهي الصلاحية" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Code matches — mark as used
      await supabase
        .from("admin_otp_codes")
        .update({ used: true })
        .eq("id", latestOtp.id);

      if (fingerprint) {
        await supabase.from("trusted_devices").upsert(
          {
            user_id: user.id,
            fingerprint,
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          },
          { onConflict: "user_id,fingerprint" }
        );
      }

      return new Response(
        JSON.stringify({ verified: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const corsHeaders = getCorsHeaders(req);
    console.error("[admin-otp] Error:", err);
    return new Response(
      JSON.stringify({ error: "حدث خطأ" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
