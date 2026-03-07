import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    console.log("[send-invite] URL exists:", !!supabaseUrl, "Key exists:", !!serviceRoleKey);
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Verify the calling user is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.log("[send-invite] No auth header");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);
    
    console.log("[send-invite] User:", user?.id, "Error:", userError?.message);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the user is an admin
    const { data: isAdmin, error: roleError } = await supabaseAdmin.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    console.log("[send-invite] isAdmin:", isAdmin, "roleError:", roleError?.message);

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, role, scope_type, scope_id } = await req.json();
    console.log("[send-invite] Inviting:", email, "role:", role, "scope:", scope_type);

    if (!email) {
      return new Response(JSON.stringify({ error: "البريد الإلكتروني مطلوب" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Save the invite record
    const { error: inviteError } = await supabaseAdmin
      .from("user_invites")
      .insert({
        email: email.toLowerCase().trim(),
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
    console.log("[send-invite] Invite record saved");

    // 2. Check if user already exists
    const { data: existingUsers, error: listError } =
      await supabaseAdmin.auth.admin.listUsers();
    console.log("[send-invite] listUsers error:", listError?.message, "count:", existingUsers?.users?.length);
    
    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase().trim()
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
        .eq("email", email.toLowerCase().trim())
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

    // 3. Invite new user via Supabase Auth
    console.log("[send-invite] Calling inviteUserByEmail for:", email.trim());
    const origin = req.headers.get("origin") || req.headers.get("referer") || "https://sightb.lovable.app";
    const redirectUrl = origin.replace(/\/$/, "") + "/login";
    console.log("[send-invite] redirectTo:", redirectUrl);
    
    const { data: inviteData, error: authInviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email.trim(), {
        redirectTo: redirectUrl,
        data: {
          invited_role: role,
          invited_scope_type: scope_type,
          invited_scope_id: scope_id,
        },
      });

    console.log("[send-invite] inviteResult data:", JSON.stringify(inviteData));
    console.log("[send-invite] inviteResult error:", JSON.stringify(authInviteError));

    if (authInviteError) {
      console.error("[send-invite] Auth invite error:", authInviteError.message);
      return new Response(
        JSON.stringify({
          success: true,
          message: "تم حفظ الدعوة ولكن لم يتم إرسال البريد: " + authInviteError.message,
          emailSent: false,
          errorDetail: authInviteError.message,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[send-invite] SUCCESS - invite email sent to:", email);
    return new Response(
      JSON.stringify({
        success: true,
        message: "تم إرسال الدعوة بنجاح",
        emailSent: true,
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
