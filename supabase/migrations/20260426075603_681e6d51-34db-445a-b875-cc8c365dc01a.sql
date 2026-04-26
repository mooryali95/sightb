CREATE TABLE public.budget_amendments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID NOT NULL,
  reason TEXT NOT NULL,
  snapshot_before JSONB NOT NULL DEFAULT '[]'::jsonb,
  snapshot_after JSONB,
  total_before NUMERIC NOT NULL DEFAULT 0,
  total_after NUMERIC,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'cancelled')),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_budget_amendments_project ON public.budget_amendments(project_id);
CREATE INDEX idx_budget_amendments_user ON public.budget_amendments(user_id);
CREATE INDEX idx_budget_amendments_status ON public.budget_amendments(status);

ALTER TABLE public.budget_amendments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own budget amendments"
  ON public.budget_amendments FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own budget amendments"
  ON public.budget_amendments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own draft amendments"
  ON public.budget_amendments FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own draft amendments"
  ON public.budget_amendments FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND status = 'draft');

CREATE OR REPLACE FUNCTION public.touch_budget_amendments_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_budget_amendments_updated_at
  BEFORE UPDATE ON public.budget_amendments
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_budget_amendments_updated_at();