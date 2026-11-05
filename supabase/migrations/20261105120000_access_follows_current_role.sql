-- ============================================================================
-- Access follows the role a person holds now, and only an owner makes owners.
-- Found by the 5 November readiness review; each case is held by
-- supabase/tests/tenant-isolation.sql.
--
-- 1. Every data policy read "(auth.uid() = user_id) OR can_edit/has_access(…)".
--    The first branch let whoever wrote a row keep it forever: an editor of one
--    project could UPDATE their own revenue's project_id into another company's
--    project (WITH CHECK passed on user_id), and after an admin removed all
--    their roles they still read and changed it. The branch is dropped, so
--    access is the role alone. Owners and admins hold system roles, which
--    has_access and can_edit already grant everywhere. The audit log and the
--    periodic snapshots keep it: they are a person's own records, not data
--    scoped to a project.
-- 2. "Admins can manage invites" had no WITH CHECK, so an admin could write an
--    owner invite for a mailbox they hold, and handle_new_user granted it on
--    sign-up. Only an owner writes an owner invite now, and sign-up grants owner
--    only from an invite an owner sent (an invite planted before this is inert).
-- 3. An admin could demote or remove an owner (USING was only "is admin").
--    Rows holding the owner role are an owner's to change.
-- 4. The server-side second factor shipped switched off (20260924150000), so a
--    stolen password read everything through the API. It is switched on: the
--    sign-in flow has recorded verified sessions since September.
-- Idempotent: running it twice changes nothing more.
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
