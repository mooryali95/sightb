/**
 * The morning digest. Called once a day by pg_cron (migration
 * 20261106100000_daily_digest.sql) with a token only the database holds;
 * anything else is refused. Reads what waits, and emails the owners and
 * system admins at their sign-in address when something does.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendAccountEmail } from "../_shared/account.ts";
import { digestHtml, digestSubject, hasNews, type DigestPayload } from "../_shared/digest.ts";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method" });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const token = req.headers.get("x-digest-token") ?? "";
  const { data: ok, error: tokenError } = await admin.rpc("digest_token_ok", { _token: token });
  if (tokenError || ok !== true) return json(401, { error: "unauthorized" });

  const { data: payload, error: payloadError } = await admin.rpc("digest_payload");
  if (payloadError) {
    console.error("[daily-digest] payload", payloadError.message);
    return json(500, { error: "payload" });
  }
  const p = payload as DigestPayload;
  if (!hasNews(p)) return json(200, { sent: 0, reason: "nothing waits" });

  const { data: recipients, error: recipientsError } = await admin.rpc("digest_recipients");
  if (recipientsError) {
    console.error("[daily-digest] recipients", recipientsError.message);
    return json(500, { error: "recipients" });
  }

  const html = digestHtml(p);
  const subject = digestSubject(p);
  let sent = 0;
  for (const r of (recipients ?? []) as { email: string }[]) {
    if (await sendAccountEmail(admin, { to: r.email, subject, html, label: "daily-digest" })) sent += 1;
  }
  return json(200, { sent });
});
