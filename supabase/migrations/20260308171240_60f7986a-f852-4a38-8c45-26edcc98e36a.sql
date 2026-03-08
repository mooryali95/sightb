
-- ============================================================
-- Convert ALL restrictive RLS policies to PERMISSIVE
-- EXCEPT admin_otp_codes (keep deny-all as restrictive)
-- ============================================================

-- ==================== profiles ====================
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);

-- ==================== user_roles ====================
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;

CREATE POLICY "Admins can manage all roles" ON public.user_roles FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ==================== user_invites ====================
DROP POLICY IF EXISTS "Admins can manage invites" ON public.user_invites;

CREATE POLICY "Admins can manage invites" ON public.user_invites FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- ==================== companies ====================
DROP POLICY IF EXISTS "Admins can delete companies" ON public.companies;
DROP POLICY IF EXISTS "Editors can update companies" ON public.companies;
DROP POLICY IF EXISTS "Only admins can insert companies" ON public.companies;
DROP POLICY IF EXISTS "Users can view companies" ON public.companies;

CREATE POLICY "Admins can delete companies" ON public.companies FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Editors can update companies" ON public.companies FOR UPDATE TO authenticated USING ((auth.uid() = user_id) OR can_edit(auth.uid(), 'company'::scope_type, id)) WITH CHECK (user_id = (SELECT c.user_id FROM companies c WHERE c.id = companies.id));
CREATE POLICY "Only admins can insert companies" ON public.companies FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id) AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view companies" ON public.companies FOR SELECT TO authenticated USING ((auth.uid() = user_id) OR has_access(auth.uid(), 'company'::scope_type, id));

-- ==================== portfolios ====================
DROP POLICY IF EXISTS "Admins can delete portfolios" ON public.portfolios;
DROP POLICY IF EXISTS "Editors can insert portfolios" ON public.portfolios;
DROP POLICY IF EXISTS "Editors can update portfolios" ON public.portfolios;
DROP POLICY IF EXISTS "Users can view portfolios" ON public.portfolios;

CREATE POLICY "Admins can delete portfolios" ON public.portfolios FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Editors can insert portfolios" ON public.portfolios FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id) AND can_edit(auth.uid(), 'company'::scope_type, company_id));
CREATE POLICY "Editors can update portfolios" ON public.portfolios FOR UPDATE TO authenticated USING ((auth.uid() = user_id) OR can_edit(auth.uid(), 'company'::scope_type, company_id)) WITH CHECK (user_id = (SELECT p.user_id FROM portfolios p WHERE p.id = portfolios.id));
CREATE POLICY "Users can view portfolios" ON public.portfolios FOR SELECT TO authenticated USING ((auth.uid() = user_id) OR has_access(auth.uid(), 'company'::scope_type, company_id));

-- ==================== projects ====================
DROP POLICY IF EXISTS "Admins can delete projects" ON public.projects;
DROP POLICY IF EXISTS "Editors can insert projects" ON public.projects;
DROP POLICY IF EXISTS "Editors can update projects" ON public.projects;
DROP POLICY IF EXISTS "Users can view projects" ON public.projects;

CREATE POLICY "Admins can delete projects" ON public.projects FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Editors can insert projects" ON public.projects FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id) AND can_edit(auth.uid(), 'company'::scope_type, company_id));
CREATE POLICY "Editors can update projects" ON public.projects FOR UPDATE TO authenticated USING ((auth.uid() = user_id) OR can_edit(auth.uid(), 'project'::scope_type, id) OR can_edit(auth.uid(), 'company'::scope_type, company_id)) WITH CHECK (user_id = (SELECT pr.user_id FROM projects pr WHERE pr.id = projects.id));
CREATE POLICY "Users can view projects" ON public.projects FOR SELECT TO authenticated USING ((auth.uid() = user_id) OR has_access(auth.uid(), 'project'::scope_type, id) OR has_access(auth.uid(), 'company'::scope_type, company_id));

-- ==================== budget_items ====================
DROP POLICY IF EXISTS "Editors can delete budget_items" ON public.budget_items;
DROP POLICY IF EXISTS "Editors can insert budget_items" ON public.budget_items;
DROP POLICY IF EXISTS "Editors can update budget_items" ON public.budget_items;
DROP POLICY IF EXISTS "Users can view budget_items" ON public.budget_items;

