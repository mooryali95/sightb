-- Errors the app meets in people's browsers, kept where the owner can read
-- them. Before this, a crash on someone's phone was seen by no one unless they
-- called: src/lib/logger.ts held the last 200 events in that tab's memory and
-- lost them on reload.
--
-- Nobody writes the table directly. The app calls report_client_error, which
-- counts a repeat of the same error by the same person on the same day on one
-- row instead of adding rows, caps each person at 100 distinct errors a day,
-- and drops rows older than 90 days. Only an owner reads it.

CREATE TABLE IF NOT EXISTS public.client_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  day date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Riyadh')::date,
  fingerprint text NOT NULL CHECK (char_length(fingerprint) BETWEEN 1 AND 64),
  scope text NOT NULL CHECK (char_length(scope) BETWEEN 1 AND 80),
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 1000),
  context jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(context::text) <= 4000),
  path text CHECK (char_length(path) <= 300),
  release text CHECK (char_length(release) <= 40),
  user_agent text CHECK (char_length(user_agent) <= 300),
  occurrences integer NOT NULL DEFAULT 1 CHECK (occurrences >= 1),
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, day, fingerprint)
);

CREATE INDEX IF NOT EXISTS client_errors_last_seen ON public.client_errors (last_seen DESC);

ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners read client errors" ON public.client_errors;
CREATE POLICY "Owners read client errors" ON public.client_errors FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::app_role));

DROP POLICY IF EXISTS second_factor ON public.client_errors;
CREATE POLICY second_factor ON public.client_errors AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.second_factor_ok())) WITH CHECK ((SELECT public.second_factor_ok()));

REVOKE ALL ON public.client_errors FROM anon;
GRANT SELECT ON public.client_errors TO authenticated;

CREATE OR REPLACE FUNCTION public.report_client_error(
  _fingerprint text,
  _scope text,
  _message text,
  _context jsonb DEFAULT '{}'::jsonb,
  _path text DEFAULT NULL,
  _release text DEFAULT NULL,
  _user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _today date := (now() AT TIME ZONE 'Asia/Riyadh')::date;
  _ctx jsonb := COALESCE(_context, '{}'::jsonb);
BEGIN
  PERFORM public.require_second_factor();
  IF _uid IS NULL THEN
    RETURN;
  END IF;
  IF octet_length(_ctx::text) > 4000 THEN
    _ctx := jsonb_build_object('truncated', true);
  END IF;

  UPDATE public.client_errors
     SET occurrences = occurrences + 1, last_seen = now()
   WHERE user_id = _uid AND day = _today AND fingerprint = left(_fingerprint, 64);
  IF FOUND THEN
    RETURN;
  END IF;

  -- A page stuck in a loop must not fill the table.
  IF (SELECT count(*) FROM public.client_errors WHERE user_id = _uid AND day = _today) >= 100 THEN
    RETURN;
  END IF;

  INSERT INTO public.client_errors (user_id, day, fingerprint, scope, message, context, path, release, user_agent)
  VALUES (_uid, _today, left(_fingerprint, 64), left(_scope, 80), left(_message, 1000), _ctx,
          left(_path, 300), left(_release, 40), left(_user_agent, 300))
  ON CONFLICT (user_id, day, fingerprint)
  DO UPDATE SET occurrences = public.client_errors.occurrences + 1, last_seen = now();

  DELETE FROM public.client_errors WHERE last_seen < now() - interval '90 days';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.report_client_error(text, text, text, jsonb, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_client_error(text, text, text, jsonb, text, text, text) TO authenticated, service_role;
