-- ============================================================================
-- Owner block, 5 November 2026: apply 20261105120000_access_follows_current_role
-- (merged in #158). Run once in Lovable Cloud's SQL editor; running it again
-- changes nothing. The last line is one verification row: every column must
-- read true, and creator_branches_left must read 0.
-- ============================================================================

-- 1. Drop the "wrote it" branch from every data policy that has it.
DO $$
DECLARE
  p record;
  new_using text;
  new_check text;
  creator constant text := '^\(\(auth\.uid\(\) = user_id\) OR ';
BEGIN
  FOR p IN
    SELECT tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename NOT IN ('audit_log', 'periodic_snapshots')
      AND (coalesce(qual, '') ~ creator OR coalesce(with_check, '') ~ creator)
  LOOP
    new_using := CASE WHEN p.qual ~ creator THEN regexp_replace(p.qual, creator, '(') END;
    new_check := CASE WHEN p.with_check ~ creator THEN regexp_replace(p.with_check, creator, '(') END;
    EXECUTE format('ALTER POLICY %I ON public.%I%s%s', p.policyname, p.tablename,
      CASE WHEN new_using IS NOT NULL THEN format(' USING %s', new_using) ELSE '' END,
      CASE WHEN new_check IS NOT NULL THEN format(' WITH CHECK %s', new_check) ELSE '' END);
  END LOOP;
END $$;

-- 2. Owner invites are an owner's.
DROP POLICY IF EXISTS "Admins can manage invites" ON public.user_invites;
CREATE POLICY "Admins can manage invites" ON public.user_invites FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
    AND (role <> 'owner'::app_role OR public.has_role(auth.uid(), 'owner'::app_role)))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role)
    AND (role <> 'owner'::app_role OR public.has_role(auth.uid(), 'owner'::app_role)));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _invite RECORD;
BEGIN
  INSERT INTO public.profiles (id, email, full_name, status)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), 'active')
  ON CONFLICT (id) DO NOTHING;

  FOR _invite IN SELECT * FROM public.user_invites WHERE email = NEW.email AND status = 'pending'
  LOOP
    -- An owner invite counts only when an owner sent it.
    IF _invite.role = 'owner'::app_role AND NOT public.has_role(_invite.invited_by, 'owner'::app_role) THEN
      UPDATE public.user_invites SET status = 'rejected' WHERE id = _invite.id;
      CONTINUE;
    END IF;
    INSERT INTO public.user_roles (user_id, role, scope_type, scope_id)
    VALUES (NEW.id, _invite.role, _invite.scope_type, _invite.scope_id)
    ON CONFLICT DO NOTHING;
    UPDATE public.user_invites SET status = 'accepted' WHERE id = _invite.id;
  END LOOP;

  RETURN NEW;
END;
$function$;

-- 3. An owner's role row is an owner's to change.
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
CREATE POLICY "Admins can manage all roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
    AND (role <> 'owner'::app_role OR public.has_role(auth.uid(), 'owner'::app_role)))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role)
    AND (public.has_role(auth.uid(), 'owner'::app_role) OR role <> 'owner'::app_role));

-- 4. The server checks the second factor.
UPDATE public.second_factor_settings SET enforce = true, updated_at = now() WHERE id = 1 AND enforce IS DISTINCT FROM true;
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261105120000', 'access_follows_current_role')
ON CONFLICT (version) DO NOTHING;

SELECT
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename NOT IN ('audit_log','periodic_snapshots')
     AND (coalesce(qual,'')||coalesce(with_check,'')) ~ 'auth\.uid\(\) = user_id\) OR') AS creator_branches_left,
  (SELECT with_check IS NOT NULL FROM pg_policies WHERE schemaname='public' AND tablename='user_invites' AND policyname='Admins can manage invites') AS invites_checked,
  (SELECT qual FROM pg_policies WHERE schemaname='public' AND tablename='user_roles' AND policyname='Admins can manage all roles') ~ 'owner' AS owner_rows_guarded,
  (SELECT enforce FROM public.second_factor_settings WHERE id=1) AS second_factor_on,
  (SELECT pg_get_functiondef('public.handle_new_user()'::regprocedure) ~ 'invited_by') AS signup_guarded,
  EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261105120000') AS recorded;
