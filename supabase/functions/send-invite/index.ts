import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { htmlToPlainText } from "../_shared/email-text.ts";

const ALLOWED_ORIGINS = [
  "https://sightb.lovable.app",
  "https://sight.basserh.com",
  "http://localhost:5173",
  "http://localhost:8080",
];

function getAllowedOrigin(req: Request) {
  const origin = req.headers.get("origin") || "";
  const isAllowed = ALLOWED_ORIGINS.includes(origin) || origin.endsWith(".lovable.app") || origin.endsWith(".lovableproject.com");
  return isAllowed ? origin : ALLOWED_ORIGINS[0];
}

function getCorsHeaders(req: Request) {
  const allowedOrigin = getAllowedOrigin(req);
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

const SENDER_DOMAIN = "notify.sight.basserh.com";
const FROM_DOMAIN = "sight.basserh.com";
const FROM_ADDRESS = `SightB <noreply@${FROM_DOMAIN}>`;

function buildInviteEmailHtml(resetLink: string, roleLabel: string): string {
  return `
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
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    console.log("[send-invite] Starting. URL:", !!supabaseUrl, "Key:", !!serviceRoleKey);
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

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

    const { email, role, scope_type, scope_id, resend, invite_id } = await req.json();
    console.log("[send-invite] Inviting:", email, "role:", role);

    if (!email || typeof email !== "string" || !email.includes("@") || email.length > 255) {
      return new Response(JSON.stringify({ error: "البريد الإلكتروني غير صالح" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validRoles = ["admin", "editor", "viewer"];
    const validScopes = ["system", "company", "project"];
    const safeRole = validRoles.includes(role) ? role : "viewer";
    const safeScopeType = validScopes.includes(scope_type) ? scope_type : "system";

    const normalizedEmail = email.toLowerCase().trim();

    // 1. Save or reuse the invite record
    let inviteRecord: { id: string } | null = null;
    let inviteError: { message?: string } | null = null;

    if (resend && invite_id) {
      const { data, error } = await supabaseAdmin
        .from("user_invites")
        .update({
          email: normalizedEmail,
          role: safeRole,
          scope_type: safeScopeType,
          scope_id: safeScopeType === "system" ? null : scope_id || null,
          invited_by: user.id,
          status: "pending",
        })
        .eq("id", invite_id)
        .select("id")
        .single();

      inviteRecord = data;
      inviteError = error;
    } else {
      const { data, error } = await supabaseAdmin
        .from("user_invites")
        .insert({
          email: normalizedEmail,
          role: safeRole,
          scope_type: safeScopeType,
          scope_id: safeScopeType === "system" ? null : scope_id || null,
          invited_by: user.id,
        })
        .select("id")
        .single();

      inviteRecord = data;
      inviteError = error;
    }

    if (inviteError) {
      console.error("[send-invite] Insert error:", JSON.stringify(inviteError));
      return new Response(
        JSON.stringify({ error: "حدث خطأ في حفظ الدعوة" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Check if user already exists in auth
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === normalizedEmail
    );

    const sendInviteEmail = async () => {
      const redirectUrl = `${getAllowedOrigin(req)}/reset-password`;

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

      const roleLabel = safeRole === "admin" ? "مدير النظام" : safeRole === "editor" ? "محرر" : "مشاهد";
      const emailHtml = buildInviteEmailHtml(resetLink, roleLabel);
      const emailText = htmlToPlainText(emailHtml);
      const messageId = crypto.randomUUID();

      const emailPayload = {
        to: normalizedEmail,
        from: FROM_ADDRESS,
        sender_domain: SENDER_DOMAIN,
        subject: "دعوة للانضمام إلى SightB - نظام إدارة المشاريع",
        html: emailHtml,
        text: emailText,
        purpose: "auth",
        label: "invite",
        idempotency_key: `invite-${normalizedEmail}-${Date.now()}`,
        message_id: messageId,
        queued_at: new Date().toISOString(),
        invite_id: inviteRecord?.id ?? null,
        metadata: {
          type: "invite",
          invite_id: inviteRecord?.id ?? null,
          role: safeRole,
          scope_type: safeScopeType,
          scope_id: safeScopeType === "system" ? null : scope_id || null,
        },
      };

      const { data: queueResult, error: queueError } = await supabaseAdmin.rpc("enqueue_email", {
        queue_name: "auth_emails",
        payload: emailPayload,
      });

      const emailQueued = !queueError;
      console.log("[send-invite] Email enqueued:", emailQueued, "error:", queueError?.message, "msgId:", queueResult);

      await supabaseAdmin.from("email_send_log").insert({
        message_id: messageId,
        recipient_email: normalizedEmail,
        template_name: "invite",
        status: emailQueued ? "pending" : "failed",
        error_message: queueError?.message || null,
        metadata: {
          invite_id: inviteRecord?.id ?? null,
          role: safeRole,
          scope_type: safeScopeType,
          scope_id: safeScopeType === "system" ? null : scope_id || null,
        },
      });

      if (inviteRecord?.id) {
        await supabaseAdmin
          .from("user_invites")
          .update({ status: emailQueued ? "pending" : "failed" })
          .eq("id", inviteRecord.id);
      }

      return {
        emailQueued,
        queueError,
      };
    };

    if (existingUser) {
      console.log("[send-invite] User exists:", existingUser.id);

      const { data: existingRoles } = await supabaseAdmin
        .from("user_roles")
        .select("id, scope_id")
        .eq("user_id", existingUser.id)
        .eq("role", safeRole)
        .eq("scope_type", safeScopeType);

      const targetScopeId = safeScopeType === "system" ? null : scope_id || null;
      const alreadyHasRole = (existingRoles ?? []).some((existingRole) =>
        safeScopeType === "system"
          ? true
          : (existingRole.scope_id ?? null) === targetScopeId
      );

      if (!alreadyHasRole) {
        await supabaseAdmin.from("user_roles").insert({
          user_id: existingUser.id,
          role: safeRole,
          scope_type: safeScopeType,
          scope_id: safeScopeType === "system" ? null : scope_id || null,
        });
      }

      await supabaseAdmin.from("profiles").upsert({
        id: existingUser.id,
        email: normalizedEmail,
        full_name: existingUser.user_metadata?.full_name || "",
        status: "active",
      }, { onConflict: "id" });

      const { emailQueued, queueError } = await sendInviteEmail();

      return new Response(
        JSON.stringify({
          success: true,
          message: emailQueued
            ? "المستخدم موجود بالفعل، تم منحه الصلاحيات وتجهيز رابط الدخول للإرسال"
            : "المستخدم موجود بالفعل، تم منحه الصلاحيات لكن تعذر إرسال البريد",
          existingUser: true,
          emailSent: emailQueued,
          errorDetail: queueError?.message || null,
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
        invited_role: safeRole,
        invited_scope_type: safeScopeType,
        invited_scope_id: scope_id,
      },
    });

    if (createError) {
      console.error("[send-invite] Create user error:", createError.message);
      return new Response(
        JSON.stringify({ error: "خطأ في إنشاء المستخدم" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[send-invite] User created:", newUser.user?.id);

    const { emailQueued, queueError } = await sendInviteEmail();

    return new Response(
      JSON.stringify({
        success: true,
        message: emailQueued
          ? "تم تجهيز الدعوة للإرسال بنجاح"
          : "تم إنشاء الحساب ولكن لم يتم إرسال البريد",
        emailSent: emailQueued,
        errorDetail: queueError?.message || null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const corsHeaders = getCorsHeaders(req);
    console.error("[send-invite] Unhandled error:", err?.message || err);
    return new Response(JSON.stringify({ error: "حدث خطأ" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
