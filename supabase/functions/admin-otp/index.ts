/**
 * Retired on 6 November 2026. Every request is answered 410 and nothing is
 * sent or checked.
 *
 * The login page asks `second-factor`, which records the session the database
 * requires since the second factor became enforced (5 November 2026). This
 * function recorded nothing, so a session it passed could read nothing, and
 * it sent its code to `profiles.email`, a field the user edits, so the code
 * could be redirected. The folder stays so the deployed function is replaced
 * by this one rather than left running as it was; deleting the folder would
 * not undeploy it.
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  return new Response(JSON.stringify({ error: "retired", use: "second-factor" }), {
    status: 410,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
