-- Fix UPDATE policies on all 9 tables to prevent user_id ownership escalation

DROP POLICY IF EXISTS "Editors can update companies" ON public.companies;
CREATE POLICY "Editors can update companies" ON public.companies
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.can_edit(auth.uid(), 'company'::scope_type, id))
  WITH CHECK (user_id = (SELECT c.user_id FROM public.companies c WHERE c.id = companies.id));

DROP POLICY IF EXISTS "Editors can update portfolios" ON public.portfolios;
CREATE POLICY "Editors can update portfolios" ON public.portfolios
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.can_edit(auth.uid(), 'company'::scope_type, company_id))
  WITH CHECK (user_id = (SELECT p.user_id FROM public.portfolios p WHERE p.id = portfolios.id));

DROP POLICY IF EXISTS "Editors can update projects" ON public.projects;
CREATE POLICY "Editors can update projects" ON public.projects
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.can_edit(auth.uid(), 'project'::scope_type, id) OR public.can_edit(auth.uid(), 'company'::scope_type, company_id))
  WITH CHECK (user_id = (SELECT pr.user_id FROM public.projects pr WHERE pr.id = projects.id));

DROP POLICY IF EXISTS "Editors can update expenses" ON public.expenses;
CREATE POLICY "Editors can update expenses" ON public.expenses
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.can_edit(auth.uid(), 'project'::scope_type, project_id))
  WITH CHECK (user_id = (SELECT ex.user_id FROM public.expenses ex WHERE ex.id = expenses.id));

DROP POLICY IF EXISTS "Editors can update revenues" ON public.revenues;
CREATE POLICY "Editors can update revenues" ON public.revenues
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.can_edit(auth.uid(), 'project'::scope_type, project_id))
  WITH CHECK (user_id = (SELECT rv.user_id FROM public.revenues rv WHERE rv.id = revenues.id));

DROP POLICY IF EXISTS "Editors can update budget_items" ON public.budget_items;
CREATE POLICY "Editors can update budget_items" ON public.budget_items
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.can_edit(auth.uid(), 'project'::scope_type, project_id))
  WITH CHECK (user_id = (SELECT bi.user_id FROM public.budget_items bi WHERE bi.id = budget_items.id));

DROP POLICY IF EXISTS "Editors can update baselines" ON public.cost_baselines;
CREATE POLICY "Editors can update baselines" ON public.cost_baselines
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.can_edit(auth.uid(), 'project'::scope_type, project_id))
  WITH CHECK (user_id = (SELECT cb.user_id FROM public.cost_baselines cb WHERE cb.id = cost_baselines.id));

DROP POLICY IF EXISTS "Editors can update resources" ON public.resources;
CREATE POLICY "Editors can update resources" ON public.resources
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.can_edit(auth.uid(), 'project'::scope_type, project_id))
  WITH CHECK (user_id = (SELECT r.user_id FROM public.resources r WHERE r.id = resources.id));

DROP POLICY IF EXISTS "Editors can update custodies" ON public.custodies;
CREATE POLICY "Editors can update custodies" ON public.custodies
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR ((project_id IS NOT NULL) AND public.can_edit(auth.uid(), 'project'::scope_type, project_id)) OR ((company_id IS NOT NULL) AND public.can_edit(auth.uid(), 'company'::scope_type, company_id)))
  WITH CHECK (user_id = (SELECT cu.user_id FROM public.custodies cu WHERE cu.id = custodies.id));