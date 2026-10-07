-- The update policies' WITH CHECK read their own table to pin user_id, which
-- Postgres rejects as infinite recursion (42P17): every edit on these tables
-- failed. Owner immutability is enforced by trg_immutable_owner
-- (prevent_owner_reassignment) on each table, so the check becomes the same
-- scope as USING: the edited row must stay within what the editor may edit.
ALTER POLICY "Editors can update companies" ON public.companies WITH CHECK ((auth.uid() = user_id) OR public.can_edit(auth.uid(), 'company'::public.scope_type, id));
ALTER POLICY "Editors can update portfolios" ON public.portfolios WITH CHECK ((auth.uid() = user_id) OR public.can_edit(auth.uid(), 'company'::public.scope_type, company_id));
ALTER POLICY "Editors can update projects" ON public.projects WITH CHECK ((auth.uid() = user_id) OR public.can_edit(auth.uid(), 'project'::public.scope_type, id) OR public.can_edit(auth.uid(), 'company'::public.scope_type, company_id));
ALTER POLICY "Editors can update budget_items" ON public.budget_items WITH CHECK ((auth.uid() = user_id) OR public.can_edit(auth.uid(), 'project'::public.scope_type, project_id));
ALTER POLICY "Editors can update expenses" ON public.expenses WITH CHECK ((auth.uid() = user_id) OR public.can_edit(auth.uid(), 'project'::public.scope_type, project_id));
ALTER POLICY "Editors can update revenues" ON public.revenues WITH CHECK ((auth.uid() = user_id) OR public.can_edit(auth.uid(), 'project'::public.scope_type, project_id));
ALTER POLICY "Editors can update baselines" ON public.cost_baselines WITH CHECK ((auth.uid() = user_id) OR public.can_edit(auth.uid(), 'project'::public.scope_type, project_id));
ALTER POLICY "Editors can update resources" ON public.resources WITH CHECK ((auth.uid() = user_id) OR public.can_edit(auth.uid(), 'project'::public.scope_type, project_id));
ALTER POLICY "Editors can update custodies" ON public.custodies WITH CHECK ((auth.uid() = user_id) OR ((project_id IS NOT NULL) AND public.can_edit(auth.uid(), 'project'::public.scope_type, project_id)) OR ((company_id IS NOT NULL) AND public.can_edit(auth.uid(), 'company'::public.scope_type, company_id)));
ALTER POLICY "Editors can update milestones" ON public.milestones WITH CHECK ((auth.uid() = user_id) OR public.can_edit(auth.uid(), 'project'::public.scope_type, project_id));
ALTER POLICY "Editors can update change_orders" ON public.change_orders WITH CHECK ((auth.uid() = user_id) OR public.can_edit(auth.uid(), 'project'::public.scope_type, project_id));
ALTER POLICY "Editors can update risks" ON public.risks WITH CHECK ((auth.uid() = user_id) OR ((project_id IS NOT NULL) AND public.can_edit(auth.uid(), 'project'::public.scope_type, project_id)) OR ((portfolio_id IS NOT NULL) AND public.can_edit(auth.uid(), 'company'::public.scope_type, (SELECT p.company_id FROM public.portfolios p WHERE p.id = risks.portfolio_id))));
ALTER POLICY "Editors can update indirect_costs" ON public.indirect_costs WITH CHECK ((auth.uid() = user_id) OR public.can_edit(auth.uid(), 'company'::public.scope_type, company_id));
ALTER POLICY "Users can update own snapshots" ON public.periodic_snapshots WITH CHECK (auth.uid() = user_id);