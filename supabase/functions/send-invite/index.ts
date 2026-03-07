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
    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
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
      console.error("[invite-insert]", inviteError);
      return new Response(
        JSON.stringify({ error: "حدث خطأ في حفظ الدعوة" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2. Check if user already exists
    const { data: existingUsers } =
      await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase().trim()
    );

    if (existingUser) {
      // User already has an account - assign the role directly
      await supabaseAdmin.from("user_roles").insert({
        user_id: existingUser.id,
        role: role || "viewer",
        scope_type: scope_type || "system",
        scope_id: scope_type === "system" ? null : scope_id || null,
      });

      // Mark invite as accepted
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

    // 3. Invite new user via Supabase Auth (sends an email automatically)
    const { data: inviteData, error: authInviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email.trim(), {
        redirectTo: `${req.headers.get("origin") || "https://sightb.lovable.app"}/login`,
        data: {
          invited_role: role,
          invited_scope_type: scope_type,
          invited_scope_id: scope_id,
        },
      });

    if (authInviteError) {
      console.error("[auth-invite]", authInviteError);
      // The invite record is still saved, so the user can still sign up manually
      return new Response(
        JSON.stringify({
          success: true,
          message: "تم حفظ الدعوة ولكن قد لا يصل البريد. يمكن للمستخدم التسجيل مباشرة.",
          emailSent: false,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "تم إرسال الدعوة بنجاح",
        emailSent: true,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[send-invite]", err);
    return new Response(JSON.stringify({ error: "حدث خطأ" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
