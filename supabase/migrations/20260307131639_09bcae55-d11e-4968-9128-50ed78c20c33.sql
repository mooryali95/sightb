
-- Cost Baselines table
CREATE TABLE public.cost_baselines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'Baseline',
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  total_planned NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Baseline Items table (frozen snapshot of budget items)
CREATE TABLE public.baseline_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  baseline_id UUID NOT NULL REFERENCES public.cost_baselines(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  planned_amount NUMERIC NOT NULL DEFAULT 0,
  month INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cost_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.baseline_items ENABLE ROW LEVEL SECURITY;

-- RLS for cost_baselines
CREATE POLICY "Users can view baselines" ON public.cost_baselines
  FOR SELECT USING (
    auth.uid() = user_id
    OR has_access(auth.uid(), 'project'::scope_type, project_id)
  );

CREATE POLICY "Editors can insert baselines" ON public.cost_baselines
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND can_edit(auth.uid(), 'project'::scope_type, project_id)
  );

CREATE POLICY "Editors can update baselines" ON public.cost_baselines
  FOR UPDATE USING (
    auth.uid() = user_id
    OR can_edit(auth.uid(), 'project'::scope_type, project_id)
  );

CREATE POLICY "Owners can delete baselines" ON public.cost_baselines
  FOR DELETE USING (
    auth.uid() = user_id
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- RLS for baseline_items (access through baseline -> project)
CREATE POLICY "Users can view baseline_items" ON public.baseline_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.cost_baselines cb
      WHERE cb.id = baseline_id
      AND (cb.user_id = auth.uid() OR has_access(auth.uid(), 'project'::scope_type, cb.project_id))
    )
  );

CREATE POLICY "Editors can insert baseline_items" ON public.baseline_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.cost_baselines cb
      WHERE cb.id = baseline_id
      AND (cb.user_id = auth.uid() AND can_edit(auth.uid(), 'project'::scope_type, cb.project_id))
    )
  );

CREATE POLICY "Owners can delete baseline_items" ON public.baseline_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.cost_baselines cb
      WHERE cb.id = baseline_id
      AND (cb.user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
    )
  );
