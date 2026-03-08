
-- 1. Add columns to portfolios
ALTER TABLE public.portfolios
  ADD COLUMN IF NOT EXISTS target_revenue NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_margin NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fiscal_year TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- 2. Create risks table
CREATE TABLE public.risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  portfolio_id UUID REFERENCES public.portfolios(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  probability TEXT NOT NULL DEFAULT 'medium',
  impact TEXT NOT NULL DEFAULT 'medium',
  financial_impact NUMERIC NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'financial',
  status TEXT NOT NULL DEFAULT 'open',
  mitigation_plan TEXT,
  owner TEXT,
  identified_date TEXT,
  closed_date TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.risks ENABLE ROW LEVEL SECURITY;

-- RLS for risks - SELECT
CREATE POLICY "Users can view risks" ON public.risks FOR SELECT TO authenticated
USING (
  (auth.uid() = user_id)
  OR (project_id IS NOT NULL AND has_access(auth.uid(), 'project'::scope_type, project_id))
  OR (portfolio_id IS NOT NULL AND has_access(auth.uid(), 'company'::scope_type, (SELECT company_id FROM public.portfolios WHERE id = portfolio_id)))
);

-- RLS for risks - INSERT
CREATE POLICY "Editors can insert risks" ON public.risks FOR INSERT TO authenticated
WITH CHECK (
  (auth.uid() = user_id)
  AND (
    (project_id IS NOT NULL AND can_edit(auth.uid(), 'project'::scope_type, project_id))
    OR (portfolio_id IS NOT NULL AND can_edit(auth.uid(), 'company'::scope_type, (SELECT company_id FROM public.portfolios WHERE id = portfolio_id)))
  )
);

-- RLS for risks - UPDATE
CREATE POLICY "Editors can update risks" ON public.risks FOR UPDATE TO authenticated
USING (
  (auth.uid() = user_id)
  OR (project_id IS NOT NULL AND can_edit(auth.uid(), 'project'::scope_type, project_id))
  OR (portfolio_id IS NOT NULL AND can_edit(auth.uid(), 'company'::scope_type, (SELECT company_id FROM public.portfolios WHERE id = portfolio_id)))
)
WITH CHECK (
  user_id = (SELECT r.user_id FROM public.risks r WHERE r.id = risks.id)
);

-- RLS for risks - DELETE
CREATE POLICY "Owners can delete risks" ON public.risks FOR DELETE TO authenticated
USING (
  (auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)
);

-- Audit triggers for risks
CREATE TRIGGER risks_audit_update AFTER UPDATE ON public.risks FOR EACH ROW EXECUTE FUNCTION audit_update();
CREATE TRIGGER risks_audit_delete AFTER DELETE ON public.risks FOR EACH ROW EXECUTE FUNCTION audit_delete();

-- 3. Create indirect_costs table
CREATE TABLE public.indirect_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  month INTEGER NOT NULL,
  date TEXT NOT NULL,
  allocation_method TEXT NOT NULL DEFAULT 'equal',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.indirect_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view indirect_costs" ON public.indirect_costs FOR SELECT TO authenticated
USING (
  (auth.uid() = user_id) OR has_access(auth.uid(), 'company'::scope_type, company_id)
);

CREATE POLICY "Editors can insert indirect_costs" ON public.indirect_costs FOR INSERT TO authenticated
WITH CHECK (
  (auth.uid() = user_id) AND can_edit(auth.uid(), 'company'::scope_type, company_id)
);

CREATE POLICY "Editors can update indirect_costs" ON public.indirect_costs FOR UPDATE TO authenticated
USING (
  (auth.uid() = user_id) OR can_edit(auth.uid(), 'company'::scope_type, company_id)
)
WITH CHECK (
  user_id = (SELECT ic.user_id FROM public.indirect_costs ic WHERE ic.id = indirect_costs.id)
);

CREATE POLICY "Owners can delete indirect_costs" ON public.indirect_costs FOR DELETE TO authenticated
USING (
  (auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE TRIGGER indirect_costs_audit_update AFTER UPDATE ON public.indirect_costs FOR EACH ROW EXECUTE FUNCTION audit_update();
CREATE TRIGGER indirect_costs_audit_delete AFTER DELETE ON public.indirect_costs FOR EACH ROW EXECUTE FUNCTION audit_delete();

-- 4. Create periodic_snapshots table
CREATE TABLE public.periodic_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  period TEXT NOT NULL,
  snapshot_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  metrics JSONB NOT NULL DEFAULT '{}',
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(entity_type, entity_id, period)
);

ALTER TABLE public.periodic_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own snapshots" ON public.periodic_snapshots FOR SELECT TO authenticated
USING (
  (auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Users can insert snapshots" ON public.periodic_snapshots FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own snapshots" ON public.periodic_snapshots FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (user_id = (SELECT ps.user_id FROM public.periodic_snapshots ps WHERE ps.id = periodic_snapshots.id));

CREATE POLICY "Owners can delete snapshots" ON public.periodic_snapshots FOR DELETE TO authenticated
USING (
  (auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)
);

-- 5. Update audit_delete and audit_update to handle risks with project_id extraction
CREATE OR REPLACE FUNCTION public.audit_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _project_id uuid := NULL;
  _user_id uuid := auth.uid();
BEGIN
  IF _user_id IS NULL THEN
    RETURN OLD;
  END IF;

  IF TG_TABLE_NAME IN ('expenses','budget_items','revenues','resources','custodies','cost_baselines','milestones','change_orders','risks') THEN
    EXECUTE format('SELECT ($1).%I', 'project_id') INTO _project_id USING OLD;
  END IF;

  INSERT INTO public.audit_log (user_id, action, table_name, record_id, record_data, project_id)
  VALUES (
    _user_id,
    'delete',
    TG_TABLE_NAME,
    OLD.id,
    to_jsonb(OLD),
    _project_id
  );
  RETURN OLD;
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _project_id uuid := NULL;
  _user_id uuid := auth.uid();
BEGIN
  IF _user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME IN ('expenses','budget_items','revenues','resources','custodies','cost_baselines','milestones','change_orders','risks') THEN
    EXECUTE format('SELECT ($1).%I', 'project_id') INTO _project_id USING OLD;
  END IF;

  INSERT INTO public.audit_log (user_id, action, table_name, record_id, record_data, project_id)
  VALUES (
    _user_id,
    'update',
    TG_TABLE_NAME,
    OLD.id,
    jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW)),
    _project_id
  );
  RETURN NEW;
END;
$function$;
