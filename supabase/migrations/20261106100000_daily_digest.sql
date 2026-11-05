-- A morning email to the owners and admins with what waits on them, so a
-- pending approval no longer sits unseen until someone opens the page.
--
-- Every morning at 08:00 Riyadh, pg_cron posts to the daily-digest edge
-- function. The call carries a random token kept in a schema the API does not
-- expose; the function checks it through digest_token_ok, so nobody without
-- database access can make it send. The function reads digest_payload and
-- emails only when something waits.
--
-- No key is stored: the token is generated here, and the function uses its own
-- service-role environment to check it.

CREATE SCHEMA IF NOT EXISTS digest_internal;
REVOKE ALL ON SCHEMA digest_internal FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS digest_internal.settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  function_url text NOT NULL
);
REVOKE ALL ON digest_internal.settings FROM PUBLIC, anon, authenticated;

INSERT INTO digest_internal.settings (id, function_url)
VALUES (1, 'https://krhvqowmhthokqvmnvxj.supabase.co/functions/v1/daily-digest')
ON CONFLICT (id) DO NOTHING;

-- Whether a call carries the digest token. Service role only.
CREATE OR REPLACE FUNCTION public.digest_token_ok(_token text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM digest_internal.settings WHERE id = 1 AND token = _token);
$function$;

-- What waits, as one JSON document. Service role only.
CREATE OR REPLACE FUNCTION public.digest_payload()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'pending_expenses', COALESCE((
      SELECT jsonb_agg(x ORDER BY x.total DESC) FROM (
        SELECT p.id, p.name, count(*)::int AS count, round(sum(e.amount)::numeric, 2) AS total
          FROM public.expenses e JOIN public.projects p ON p.id = e.project_id
         WHERE e.approval_status = 'pending'
         GROUP BY p.id, p.name
      ) x), '[]'::jsonb),
    'payment_requests', (SELECT count(*)::int FROM public.payment_requests WHERE status IN ('submitted', 'under_review')),
    'funds_unacknowledged', (SELECT count(*)::int FROM public.project_funds WHERE status = 'transferred'),
    'new_errors', (SELECT count(DISTINCT fingerprint)::int FROM public.client_errors WHERE last_seen > now() - interval '24 hours'),
    'error_occurrences', (SELECT COALESCE(sum(occurrences), 0)::int FROM public.client_errors WHERE last_seen > now() - interval '24 hours')
  );
$function$;

-- Who receives it: everyone holding the owner or a system-wide admin role.
-- Their sign-in email comes from auth.users, never profiles.email, which the
-- user can edit.
CREATE OR REPLACE FUNCTION public.digest_recipients()
RETURNS TABLE (email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT DISTINCT u.email::text
    FROM public.user_roles r JOIN auth.users u ON u.id = r.user_id
   WHERE (r.role = 'owner'::app_role OR (r.role = 'admin'::app_role AND r.scope_type = 'system'))
     AND u.email IS NOT NULL;
$function$;

REVOKE EXECUTE ON FUNCTION public.digest_token_ok(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.digest_payload() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.digest_recipients() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.digest_token_ok(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.digest_payload() TO service_role;
GRANT EXECUTE ON FUNCTION public.digest_recipients() TO service_role;

-- 05:00 UTC is 08:00 in Riyadh. Skipped where pg_cron is not installed (a
-- local test database); the live project has it.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed: daily-digest not scheduled';
    RETURN;
  END IF;
  PERFORM cron.unschedule('daily-digest') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-digest');
  PERFORM cron.schedule('daily-digest', '0 5 * * *', $job$
    SELECT net.http_post(
      url := (SELECT function_url FROM digest_internal.settings WHERE id = 1),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-digest-token', (SELECT token FROM digest_internal.settings WHERE id = 1)),
      body := '{}'::jsonb
    );
  $job$);
END $$;
