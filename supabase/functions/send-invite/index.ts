import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function sendViaResend(to: string, subject: string, html: string) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    console.error("[send-invite] RESEND_API_KEY not set");
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }
  console.log("[send-invite] Sending via Resend to:", to);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendKey}`,
    },
    body: JSON.stringify({
      from: "SightB <noreply@basserh.com>",
      to: [to],
      subject,
      html,
    }),
  });
  const data = await res.json();
  console.log("[send-invite] Resend response:", res.status, JSON.stringify(data));
  return { ok: res.ok, data, error: res.ok ? null : JSON.stringify(data) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    console.log("[send-invite] Starting. URL:", !!supabaseUrl, "Key:", !!serviceRoleKey);
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Verify the calling user is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !user) {
      console.log("[send-invite] Auth failed:", userError?.message);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the user is an admin
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, role, scope_type, scope_id } = await req.json();
    console.log("[send-invite] Inviting:", email, "role:", role);

    if (!email) {
      return new Response(JSON.stringify({ error: "البريد الإلكتروني مطلوب" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 1. Save the invite record
    const { error: inviteError } = await supabaseAdmin
      .from("user_invites")
      .insert({
        email: normalizedEmail,
        role: role || "viewer",
        scope_type: scope_type || "system",
        scope_id: scope_type === "system" ? null : scope_id || null,
        invited_by: user.id,
      });

    if (inviteError) {
      console.error("[send-invite] Insert error:", JSON.stringify(inviteError));
      return new Response(
        JSON.stringify({ error: "حدث خطأ في حفظ الدعوة" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === normalizedEmail
    );

    if (existingUser) {
      console.log("[send-invite] User exists:", existingUser.id);
      await supabaseAdmin.from("user_roles").insert({
        user_id: existingUser.id,
        role: role || "viewer",
        scope_type: scope_type || "system",
        scope_id: scope_type === "system" ? null : scope_id || null,
      });

      await supabaseAdmin
        .from("user_invites")
        .update({ status: "accepted" })
        .eq("email", normalizedEmail)
        .eq("status", "pending");

      return new Response(
        JSON.stringify({
          success: true,
          message: "المستخدم موجود بالفعل، تم منحه الصلاحيات مباشرة",
          existingUser: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Create user via admin API with a temporary password
    const tempPassword = crypto.randomUUID().slice(0, 16) + "Aa1!";
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        invited_role: role,
        invited_scope_type: scope_type,
        invited_scope_id: scope_id,
      },
    });

    if (createError) {
      console.error("[send-invite] Create user error:", createError.message);
      return new Response(
        JSON.stringify({ error: "خطأ في إنشاء المستخدم: " + createError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[send-invite] User created:", newUser.user?.id);

    // 4. Generate a password reset link so the user can set their own password
    const origin = req.headers.get("origin") || req.headers.get("referer") || "https://sightb.lovable.app";
    const redirectUrl = origin.replace(/\/$/, "") + "/reset-password";
    
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: normalizedEmail,
      options: { redirectTo: redirectUrl },
    });

    let resetLink = redirectUrl;
    if (linkData?.properties?.action_link) {
      resetLink = linkData.properties.action_link;
    }
    console.log("[send-invite] Reset link generated:", !!linkData, "error:", linkError?.message);

    // 5. Send invitation email via Resend
    const roleLabel = role === "admin" ? "مدير النظام" : role === "editor" ? "محرر" : "مشاهد";
    const emailHtml = `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #1a1a1a; margin: 0;">دعوة للانضمام إلى SightB</h2>
          <p style="color: #888; margin-top: 8px;">نظام إدارة المشاريع المالية</p>
        </div>
        
        <div style="background: #f8f9fc; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
          <p style="color: #333; margin: 0 0 8px;">مرحباً،</p>
          <p style="color: #555; margin: 0;">تم دعوتك للانضمام إلى نظام <strong>SightB</strong> بصلاحية <strong>${roleLabel}</strong>.</p>
        </div>

        <p style="color: #555;">لتفعيل حسابك وتعيين كلمة المرور، اضغط على الزر أدناه:</p>
        
        <div style="text-align: center; margin: 28px 0;">
          <a href="${resetLink}" style="background: #2563eb; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block;">تفعيل الحساب</a>
        </div>

        <p style="color: #888; font-size: 13px;">أو انسخ الرابط التالي والصقه في متصفحك:</p>
        <p style="color: #2563eb; font-size: 12px; word-break: break-all;">${resetLink}</p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #aaa; font-size: 11px; text-align: center;">إذا لم تكن تتوقع هذه الدعوة، يمكنك تجاهل هذا البريد.</p>
      </div>
    `;

    const resendResult = await sendViaResend(
      normalizedEmail,
      "دعوة للانضمام إلى SightB - نظام إدارة المشاريع",
      emailHtml
    );

    console.log("[send-invite] Final result - emailSent:", resendResult.ok);

    return new Response(
      JSON.stringify({
        success: true,
        message: resendResult.ok 
          ? "تم إرسال الدعوة بنجاح" 
          : "تم إنشاء الحساب ولكن لم يتم إرسال البريد",
        emailSent: resendResult.ok,
        errorDetail: resendResult.error,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[send-invite] Unhandled error:", err?.message || err);
    return new Response(JSON.stringify({ error: "حدث خطأ" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
