DROP POLICY IF EXISTS "Members read organization settings" ON public.organization_settings;
CREATE POLICY "Members read organization settings" ON public.organization_settings
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

REVOKE ALL ON public.organization_settings FROM anon;
REVOKE INSERT, DELETE, TRUNCATE ON public.organization_settings FROM authenticated;