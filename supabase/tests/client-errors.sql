-- ============================================================================
-- The error log: people report, only an owner reads, and a loop cannot flood
-- it. Self-contained, rolled back; each case raises with its name.
--   1. a repeat of the same error the same day is one row, counted twice;
--   2. a non-owner cannot read the log or write to it directly; an owner reads;
--   3. a session that has not passed the second factor records nothing;
--   4. one person is capped at 100 distinct errors a day;
--   5. an oversized context is replaced, not stored.
-- Run: psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/client-errors.sql
-- ============================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"f3000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
INSERT INTO auth.users (id, email) VALUES
  ('f3000000-0000-4000-8000-0000000000d1', 'err-owner@test'),
  ('f3000000-0000-4000-8000-0000000000e1', 'err-editor@test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role, scope_type, scope_id) VALUES
  ('f3000000-0000-4000-8000-0000000000d1', 'owner', 'system', NULL),
  ('f3000000-0000-4000-8000-0000000000e1', 'editor', 'system', NULL);
UPDATE public.second_factor_settings SET enforce = true WHERE id = 1;
INSERT INTO public.session_second_factor (session_id, user_id, method, verified_at)
SELECT u, u, 'code', now()
FROM unnest(ARRAY['f3000000-0000-4000-8000-0000000000d1','f3000000-0000-4000-8000-0000000000e1']::uuid[]) u
ON CONFLICT DO NOTHING;

-- Runs _sql as _uid in session _sid; returns 'ok' or the SQLSTATE it raised.
CREATE OR REPLACE FUNCTION pg_temp.as_user(_uid text, _sql text, _sid text DEFAULT NULL) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated', 'session_id', COALESCE(_sid, _uid))::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    EXECUTE _sql;
    EXECUTE 'RESET ROLE';
    RETURN 'ok';
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    RETURN SQLSTATE;
  END;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.count_as(_uid text, _sql text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated', 'session_id', _uid)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE _sql INTO n;
  EXECUTE 'RESET ROLE';
  RETURN n;
END $$;

DO $$
DECLARE r text; n bigint;
  editor text := 'f3000000-0000-4000-8000-0000000000e1';
  owner  text := 'f3000000-0000-4000-8000-0000000000d1';
  report text := $q$SELECT public.report_client_error('fp-1', 'ErrorBoundary', 'boom', '{"stack":"x"}'::jsonb, '/project/1', 'abc123', 'test')$q$;
BEGIN
  -- 1. Repeats are counted on one row.
  r := pg_temp.as_user(editor, report);
  IF r <> 'ok' THEN RAISE EXCEPTION 'case 1: reporting failed with %', r; END IF;
  PERFORM pg_temp.as_user(editor, report);
  SELECT count(*), max(occurrences) INTO n, r FROM public.client_errors WHERE user_id = editor::uuid;
  IF n <> 1 OR r <> '2' THEN RAISE EXCEPTION 'case 1: expected one row counted twice, got % rows, % occurrences', n, r; END IF;

  -- 2. Only an owner reads; nobody writes directly.
  IF pg_temp.count_as(editor, 'SELECT count(*) FROM public.client_errors') <> 0 THEN
    RAISE EXCEPTION 'case 2: an editor can read the error log';
  END IF;
  r := pg_temp.as_user(editor, $q$INSERT INTO public.client_errors (user_id, fingerprint, scope, message) VALUES ('f3000000-0000-4000-8000-0000000000d1', 'x', 'x', 'planted')$q$);
  IF r = 'ok' THEN RAISE EXCEPTION 'case 2: an editor wrote to the error log directly'; END IF;
  IF pg_temp.count_as(owner, 'SELECT count(*) FROM public.client_errors') <> 1 THEN
    RAISE EXCEPTION 'case 2: the owner cannot read the error log';
  END IF;

  -- 3. No second factor, no record.
  r := pg_temp.as_user(editor, $q$SELECT public.report_client_error('fp-unverified', 's', 'm')$q$, 'f3000000-0000-4000-8000-00000000ffff');
  IF r <> '42501' THEN RAISE EXCEPTION 'case 3: an unverified session was not refused (%)', r; END IF;
  IF EXISTS (SELECT 1 FROM public.client_errors WHERE fingerprint = 'fp-unverified') THEN
    RAISE EXCEPTION 'case 3: an unverified session recorded an error';
  END IF;

  -- 4. A cap of 100 distinct errors a day.
  FOR i IN 1..120 LOOP
    PERFORM pg_temp.as_user(editor, format($q$SELECT public.report_client_error('loop-%s', 's', 'm')$q$, i));
  END LOOP;
  SELECT count(*) INTO n FROM public.client_errors WHERE user_id = editor::uuid;
  IF n <> 100 THEN RAISE EXCEPTION 'case 4: expected the cap at 100 rows, got %', n; END IF;

  -- 5. Oversized context is replaced (the owner has room left).
  r := pg_temp.as_user(owner, format($q$SELECT public.report_client_error('big', 's', 'm', jsonb_build_object('blob', %L))$q$, repeat('x', 5000)));
  IF r <> 'ok' THEN RAISE EXCEPTION 'case 5: an oversized context failed the report (%)', r; END IF;
  IF (SELECT context FROM public.client_errors WHERE fingerprint = 'big') <> '{"truncated": true}'::jsonb THEN
    RAISE EXCEPTION 'case 5: an oversized context was stored as sent';
  END IF;

  RAISE NOTICE 'client-errors: all 5 cases hold';
END $$;
ROLLBACK;
