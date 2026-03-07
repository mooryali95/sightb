
-- 1. Resources table (independent list per project)
CREATE TABLE public.resources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  role TEXT,
  monthly_cost NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view resources" ON public.resources
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_access(auth.uid(), 'project'::scope_type, project_id));

CREATE POLICY "Editors can insert resources" ON public.resources
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.can_edit(auth.uid(), 'project'::scope_type, project_id));

CREATE POLICY "Editors can update resources" ON public.resources
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.can_edit(auth.uid(), 'project'::scope_type, project_id));

CREATE POLICY "Owners can delete resources" ON public.resources
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Custodies table (per project or company)
CREATE TABLE public.custodies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  resource_name TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.custodies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view custodies" ON public.custodies
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR (project_id IS NOT NULL AND public.has_access(auth.uid(), 'project'::scope_type, project_id))
    OR (company_id IS NOT NULL AND public.has_access(auth.uid(), 'company'::scope_type, company_id))
  );

CREATE POLICY "Editors can insert custodies" ON public.custodies
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      (project_id IS NOT NULL AND public.can_edit(auth.uid(), 'project'::scope_type, project_id))
      OR (company_id IS NOT NULL AND public.can_edit(auth.uid(), 'company'::scope_type, company_id))
    )
  );

CREATE POLICY "Editors can update custodies" ON public.custodies
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    OR (project_id IS NOT NULL AND public.can_edit(auth.uid(), 'project'::scope_type, project_id))
    OR (company_id IS NOT NULL AND public.can_edit(auth.uid(), 'company'::scope_type, company_id))
  );

CREATE POLICY "Owners can delete custodies" ON public.custodies
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Add resource_id to budget_items
ALTER TABLE public.budget_items ADD COLUMN resource_id UUID REFERENCES public.resources(id) ON DELETE SET NULL;

-- 4. Add resource_id and custody_id to expenses
ALTER TABLE public.expenses ADD COLUMN resource_id UUID REFERENCES public.resources(id) ON DELETE SET NULL;
ALTER TABLE public.expenses ADD COLUMN custody_id UUID REFERENCES public.custodies(id) ON DELETE SET NULL;
