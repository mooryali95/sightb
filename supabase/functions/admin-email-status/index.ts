import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireSecondFactor } from "../_shared/sessionGate.ts";

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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

function getInviteId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const inviteId = (metadata as Record<string, unknown>).invite_id;
  return typeof inviteId === "string" && inviteId.trim() ? inviteId : null;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // A password-only session may not act here: see ../_shared/sessionGate.ts.
    const refused = await requireSecondFactor(supabaseAdmin, token, user.id, corsHeaders);
    if (refused) return refused;

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

    const body = await req.json().catch(() => ({}));
    const emails = Array.isArray(body?.emails)
      ? body.emails.filter((email: unknown) => typeof email === "string" && email.includes("@")).map((email: string) => email.toLowerCase().trim())
      : [];

    let query = supabaseAdmin
      .from("email_send_log")
      .select("message_id, recipient_email, template_name, status, error_message, created_at, metadata")
      .eq("template_name", "invite")
      .order("created_at", { ascending: false })
      .limit(500);

    if (emails.length > 0) {
      query = query.in("recipient_email", emails);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[admin-email-status] Query failed", error);
      return new Response(JSON.stringify({ error: "Failed to load email status" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const seenKeys = new Set<string>();
    const items = [] as Array<{
      inviteId: string | null;
      email: string;
      status: string;
      errorMessage: string | null;
      createdAt: string;
      messageId: string | null;
    }>;

    for (const row of data ?? []) {
      const inviteId = getInviteId(row.metadata);
      const email = row.recipient_email.toLowerCase();
      const key = inviteId ? `invite:${inviteId}` : `email:${email}`;

      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      items.push({
        inviteId,
        email,
        status: row.status,
        errorMessage: row.error_message,
        createdAt: row.created_at,
        messageId: row.message_id,
      });
    }

    return new Response(JSON.stringify({ items }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[admin-email-status] Unhandled error", error);
    return new Response(JSON.stringify({ error: "حدث خطأ" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});