CREATE POLICY "Editors can delete budget_items" ON public.budget_items FOR DELETE TO authenticated USING ((auth.uid() = user_id) OR can_edit(auth.uid(), 'project'::scope_type, project_id));
CREATE POLICY "Editors can insert budget_items" ON public.budget_items FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id) AND can_edit(auth.uid(), 'project'::scope_type, project_id));
CREATE POLICY "Editors can update budget_items" ON public.budget_items FOR UPDATE TO authenticated USING ((auth.uid() = user_id) OR can_edit(auth.uid(), 'project'::scope_type, project_id)) WITH CHECK (user_id = (SELECT bi.user_id FROM budget_items bi WHERE bi.id = budget_items.id));
CREATE POLICY "Users can view budget_items" ON public.budget_items FOR SELECT TO authenticated USING ((auth.uid() = user_id) OR has_access(auth.uid(), 'project'::scope_type, project_id));

-- ==================== expenses ====================
DROP POLICY IF EXISTS "Editors can delete expenses" ON public.expenses;
DROP POLICY IF EXISTS "Editors can insert expenses" ON public.expenses;
DROP POLICY IF EXISTS "Editors can update expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can view expenses" ON public.expenses;

CREATE POLICY "Editors can delete expenses" ON public.expenses FOR DELETE TO authenticated USING ((auth.uid() = user_id) OR can_edit(auth.uid(), 'project'::scope_type, project_id));
CREATE POLICY "Editors can insert expenses" ON public.expenses FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id) AND can_edit(auth.uid(), 'project'::scope_type, project_id));
CREATE POLICY "Editors can update expenses" ON public.expenses FOR UPDATE TO authenticated USING ((auth.uid() = user_id) OR can_edit(auth.uid(), 'project'::scope_type, project_id)) WITH CHECK (user_id = (SELECT ex.user_id FROM expenses ex WHERE ex.id = expenses.id));
CREATE POLICY "Users can view expenses" ON public.expenses FOR SELECT TO authenticated USING ((auth.uid() = user_id) OR has_access(auth.uid(), 'project'::scope_type, project_id));

-- ==================== revenues ====================
DROP POLICY IF EXISTS "Editors can delete revenues" ON public.revenues;
DROP POLICY IF EXISTS "Editors can insert revenues" ON public.revenues;
DROP POLICY IF EXISTS "Editors can update revenues" ON public.revenues;
DROP POLICY IF EXISTS "Users can view revenues" ON public.revenues;

CREATE POLICY "Editors can delete revenues" ON public.revenues FOR DELETE TO authenticated USING ((auth.uid() = user_id) OR can_edit(auth.uid(), 'project'::scope_type, project_id));
CREATE POLICY "Editors can insert revenues" ON public.revenues FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id) AND can_edit(auth.uid(), 'project'::scope_type, project_id));
CREATE POLICY "Editors can update revenues" ON public.revenues FOR UPDATE TO authenticated USING ((auth.uid() = user_id) OR can_edit(auth.uid(), 'project'::scope_type, project_id)) WITH CHECK (user_id = (SELECT rv.user_id FROM revenues rv WHERE rv.id = revenues.id));
CREATE POLICY "Users can view revenues" ON public.revenues FOR SELECT TO authenticated USING ((auth.uid() = user_id) OR has_access(auth.uid(), 'project'::scope_type, project_id));

-- ==================== resources ====================
DROP POLICY IF EXISTS "Editors can delete resources" ON public.resources;
DROP POLICY IF EXISTS "Editors can insert resources" ON public.resources;
DROP POLICY IF EXISTS "Editors can update resources" ON public.resources;
DROP POLICY IF EXISTS "Users can view resources" ON public.resources;

