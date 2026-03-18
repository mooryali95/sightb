
CREATE TABLE public.commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  budget_item_id UUID REFERENCES public.budget_items(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  description TEXT NOT NULL,
  vendor_name TEXT,
  contract_ref TEXT,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  spent_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  start_date TEXT,
  end_date TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.commitments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view commitments" ON public.commitments FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_access(auth.uid(), 'project'::scope_type, project_id));
CREATE POLICY "Editors can insert commitments" ON public.commitments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND can_edit(auth.uid(), 'project'::scope_type, project_id));
CREATE POLICY "Editors can update commitments" ON public.commitments FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR can_edit(auth.uid(), 'project'::scope_type, project_id));
CREATE POLICY "Editors can delete commitments" ON public.commitments FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR can_edit(auth.uid(), 'project'::scope_type, project_id));
