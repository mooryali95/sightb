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

    // Check caller is admin
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { targetUserId } = await req.json();
    if (!targetUserId) {
      return new Response(JSON.stringify({ error: "targetUserId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prevent self-deletion
    if (targetUserId === user.id) {
      return new Response(JSON.stringify({ error: "لا يمكنك حذف حسابك الخاص" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prevent deleting owners (only another owner can delete an owner)
    const { data: targetIsOwner } = await supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", targetUserId)
      .eq("role", "owner")
      .eq("scope_type", "system")
      .limit(1);

    if (targetIsOwner && targetIsOwner.length > 0) {
      // Check if caller is also an owner
      const { data: callerIsOwner } = await supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", user.id)
        .eq("role", "owner")
        .eq("scope_type", "system")
        .limit(1);

      if (!callerIsOwner || callerIsOwner.length === 0) {
        return new Response(JSON.stringify({ error: "لا يمكن حذف حساب المالك" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Get user email before deletion for invite cleanup
    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", targetUserId)
      .single();

    // Delete roles, invites, profile, then auth user
    await supabase.from("user_roles").delete().eq("user_id", targetUserId);
    await supabase.from("trusted_devices").delete().eq("user_id", targetUserId);
    await supabase.from("admin_otp_codes").delete().eq("user_id", targetUserId);

    // Clean up invites for this email so re-invite works cleanly
    if (targetProfile?.email) {
      await supabase.from("user_invites").delete().eq("email", targetProfile.email);
    }

    await supabase.from("profiles").delete().eq("id", targetUserId);

    // Delete from auth
    const { error: deleteError } = await supabase.auth.admin.deleteUser(targetUserId);
    if (deleteError) {
      console.error("[delete-user] auth delete error:", deleteError);
      return new Response(JSON.stringify({ error: "فشل حذف الحساب" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[delete-user] Deleted user:", targetUserId, "by admin:", user.id);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const corsHeaders = getCorsHeaders(req);
    console.error("[delete-user] Error:", err);
    return new Response(
      JSON.stringify({ error: "حدث خطأ" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