CREATE POLICY "Editors can delete resources" ON public.resources FOR DELETE TO authenticated USING ((auth.uid() = user_id) OR can_edit(auth.uid(), 'project'::scope_type, project_id));
CREATE POLICY "Editors can insert resources" ON public.resources FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id) AND can_edit(auth.uid(), 'project'::scope_type, project_id));
CREATE POLICY "Editors can update resources" ON public.resources FOR UPDATE TO authenticated USING ((auth.uid() = user_id) OR can_edit(auth.uid(), 'project'::scope_type, project_id)) WITH CHECK (user_id = (SELECT r.user_id FROM resources r WHERE r.id = resources.id));
CREATE POLICY "Users can view resources" ON public.resources FOR SELECT TO authenticated USING ((auth.uid() = user_id) OR has_access(auth.uid(), 'project'::scope_type, project_id));

-- ==================== milestones ====================
DROP POLICY IF EXISTS "Editors can delete milestones" ON public.milestones;
DROP POLICY IF EXISTS "Editors can insert milestones" ON public.milestones;
DROP POLICY IF EXISTS "Editors can update milestones" ON public.milestones;
DROP POLICY IF EXISTS "Users can view milestones" ON public.milestones;

CREATE POLICY "Editors can delete milestones" ON public.milestones FOR DELETE TO authenticated USING ((auth.uid() = user_id) OR can_edit(auth.uid(), 'project'::scope_type, project_id));
CREATE POLICY "Editors can insert milestones" ON public.milestones FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id) AND can_edit(auth.uid(), 'project'::scope_type, project_id));
CREATE POLICY "Editors can update milestones" ON public.milestones FOR UPDATE TO authenticated USING ((auth.uid() = user_id) OR can_edit(auth.uid(), 'project'::scope_type, project_id)) WITH CHECK (user_id = (SELECT m.user_id FROM milestones m WHERE m.id = milestones.id));
CREATE POLICY "Users can view milestones" ON public.milestones FOR SELECT TO authenticated USING ((auth.uid() = user_id) OR has_access(auth.uid(), 'project'::scope_type, project_id));

-- ==================== change_orders ====================
DROP POLICY IF EXISTS "Editors can delete change_orders" ON public.change_orders;
DROP POLICY IF EXISTS "Editors can insert change_orders" ON public.change_orders;
DROP POLICY IF EXISTS "Editors can update change_orders" ON public.change_orders;
DROP POLICY IF EXISTS "Users can view change_orders" ON public.change_orders;

CREATE POLICY "Editors can delete change_orders" ON public.change_orders FOR DELETE TO authenticated USING ((auth.uid() = user_id) OR can_edit(auth.uid(), 'project'::scope_type, project_id));
CREATE POLICY "Editors can insert change_orders" ON public.change_orders FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id) AND can_edit(auth.uid(), 'project'::scope_type, project_id));
CREATE POLICY "Editors can update change_orders" ON public.change_orders FOR UPDATE TO authenticated USING ((auth.uid() = user_id) OR can_edit(auth.uid(), 'project'::scope_type, project_id)) WITH CHECK (user_id = (SELECT co.user_id FROM change_orders co WHERE co.id = change_orders.id));
CREATE POLICY "Users can view change_orders" ON public.change_orders FOR SELECT TO authenticated USING ((auth.uid() = user_id) OR has_access(auth.uid(), 'project'::scope_type, project_id));

-- ==================== risks ====================
DROP POLICY IF EXISTS "Editors can delete risks" ON public.risks;
DROP POLICY IF EXISTS "Editors can insert risks" ON public.risks;
DROP POLICY IF EXISTS "Editors can update risks" ON public.risks;
DROP POLICY IF EXISTS "Users can view risks" ON public.risks;

