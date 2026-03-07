import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
      from: "SightB <onboarding@resend.dev>",
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

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });

    if (!isAdmin) {
      return new Response(JSON.stringify({ requiresOtp: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "check") {
      if (fingerprint) {
        const { data: trusted } = await supabase
          .from("trusted_devices")
          .select("id")
          .eq("user_id", user.id)
          .eq("fingerprint", fingerprint)
          .maybeSingle();

        if (trusted) {
          return new Response(JSON.stringify({ requiresOtp: false }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
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
        emailSent = await sendViaResend(profile.email, `رمز التحقق: ${otpCode} - SightB`, emailHtml);
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

      const { data: otpRecord } = await supabase
        .from("admin_otp_codes")
        .select("*")
        .eq("user_id", user.id)
        .eq("code", code)
        .eq("used", false)
        .gte("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!otpRecord) {
        return new Response(
          JSON.stringify({ verified: false, error: "الرمز غير صحيح أو منتهي الصلاحية" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await supabase
        .from("admin_otp_codes")
        .update({ used: true })
        .eq("id", otpRecord.id);

      if (fingerprint) {
        await supabase.from("trusted_devices").upsert(
          { user_id: user.id, fingerprint },
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
    console.error("[admin-otp] Error:", err);
    return new Response(
      JSON.stringify({ error: "حدث خطأ" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
