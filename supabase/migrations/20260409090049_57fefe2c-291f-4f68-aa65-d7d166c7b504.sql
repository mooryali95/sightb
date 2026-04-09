
-- Fix: Projects SELECT policy - remove company-level has_access to prevent escalation
-- has_access('project', id) already handles forward cascade from company roles
DROP POLICY IF EXISTS "Users can view projects" ON public.projects;
CREATE POLICY "Users can view projects"
ON public.projects FOR SELECT TO authenticated
USING (
  auth.uid() = user_id 
  OR has_access(auth.uid(), 'project'::scope_type, id)
);

-- Fix: Portfolios SELECT - only show if user has direct company role or project in this portfolio
DROP POLICY IF EXISTS "Users can view portfolios" ON public.portfolios;
CREATE POLICY "Users can view portfolios"
ON public.portfolios FOR SELECT TO authenticated
USING (
  auth.uid() = user_id 
  OR has_access(auth.uid(), 'company'::scope_type, company_id)
);

-- Note: has_access for company with reverse cascade is fine for portfolios 
-- since it just shows portfolio names, and individual project access is controlled separately