CREATE POLICY "Editors can delete risks" ON public.risks FOR DELETE TO authenticated USING ((auth.uid() = user_id) OR ((project_id IS NOT NULL) AND can_edit(auth.uid(), 'project'::scope_type, project_id)) OR ((portfolio_id IS NOT NULL) AND can_edit(auth.uid(), 'company'::scope_type, (SELECT portfolios.company_id FROM portfolios WHERE portfolios.id = risks.portfolio_id))));
CREATE POLICY "Editors can insert risks" ON public.risks FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id) AND (((project_id IS NOT NULL) AND can_edit(auth.uid(), 'project'::scope_type, project_id)) OR ((portfolio_id IS NOT NULL) AND can_edit(auth.uid(), 'company'::scope_type, (SELECT portfolios.company_id FROM portfolios WHERE portfolios.id = risks.portfolio_id)))));
CREATE POLICY "Editors can update risks" ON public.risks FOR UPDATE TO authenticated USING ((auth.uid() = user_id) OR ((project_id IS NOT NULL) AND can_edit(auth.uid(), 'project'::scope_type, project_id)) OR ((portfolio_id IS NOT NULL) AND can_edit(auth.uid(), 'company'::scope_type, (SELECT portfolios.company_id FROM portfolios WHERE portfolios.id = risks.portfolio_id)))) WITH CHECK (user_id = (SELECT r.user_id FROM risks r WHERE r.id = risks.id));
CREATE POLICY "Users can view risks" ON public.risks FOR SELECT TO authenticated USING ((auth.uid() = user_id) OR ((project_id IS NOT NULL) AND has_access(auth.uid(), 'project'::scope_type, project_id)) OR ((portfolio_id IS NOT NULL) AND has_access(auth.uid(), 'company'::scope_type, (SELECT portfolios.company_id FROM portfolios WHERE portfolios.id = risks.portfolio_id))));

-- ==================== custodies ====================
DROP POLICY IF EXISTS "Editors can delete custodies" ON public.custodies;
DROP POLICY IF EXISTS "Editors can insert custodies" ON public.custodies;
DROP POLICY IF EXISTS "Editors can update custodies" ON public.custodies;
DROP POLICY IF EXISTS "Users can view custodies" ON public.custodies;

CREATE POLICY "Editors can delete custodies" ON public.custodies FOR DELETE TO authenticated USING ((auth.uid() = user_id) OR ((project_id IS NOT NULL) AND can_edit(auth.uid(), 'project'::scope_type, project_id)) OR ((company_id IS NOT NULL) AND can_edit(auth.uid(), 'company'::scope_type, company_id)));
CREATE POLICY "Editors can insert custodies" ON public.custodies FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id) AND (((project_id IS NOT NULL) AND can_edit(auth.uid(), 'project'::scope_type, project_id)) OR ((company_id IS NOT NULL) AND can_edit(auth.uid(), 'company'::scope_type, company_id))));
CREATE POLICY "Editors can update custodies" ON public.custodies FOR UPDATE TO authenticated USING ((auth.uid() = user_id) OR ((project_id IS NOT NULL) AND can_edit(auth.uid(), 'project'::scope_type, project_id)) OR ((company_id IS NOT NULL) AND can_edit(auth.uid(), 'company'::scope_type, company_id))) WITH CHECK (user_id = (SELECT cu.user_id FROM custodies cu WHERE cu.id = custodies.id));
CREATE POLICY "Users can view custodies" ON public.custodies FOR SELECT TO authenticated USING ((auth.uid() = user_id) OR ((project_id IS NOT NULL) AND has_access(auth.uid(), 'project'::scope_type, project_id)) OR ((company_id IS NOT NULL) AND has_access(auth.uid(), 'company'::scope_type, company_id)));

-- ==================== cost_baselines ====================
DROP POLICY IF EXISTS "Editors can delete baselines" ON public.cost_baselines;
DROP POLICY IF EXISTS "Editors can insert baselines" ON public.cost_baselines;
DROP POLICY IF EXISTS "Editors can update baselines" ON public.cost_baselines;
DROP POLICY IF EXISTS "Users can view baselines" ON public.cost_baselines;

CREATE POLICY "Editors can delete baselines" ON public.cost_baselines FOR DELETE TO authenticated USING ((auth.uid() = user_id) OR can_edit(auth.uid(), 'project'::scope_type, project_id));
CREATE POLICY "Editors can insert baselines" ON public.cost_baselines FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id) AND can_edit(auth.uid(), 'project'::scope_type, project_id));
CREATE POLICY "Editors can update baselines" ON public.cost_baselines FOR UPDATE TO authenticated USING ((auth.uid() = user_id) OR can_edit(auth.uid(), 'project'::scope_type, project_id)) WITH CHECK (user_id = (SELECT cb.user_id FROM cost_baselines cb WHERE cb.id = cost_baselines.id));
CREATE POLICY "Users can view baselines" ON public.cost_baselines FOR SELECT TO authenticated USING ((auth.uid() = user_id) OR has_access(auth.uid(), 'project'::scope_type, project_id));

