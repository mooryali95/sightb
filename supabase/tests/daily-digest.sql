-- ============================================================================
-- The morning digest: only the service role reads it, it counts what waits,
-- and it goes to owners and system admins at their sign-in address.
-- Self-contained, rolled back; counts are compared before and after the
-- fixtures, so rows already in the database do not matter.
--   1. a signed-in user cannot call the digest functions;
--   2. the payload counts pending expenses by project, waiting payment
--      requests, unacknowledged funds and the last day's errors;
--   3. recipients are owners and system admins, read from auth.users, not
--      a project admin, not an editor, and not an edited profiles.email;
--   4. only the stored token passes.
-- Run: psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/daily-digest.sql
-- ============================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"f4000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
CREATE TEMP TABLE before_payload AS SELECT public.digest_payload() AS p;

INSERT INTO auth.users (id, email) VALUES
  ('f4000000-0000-4000-8000-0000000000d1', 'dg-owner@test'),
  ('f4000000-0000-4000-8000-0000000000a1', 'dg-admin@test'),
  ('f4000000-0000-4000-8000-0000000000a2', 'dg-project-admin@test'),
  ('f4000000-0000-4000-8000-0000000000e1', 'dg-editor@test')
ON CONFLICT (id) DO NOTHING;
UPDATE public.profiles SET email = 'attacker@evil.test' WHERE id = 'f4000000-0000-4000-8000-0000000000a1';
INSERT INTO public.companies (id, user_id, name) VALUES ('f4000000-0000-4000-8000-00000000c001', 'f4000000-0000-4000-8000-0000000000d1', 'شركة الملخص');
INSERT INTO public.projects (id, user_id, company_id, name, currency) VALUES
  ('f4000000-0000-4000-8000-00000000b001', 'f4000000-0000-4000-8000-0000000000d1', 'f4000000-0000-4000-8000-00000000c001', 'مشروع الملخص', 'SAR');
INSERT INTO public.user_roles (user_id, role, scope_type, scope_id) VALUES
  ('f4000000-0000-4000-8000-0000000000d1', 'owner', 'system', NULL),
  ('f4000000-0000-4000-8000-0000000000a1', 'admin', 'system', NULL),
  ('f4000000-0000-4000-8000-0000000000a2', 'admin', 'project', 'f4000000-0000-4000-8000-00000000b001'),
  ('f4000000-0000-4000-8000-0000000000e1', 'editor', 'system', NULL);
INSERT INTO public.expenses (user_id, project_id, category, description, amount, date, month, approval_status, is_vat_exempt) VALUES
  ('f4000000-0000-4000-8000-0000000000e1', 'f4000000-0000-4000-8000-00000000b001', 'other', 'معلّق ١', 100.10, '2026-11-01', 1, 'pending', true),
  ('f4000000-0000-4000-8000-0000000000e1', 'f4000000-0000-4000-8000-00000000b001', 'other', 'معلّق ٢', 200.20, '2026-11-01', 1, 'pending', true),
  ('f4000000-0000-4000-8000-0000000000e1', 'f4000000-0000-4000-8000-00000000b001', 'other', 'معتمد', 999, '2026-11-01', 1, 'approved', true);
INSERT INTO public.project_funds (project_id, fund_number, amount, transfer_date, created_by, status) VALUES
  ('f4000000-0000-4000-8000-00000000b001', 1, 5000, '2026-11-01', 'f4000000-0000-4000-8000-0000000000d1', 'transferred');
INSERT INTO public.client_errors (user_id, fingerprint, scope, message, occurrences) VALUES
  ('f4000000-0000-4000-8000-0000000000e1', 'dg:1', 's', 'm', 3),
  ('f4000000-0000-4000-8000-0000000000e1', 'dg:2', 's', 'm', 1);
INSERT INTO public.client_errors (user_id, fingerprint, scope, message, occurrences, last_seen) VALUES
  ('f4000000-0000-4000-8000-0000000000e1', 'dg:old', 's', 'm', 9, now() - interval '3 days');

DO $$
DECLARE r text; p jsonb; b jsonb; proj jsonb;
BEGIN
  -- 1. Not for signed-in users.
  FOREACH r IN ARRAY ARRAY['SELECT public.digest_payload()', 'SELECT * FROM public.digest_recipients()', $q$SELECT public.digest_token_ok('x')$q$] LOOP
    BEGIN
      EXECUTE 'SET LOCAL ROLE authenticated';
      EXECUTE r;
      EXECUTE 'RESET ROLE';
      RAISE EXCEPTION 'case 1: a signed-in user ran %', r;
    EXCEPTION WHEN insufficient_privilege THEN
      EXECUTE 'RESET ROLE';
    END;
  END LOOP;

  -- 2. What waits.
  p := public.digest_payload();
  SELECT before_payload.p INTO b FROM before_payload;
  SELECT x INTO proj FROM jsonb_array_elements(p->'pending_expenses') x WHERE x->>'name' = 'مشروع الملخص';
  IF proj IS NULL OR (proj->>'count')::int <> 2 OR (proj->>'total')::numeric <> 300.30 THEN
    RAISE EXCEPTION 'case 2: pending expenses for the project read %', proj;
  END IF;
  IF (p->>'funds_unacknowledged')::int - (b->>'funds_unacknowledged')::int <> 1 THEN RAISE EXCEPTION 'case 2: unacknowledged funds not counted'; END IF;
  IF (p->>'new_errors')::int - (b->>'new_errors')::int <> 2 THEN RAISE EXCEPTION 'case 2: new errors read %', p->>'new_errors'; END IF;
  IF (p->>'error_occurrences')::int - (b->>'error_occurrences')::int <> 4 THEN RAISE EXCEPTION 'case 2: error occurrences read %', p->>'error_occurrences'; END IF;

  -- 3. Recipients.
  IF NOT EXISTS (SELECT 1 FROM public.digest_recipients() WHERE email = 'dg-owner@test')
     OR NOT EXISTS (SELECT 1 FROM public.digest_recipients() WHERE email = 'dg-admin@test') THEN
    RAISE EXCEPTION 'case 3: an owner or system admin is missing';
  END IF;
  IF EXISTS (SELECT 1 FROM public.digest_recipients() WHERE email IN ('dg-project-admin@test', 'dg-editor@test', 'attacker@evil.test')) THEN
    RAISE EXCEPTION 'case 3: the digest goes to someone it should not';
  END IF;

  -- 4. The token.
  IF public.digest_token_ok('wrong') OR public.digest_token_ok(NULL) OR public.digest_token_ok('') THEN
    RAISE EXCEPTION 'case 4: a wrong token passed';
  END IF;
  IF NOT public.digest_token_ok((SELECT token FROM digest_internal.settings WHERE id = 1)) THEN
    RAISE EXCEPTION 'case 4: the stored token did not pass';
  END IF;

  RAISE NOTICE 'daily-digest: all 4 cases hold';
END $$;
ROLLBACK;
