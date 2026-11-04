-- ============================================================================
-- Role changes no longer fail with "infinite recursion detected in policy".
--
-- The WITH CHECK of "Admins can manage all roles" looked up the caller's
-- owner role with a subquery on user_roles itself. Postgres expands the
-- table's policies inside that subquery again, so every INSERT or UPDATE of
-- a role, by anyone, owner included, failed with 42P17. Grants work today
-- only because invitations go through an edge function with the service
-- role; any role change made from the app would have failed.
--
-- The same rule, asked through has_role(), which is SECURITY DEFINER and
-- reads user_roles without re-entering its policies: owners may grant or
-- take the owner role, admins may manage every other role, and nobody else
-- may write a role at all. The check now names the admin requirement
-- itself: for an INSERT only WITH CHECK applies, and without it the fixed
-- policy would have let any signed-in user grant themselves admin.
-- Idempotent.
-- ============================================================================
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
CREATE POLICY "Admins can manage all roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  -- WITH CHECK alone governs INSERT: it must itself require an admin, or any
  -- signed-in user could grant themselves a role.
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND (public.has_role(auth.uid(), 'owner'::app_role) OR role <> 'owner'::app_role)
  );
