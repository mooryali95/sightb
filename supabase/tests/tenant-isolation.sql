-- ============================================================================
-- Access follows the role a person holds now, never the row they once wrote,
-- and nobody below an owner can make or unmake an owner. Self-contained,
-- rolled back; each case raises with its name when it does not hold.
--   1. an editor of project B cannot move their own revenue into project A of
--      another company;
--   2. once their roles are removed, they no longer see or change it;
--   3. an admin cannot plant an owner invite, and handle_new_user grants no
--      owner role from an invite an owner did not send;
--   4. an admin cannot demote or remove an owner; an owner can;
--   5. the server-side second factor is enforced.
-- Run: psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/tenant-isolation.sql
-- ============================================================================
BEGIN;
-- The audit triggers record who wrote the fixtures.
SELECT set_config('request.jwt.claims', '{"sub":"f2000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);

INSERT INTO auth.users (id, email) VALUES
  ('f2000000-0000-4000-8000-0000000000d1', 'iso-owner@test'),
  ('f2000000-0000-4000-8000-0000000000d2', 'iso-owner2@test'),
  ('f2000000-0000-4000-8000-0000000000a1', 'iso-admin@test'),
  ('f2000000-0000-4000-8000-0000000000e1', 'iso-editor@test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.companies (id, user_id, name) VALUES
  ('f2000000-0000-4000-8000-00000000c0a1', 'f2000000-0000-4000-8000-0000000000d1', 'شركة أ'),
  ('f2000000-0000-4000-8000-00000000c0b1', 'f2000000-0000-4000-8000-0000000000d1', 'شركة ب');
INSERT INTO public.projects (id, user_id, company_id, name, currency) VALUES
  ('f2000000-0000-4000-8000-00000000b0a1', 'f2000000-0000-4000-8000-0000000000d1', 'f2000000-0000-4000-8000-00000000c0a1', 'مشروع أ', 'SAR'),
  ('f2000000-0000-4000-8000-00000000b0b1', 'f2000000-0000-4000-8000-0000000000d1', 'f2000000-0000-4000-8000-00000000c0b1', 'مشروع ب', 'SAR');
INSERT INTO public.user_roles (user_id, role, scope_type, scope_id) VALUES
  ('f2000000-0000-4000-8000-0000000000d1', 'owner', 'system', NULL),
  ('f2000000-0000-4000-8000-0000000000d2', 'owner', 'system', NULL),
  ('f2000000-0000-4000-8000-0000000000a1', 'admin', 'system', NULL),
  ('f2000000-0000-4000-8000-0000000000e1', 'editor', 'project', 'f2000000-0000-4000-8000-00000000b0b1');
INSERT INTO public.revenues (id, user_id, project_id, description, amount, date, month, status)
VALUES ('f2000000-0000-4000-8000-00000000f001', 'f2000000-0000-4000-8000-0000000000e1', 'f2000000-0000-4000-8000-00000000b0b1', 'إيراد', 100, '2026-11-05', 1, 'planned');
-- The second factor is not under test here (case 5 reads the switch): each person's session (its id is
-- their own id here) has passed it.
CREATE OR REPLACE FUNCTION pg_temp.as_user(_uid text, _sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated', 'session_id', _uid)::text, true);
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
INSERT INTO public.session_second_factor (session_id, user_id, method, verified_at)
SELECT u, u, 'code', now()
FROM unnest(ARRAY['f2000000-0000-4000-8000-0000000000d1','f2000000-0000-4000-8000-0000000000d2','f2000000-0000-4000-8000-0000000000a1','f2000000-0000-4000-8000-0000000000e1']::uuid[]) u
ON CONFLICT DO NOTHING;

DO $$
DECLARE r text; n bigint;
  editor text := 'f2000000-0000-4000-8000-0000000000e1';
  admin  text := 'f2000000-0000-4000-8000-0000000000a1';
  owner  text := 'f2000000-0000-4000-8000-0000000000d1';
BEGIN
  -- 1. Moving a row into a project one cannot edit.
  PERFORM pg_temp.as_user(editor, 'UPDATE public.revenues SET project_id = ''f2000000-0000-4000-8000-00000000b0a1'' WHERE id = ''f2000000-0000-4000-8000-00000000f001''');
  IF (SELECT project_id FROM public.revenues WHERE id = 'f2000000-0000-4000-8000-00000000f001') <> 'f2000000-0000-4000-8000-00000000b0b1' THEN
    RAISE EXCEPTION 'case 1: an editor moved a revenue into another company''s project';
  END IF;

  -- 2. Access ends with the role.
  DELETE FROM public.user_roles WHERE user_id = editor::uuid;
  n := pg_temp.count_as(editor, 'SELECT count(*) FROM public.revenues WHERE id = ''f2000000-0000-4000-8000-00000000f001''');
  IF n <> 0 THEN RAISE EXCEPTION 'case 2: a person with no role still sees the revenue they wrote'; END IF;
  PERFORM pg_temp.as_user(editor, 'UPDATE public.revenues SET amount = 999 WHERE id = ''f2000000-0000-4000-8000-00000000f001''');
  IF (SELECT amount FROM public.revenues WHERE id = 'f2000000-0000-4000-8000-00000000f001') <> 100 THEN
    RAISE EXCEPTION 'case 2: a person with no role still changed the revenue they wrote';
  END IF;

  -- 3. Owner invites.
  r := pg_temp.as_user(admin, 'INSERT INTO public.user_invites (email, role, scope_type, invited_by) VALUES (''planted@test'', ''owner'', ''system'', ''f2000000-0000-4000-8000-0000000000a1'')');
  IF r <> '42501' THEN RAISE EXCEPTION 'case 3: an admin planted an owner invite (%)', r; END IF;
  r := pg_temp.as_user(admin, 'INSERT INTO public.user_invites (email, role, scope_type, invited_by) VALUES (''new-viewer@test'', ''viewer'', ''system'', ''f2000000-0000-4000-8000-0000000000a1'')');
  IF r <> 'ok' THEN RAISE EXCEPTION 'case 3: an admin could not invite a viewer (%)', r; END IF;
  -- An owner invite written by an admin before this fix must not grant owner on sign-up.
  INSERT INTO public.user_invites (email, role, scope_type, invited_by) VALUES ('old-plant@test', 'owner', 'system', admin::uuid);
  INSERT INTO auth.users (id, email) VALUES ('f2000000-0000-4000-8000-0000000000f9', 'old-plant@test');
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = 'f2000000-0000-4000-8000-0000000000f9' AND role = 'owner') THEN
    RAISE EXCEPTION 'case 3: sign-up granted owner from an invite an admin wrote';
  END IF;
  -- An owner's own owner invite still works.
  r := pg_temp.as_user(owner, 'INSERT INTO public.user_invites (email, role, scope_type, invited_by) VALUES (''co-owner@test'', ''owner'', ''system'', ''f2000000-0000-4000-8000-0000000000d1'')');
  IF r <> 'ok' THEN RAISE EXCEPTION 'case 3: an owner could not invite an owner (%)', r; END IF;
  INSERT INTO auth.users (id, email) VALUES ('f2000000-0000-4000-8000-0000000000f8', 'co-owner@test');
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = 'f2000000-0000-4000-8000-0000000000f8' AND role = 'owner') THEN
    RAISE EXCEPTION 'case 3: an owner''s invite no longer grants owner';
  END IF;

  -- 4. Demoting an owner.
  PERFORM pg_temp.as_user(admin, 'UPDATE public.user_roles SET role = ''viewer'' WHERE user_id = ''f2000000-0000-4000-8000-0000000000d2''');
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = 'f2000000-0000-4000-8000-0000000000d2' AND role = 'owner') THEN
    RAISE EXCEPTION 'case 4: an admin demoted an owner';
  END IF;
  PERFORM pg_temp.as_user(admin, 'DELETE FROM public.user_roles WHERE user_id = ''f2000000-0000-4000-8000-0000000000d2''');
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = 'f2000000-0000-4000-8000-0000000000d2') THEN
    RAISE EXCEPTION 'case 4: an admin removed an owner';
  END IF;
  r := pg_temp.as_user(owner, 'UPDATE public.user_roles SET role = ''admin'' WHERE user_id = ''f2000000-0000-4000-8000-0000000000d2''');
  IF r <> 'ok' OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = 'f2000000-0000-4000-8000-0000000000d2' AND role = 'admin') THEN
    RAISE EXCEPTION 'case 4: an owner could not change another owner (%)', r;
  END IF;

  -- 5. The switch.
  IF NOT (SELECT enforce FROM public.second_factor_settings WHERE id = 1) THEN
    RAISE EXCEPTION 'case 5: the second factor is not enforced on the server';
  END IF;

  RAISE NOTICE 'tenant isolation: all 5 cases hold';
END $$;

ROLLBACK;
