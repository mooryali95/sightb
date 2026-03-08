
-- Update companies DELETE to allow editors
DROP POLICY IF EXISTS "Admins can delete companies" ON public.companies;
CREATE POLICY "Editors can delete companies" ON public.companies
FOR DELETE TO authenticated
USING (can_edit(auth.uid(), 'company'::scope_type, id));

-- Update projects DELETE to allow editors
DROP POLICY IF EXISTS "Owners can delete projects" ON public.projects;
CREATE POLICY "Editors can delete projects" ON public.projects
FOR DELETE TO authenticated
USING ((auth.uid() = user_id) OR can_edit(auth.uid(), 'project'::scope_type, id) OR can_edit(auth.uid(), 'company'::scope_type, company_id));

-- Update portfolios DELETE to allow editors
DROP POLICY IF EXISTS "Owners can delete portfolios" ON public.portfolios;
CREATE POLICY "Editors can delete portfolios" ON public.portfolios
FOR DELETE TO authenticated
USING ((auth.uid() = user_id) OR can_edit(auth.uid(), 'company'::scope_type, company_id));

-- Update resources DELETE to allow editors
DROP POLICY IF EXISTS "Owners can delete resources" ON public.resources;
CREATE POLICY "Editors can delete resources" ON public.resources
FOR DELETE TO authenticated
USING ((auth.uid() = user_id) OR can_edit(auth.uid(), 'project'::scope_type, project_id));

-- Update budget_items DELETE to allow editors
DROP POLICY IF EXISTS "Owners can delete budget_items" ON public.budget_items;
CREATE POLICY "Editors can delete budget_items" ON public.budget_items
FOR DELETE TO authenticated
USING ((auth.uid() = user_id) OR can_edit(auth.uid(), 'project'::scope_type, project_id));

-- Update expenses DELETE to allow editors
DROP POLICY IF EXISTS "Owners can delete expenses" ON public.expenses;
CREATE POLICY "Editors can delete expenses" ON public.expenses
FOR DELETE TO authenticated
USING ((auth.uid() = user_id) OR can_edit(auth.uid(), 'project'::scope_type, project_id));

-- Update revenues DELETE to allow editors
DROP POLICY IF EXISTS "Owners can delete revenues" ON public.revenues;
CREATE POLICY "Editors can delete revenues" ON public.revenues
FOR DELETE TO authenticated
USING ((auth.uid() = user_id) OR can_edit(auth.uid(), 'project'::scope_type, project_id));

-- Update milestones DELETE to allow editors
DROP POLICY IF EXISTS "Owners can delete milestones" ON public.milestones;
CREATE POLICY "Editors can delete milestones" ON public.milestones
FOR DELETE TO authenticated
USING ((auth.uid() = user_id) OR can_edit(auth.uid(), 'project'::scope_type, project_id));

-- Update change_orders DELETE to allow editors
DROP POLICY IF EXISTS "Owners can delete change_orders" ON public.change_orders;
CREATE POLICY "Editors can delete change_orders" ON public.change_orders
FOR DELETE TO authenticated
USING ((auth.uid() = user_id) OR can_edit(auth.uid(), 'project'::scope_type, project_id));

-- Update risks DELETE to allow editors
DROP POLICY IF EXISTS "Owners can delete risks" ON public.risks;
CREATE POLICY "Editors can delete risks" ON public.risks
FOR DELETE TO authenticated
USING (
  (auth.uid() = user_id)
  OR ((project_id IS NOT NULL) AND can_edit(auth.uid(), 'project'::scope_type, project_id))
  OR ((portfolio_id IS NOT NULL) AND can_edit(auth.uid(), 'company'::scope_type, (SELECT portfolios.company_id FROM portfolios WHERE portfolios.id = risks.portfolio_id)))
);

-- Update custodies DELETE to allow editors
DROP POLICY IF EXISTS "Owners can delete custodies" ON public.custodies;
CREATE POLICY "Editors can delete custodies" ON public.custodies
FOR DELETE TO authenticated
USING (
  (auth.uid() = user_id)
  OR ((project_id IS NOT NULL) AND can_edit(auth.uid(), 'project'::scope_type, project_id))
  OR ((company_id IS NOT NULL) AND can_edit(auth.uid(), 'company'::scope_type, company_id))
);

-- Update indirect_costs DELETE to allow editors
DROP POLICY IF EXISTS "Owners can delete indirect_costs" ON public.indirect_costs;
CREATE POLICY "Editors can delete indirect_costs" ON public.indirect_costs
FOR DELETE TO authenticated
USING ((auth.uid() = user_id) OR can_edit(auth.uid(), 'company'::scope_type, company_id));

-- Update baselines DELETE to allow editors
DROP POLICY IF EXISTS "Owners can delete baselines" ON public.cost_baselines;
CREATE POLICY "Editors can delete baselines" ON public.cost_baselines
FOR DELETE TO authenticated
USING ((auth.uid() = user_id) OR can_edit(auth.uid(), 'project'::scope_type, project_id));

-- Update baseline_items DELETE to allow editors
DROP POLICY IF EXISTS "Owners can delete baseline_items" ON public.baseline_items;
CREATE POLICY "Editors can delete baseline_items" ON public.baseline_items
FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM cost_baselines cb
  WHERE cb.id = baseline_items.baseline_id
  AND ((cb.user_id = auth.uid()) OR can_edit(auth.uid(), 'project'::scope_type, cb.project_id))
));
