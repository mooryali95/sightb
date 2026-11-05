-- ============================================================================
-- Who may write a role. Self-contained, rolled back, no pgTAP needed:
-- each case raises with its name when it does not hold.
--   * an admin grants and changes roles (this failed with 42P17 before
--     20261104090000);
--   * an admin cannot grant the owner role; an owner can;
--   * an editor, a viewer and someone with no role cannot write a role.
-- Run: psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/roles.sql
-- ============================================================================
BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('f0000000-0000-4000-8000-0000000000a1', 'roles-admin@test'), ('f0000000-0000-4000-8000-0000000000e1', 'roles-editor@test'),
  ('f0000000-0000-4000-8000-0000000000b1', 'roles-viewer@test'), ('f0000000-0000-4000-8000-0000000000c1', 'roles-none@test'),
  ('f0000000-0000-4000-8000-0000000000d1', 'roles-owner@test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role, scope_type, scope_id) VALUES
  ('f0000000-0000-4000-8000-0000000000d1', 'owner', 'system', NULL),
  ('f0000000-0000-4000-8000-0000000000a1', 'admin', 'system', NULL),
  ('f0000000-0000-4000-8000-0000000000e1', 'editor', 'system', NULL),
  ('f0000000-0000-4000-8000-0000000000b1', 'viewer', 'system', NULL);

-- The server checks the second factor (20261105120000): each session here has passed it,
-- as a real sign-in does; its id is the person's own id.
INSERT INTO public.session_second_factor (session_id, user_id, method)
SELECT id, id, 'code' FROM auth.users WHERE email LIKE 'roles-%@test'
ON CONFLICT DO NOTHING;

CREATE FUNCTION pg_temp.as_user(_uid text, _sql text) RETURNS text LANGUAGE plpgsql AS $$
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

DO $$
DECLARE r text;
  ins text := 'INSERT INTO public.user_roles (user_id, role, scope_type, scope_id) VALUES (''f0000000-0000-4000-8000-0000000000c1'', ''%s'', ''system'', NULL)';
BEGIN
  r := pg_temp.as_user('f0000000-0000-4000-8000-0000000000a1', format(ins, 'viewer'));
  IF r <> 'ok' THEN RAISE EXCEPTION 'admin could not grant a role: %', r; END IF;
  r := pg_temp.as_user('f0000000-0000-4000-8000-0000000000a1', 'UPDATE public.user_roles SET role = ''editor'' WHERE user_id = ''f0000000-0000-4000-8000-0000000000c1''');
  IF r <> 'ok' THEN RAISE EXCEPTION 'admin could not change a role: %', r; END IF;
  r := pg_temp.as_user('f0000000-0000-4000-8000-0000000000a1', format(ins, 'owner'));
  IF r <> '42501' THEN RAISE EXCEPTION 'admin granted the owner role: %', r; END IF;
  r := pg_temp.as_user('f0000000-0000-4000-8000-0000000000d1', 'UPDATE public.user_roles SET role = ''owner'' WHERE user_id = ''f0000000-0000-4000-8000-0000000000a1''');
  IF r <> 'ok' THEN RAISE EXCEPTION 'owner could not grant the owner role: %', r; END IF;
  r := pg_temp.as_user('f0000000-0000-4000-8000-0000000000e1', format(ins, 'admin'));
  IF r <> '42501' THEN RAISE EXCEPTION 'an editor granted a role: %', r; END IF;
  r := pg_temp.as_user('f0000000-0000-4000-8000-0000000000b1', format(ins, 'admin'));
  IF r <> '42501' THEN RAISE EXCEPTION 'a viewer granted a role: %', r; END IF;
  r := pg_temp.as_user('f0000000-0000-4000-8000-0000000000c1', format(ins, 'owner'));
  IF r <> '42501' THEN RAISE EXCEPTION 'someone with no role granted one: %', r; END IF;
  RAISE NOTICE 'roles: all 7 cases hold';
END $$;

ROLLBACK;