-- ==================== baseline_items ====================
DROP POLICY IF EXISTS "Editors can delete baseline_items" ON public.baseline_items;
DROP POLICY IF EXISTS "Editors can insert baseline_items" ON public.baseline_items;
DROP POLICY IF EXISTS "Users can view baseline_items" ON public.baseline_items;

CREATE POLICY "Editors can delete baseline_items" ON public.baseline_items FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM cost_baselines cb WHERE cb.id = baseline_items.baseline_id AND ((cb.user_id = auth.uid()) OR can_edit(auth.uid(), 'project'::scope_type, cb.project_id))));
CREATE POLICY "Editors can insert baseline_items" ON public.baseline_items FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM cost_baselines cb WHERE cb.id = baseline_items.baseline_id AND cb.user_id = auth.uid() AND can_edit(auth.uid(), 'project'::scope_type, cb.project_id)));
CREATE POLICY "Users can view baseline_items" ON public.baseline_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM cost_baselines cb WHERE cb.id = baseline_items.baseline_id AND ((cb.user_id = auth.uid()) OR has_access(auth.uid(), 'project'::scope_type, cb.project_id))));

-- ==================== indirect_costs ====================
DROP POLICY IF EXISTS "Editors can delete indirect_costs" ON public.indirect_costs;
DROP POLICY IF EXISTS "Editors can insert indirect_costs" ON public.indirect_costs;
DROP POLICY IF EXISTS "Editors can update indirect_costs" ON public.indirect_costs;
DROP POLICY IF EXISTS "Users can view indirect_costs" ON public.indirect_costs;

CREATE POLICY "Editors can delete indirect_costs" ON public.indirect_costs FOR DELETE TO authenticated USING ((auth.uid() = user_id) OR can_edit(auth.uid(), 'company'::scope_type, company_id));
CREATE POLICY "Editors can insert indirect_costs" ON public.indirect_costs FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id) AND can_edit(auth.uid(), 'company'::scope_type, company_id));
CREATE POLICY "Editors can update indirect_costs" ON public.indirect_costs FOR UPDATE TO authenticated USING ((auth.uid() = user_id) OR can_edit(auth.uid(), 'company'::scope_type, company_id)) WITH CHECK (user_id = (SELECT ic.user_id FROM indirect_costs ic WHERE ic.id = indirect_costs.id));
CREATE POLICY "Users can view indirect_costs" ON public.indirect_costs FOR SELECT TO authenticated USING ((auth.uid() = user_id) OR has_access(auth.uid(), 'company'::scope_type, company_id));

-- ==================== periodic_snapshots ====================
DROP POLICY IF EXISTS "Owners can delete snapshots" ON public.periodic_snapshots;
DROP POLICY IF EXISTS "Users can insert snapshots" ON public.periodic_snapshots;
DROP POLICY IF EXISTS "Users can update own snapshots" ON public.periodic_snapshots;
DROP POLICY IF EXISTS "Users can view own snapshots" ON public.periodic_snapshots;

CREATE POLICY "Owners can delete snapshots" ON public.periodic_snapshots FOR DELETE TO authenticated USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can insert snapshots" ON public.periodic_snapshots FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own snapshots" ON public.periodic_snapshots FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (user_id = (SELECT ps.user_id FROM periodic_snapshots ps WHERE ps.id = periodic_snapshots.id));
CREATE POLICY "Users can view own snapshots" ON public.periodic_snapshots FOR SELECT TO authenticated USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));

-- ==================== audit_log ====================
DROP POLICY IF EXISTS "Users can view audit logs" ON public.audit_log;

CREATE POLICY "Users can view audit logs" ON public.audit_log FOR SELECT TO authenticated USING ((auth.uid() = user_id) OR ((project_id IS NOT NULL) AND has_access(auth.uid(), 'project'::scope_type, project_id)));

-- ==================== trusted_devices ====================
DROP POLICY IF EXISTS "Users can delete own trusted devices" ON public.trusted_devices;
DROP POLICY IF EXISTS "Users can view own trusted devices" ON public.trusted_devices;

CREATE POLICY "Users can delete own trusted devices" ON public.trusted_devices FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can view own trusted devices" ON public.trusted_devices FOR SELECT TO authenticated USING (auth.uid() = user_id);
