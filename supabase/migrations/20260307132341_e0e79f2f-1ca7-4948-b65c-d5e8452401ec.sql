
-- Fix INSERT policies to add can_edit scope checks

-- budget_items
DROP POLICY IF EXISTS "Editors can insert budget_items" ON public.budget_items;
CREATE POLICY "Editors can insert budget_items" ON public.budget_items
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND public.can_edit(auth.uid(), 'project'::scope_type, project_id)
  );

-- expenses
DROP POLICY IF EXISTS "Editors can insert expenses" ON public.expenses;
CREATE POLICY "Editors can insert expenses" ON public.expenses
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND public.can_edit(auth.uid(), 'project'::scope_type, project_id)
  );

-- revenues
DROP POLICY IF EXISTS "Editors can insert revenues" ON public.revenues;
CREATE POLICY "Editors can insert revenues" ON public.revenues
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND public.can_edit(auth.uid(), 'project'::scope_type, project_id)
  );

-- portfolios
DROP POLICY IF EXISTS "Editors can insert portfolios" ON public.portfolios;
CREATE POLICY "Editors can insert portfolios" ON public.portfolios
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND public.can_edit(auth.uid(), 'company'::scope_type, company_id)
  );

-- projects
DROP POLICY IF EXISTS "Editors can insert projects" ON public.projects;
CREATE POLICY "Editors can insert projects" ON public.projects
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND public.can_edit(auth.uid(), 'company'::scope_type, company_id)
  );
