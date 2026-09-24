-- The login second factor, enforced by the database rather than the page.
--
-- Until now the emailed code was asked by the login page after
-- signInWithPassword had already opened a full session: typing the home
-- address during the code step, or calling the API directly, skipped it.
-- This records which sessions passed a second factor and lets row-level
-- security refuse the rest. It ships switched off (second_factor_settings);
-- the owner switches it on once sessions are seen being recorded.

-- 1. Sessions that passed: an emailed code, a passkey, or a trusted device.
--    Written only by the second-factor and passkeys functions (service role).
CREATE TABLE public.session_second_factor (
  session_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  method text NOT NULL CHECK (method IN ('code', 'passkey', 'device')),
  verified_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX session_second_factor_user_idx ON public.session_second_factor (user_id);
ALTER TABLE public.session_second_factor ENABLE ROW LEVEL SECURITY;

-- 2. A trusted device proves something only if its fingerprint is a secret
--    the device alone keeps. Users could read their own; nothing in the app
--    does (only the admin-otp, passkeys, second-factor and delete-user
--    functions, as the service role). Deleting one's own stays allowed.
DROP POLICY IF EXISTS "Users can view own trusted devices" ON public.trusted_devices;

-- 3. profiles.email is where admin-otp sends the login code, and a user could
--    change it through "Users can update own profile". It follows the sign-in
--    address now: only the service role and the database owner change it.
CREATE FUNCTION public.profiles_email_is_not_the_users_to_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email AND current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'لا يُغيَّر بريد الملف الشخصي من هنا؛ هو بريد الدخول نفسه'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_email_is_not_the_users_to_change
  BEFORE UPDATE OF email ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_email_is_not_the_users_to_change();

-- 4. The switch, one row, off until the owner turns it on.
CREATE TABLE public.second_factor_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enforce boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.second_factor_settings (id, enforce) VALUES (1, false);
ALTER TABLE public.second_factor_settings ENABLE ROW LEVEL SECURITY;

-- 5. Whether an account's roles call for the second factor: the same rule as
--    the login page's code, owner, admin or editor in any scope.
CREATE FUNCTION public.second_factor_required(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = p_user_id AND role IN ('owner', 'admin', 'editor')
  );
$$;

-- Whether the current request may proceed: yes without a signed-in user
-- (other policies decide), while the switch is off, for an account that
-- needs no second factor, or for a session recorded as having passed one.
CREATE FUNCTION public.second_factor_ok()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NULL
    OR NOT COALESCE((SELECT enforce FROM public.second_factor_settings WHERE id = 1), false)
    OR NOT public.second_factor_required(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.session_second_factor
       WHERE user_id = auth.uid()
         AND session_id::text = COALESCE(auth.jwt() ->> 'session_id', '')
    );
$$;

REVOKE ALL ON FUNCTION public.second_factor_required(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.second_factor_required(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.second_factor_ok() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.second_factor_ok() TO authenticated, service_role;

-- 6. A restrictive policy on every public table with row-level security, so
--    it narrows whatever the permissive policies allow; and on storage. Not on
--    user_roles: the app reads a user's own roles to know where to send them,
--    including to the code step. The (SELECT ...) is evaluated once per
--    statement, not per row.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
       AND c.relname <> 'user_roles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS second_factor ON public.%I', t.relname);
    EXECUTE format(
      'CREATE POLICY second_factor ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING ((SELECT public.second_factor_ok())) WITH CHECK ((SELECT public.second_factor_ok()))',
      t.relname);
  END LOOP;
END $$;

DROP POLICY IF EXISTS second_factor ON storage.objects;
CREATE POLICY second_factor ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.second_factor_ok())) WITH CHECK ((SELECT public.second_factor_ok()));
