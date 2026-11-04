-- ============================================================================
-- SightB · role changes without the recursion error (one-off, CLAUDE.md rule 4
-- exception).
--
-- Paste ALL of this into Lovable Cloud's SQL editor and run it once. Safe to
-- run again. The last statement returns ONE row: "✅ roles" or what is not.
-- Source: supabase/migrations/20261104090000_user_roles_policy_without_recursion.sql
--
-- Every INSERT or UPDATE on user_roles failed with "infinite recursion
-- detected in policy" (42P17), for the owner too: the policy looked itself up.
-- Invitations still worked only because they go through an edge function.
-- After this: owners and admins manage roles, only an owner grants the owner
-- role, and nobody else can write a role. No row changes.
-- ============================================================================
BEGIN;

DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
CREATE POLICY "Admins can manage all roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  -- WITH CHECK alone governs INSERT: it must itself require an admin, or any
  -- signed-in user could grant themselves a role.
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND (public.has_role(auth.uid(), 'owner'::app_role) OR role <> 'owner'::app_role)
  );

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261104090000', 'user_roles_policy_without_recursion') ON CONFLICT (version) DO NOTHING;

NOTIFY pgrst, 'reload schema';
COMMIT;

SELECT CASE WHEN missing = '' THEN '✅ roles — admins manage roles without the recursion error, only owners grant owner, nobody else writes a role'
  ELSE '❌ ' || missing END AS roles
FROM (
  SELECT concat_ws(', ',
    CASE WHEN NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_roles' AND policyname = 'Admins can manage all roles') THEN 'policy missing' END,
    CASE WHEN (SELECT with_check FROM pg_policies WHERE tablename = 'user_roles' AND policyname = 'Admins can manage all roles') ~ 'FROM (public\.)?user_roles' THEN 'policy still reads user_roles itself' END,
    CASE WHEN (SELECT with_check FROM pg_policies WHERE tablename = 'user_roles' AND policyname = 'Admins can manage all roles') NOT LIKE '%''admin''::app_role%' THEN 'writes do not require an admin' END,
    CASE WHEN NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261104090000') THEN 'ledger row' END
  ) AS missing
) m;
