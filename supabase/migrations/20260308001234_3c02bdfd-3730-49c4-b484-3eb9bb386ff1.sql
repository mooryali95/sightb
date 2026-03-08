
-- 1. Add columns to projects
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS percent_complete INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contract_type TEXT NOT NULL DEFAULT 'lump_sum',
  ADD COLUMN IF NOT EXISTS retention_percent NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS management_reserve NUMERIC NOT NULL DEFAULT 0;

-- 2. Add columns to budget_items
ALTER TABLE public.budget_items
  ADD COLUMN IF NOT EXISTS start_month INTEGER,
  ADD COLUMN IF NOT EXISTS end_month INTEGER,
  ADD COLUMN IF NOT EXISTS cost_type TEXT NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS cost_class TEXT NOT NULL DEFAULT 'direct';

-- Migrate existing month data
UPDATE public.budget_items SET start_month = month, end_month = month WHERE month IS NOT NULL AND start_month IS NULL;

-- 3. Add columns to revenues
ALTER TABLE public.revenues
  ADD COLUMN IF NOT EXISTS revenue_type TEXT NOT NULL DEFAULT 'milestone',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'collected',
  ADD COLUMN IF NOT EXISTS invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS invoice_date TEXT,
  ADD COLUMN IF NOT EXISTS collection_date TEXT;

-- 4. Create milestones table
CREATE TABLE public.milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  planned_start TEXT,
  planned_end TEXT,
  actual_start TEXT,
  actual_end TEXT,
  percent_complete INTEGER NOT NULL DEFAULT 0,
  weight NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'planned',
  linked_revenue_id UUID REFERENCES public.revenues(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view milestones" ON public.milestones FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_access(auth.uid(), 'project'::scope_type, project_id));

CREATE POLICY "Editors can insert milestones" ON public.milestones FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND can_edit(auth.uid(), 'project'::scope_type, project_id));

CREATE POLICY "Editors can update milestones" ON public.milestones FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR can_edit(auth.uid(), 'project'::scope_type, project_id))
  WITH CHECK (user_id = (SELECT m.user_id FROM public.milestones m WHERE m.id = milestones.id));

CREATE POLICY "Owners can delete milestones" ON public.milestones FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

-- 5. Create change_orders table
CREATE TABLE public.change_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  description TEXT NOT NULL,
  change_type TEXT NOT NULL DEFAULT 'scope_addition',
  amount_impact NUMERIC NOT NULL DEFAULT 0,
  duration_impact INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'proposed',
  requested_by TEXT,
  approved_by TEXT,
  approved_date TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.change_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view change_orders" ON public.change_orders FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_access(auth.uid(), 'project'::scope_type, project_id));

CREATE POLICY "Editors can insert change_orders" ON public.change_orders FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND can_edit(auth.uid(), 'project'::scope_type, project_id));

CREATE POLICY "Editors can update change_orders" ON public.change_orders FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR can_edit(auth.uid(), 'project'::scope_type, project_id))
  WITH CHECK (user_id = (SELECT co.user_id FROM public.change_orders co WHERE co.id = change_orders.id));

CREATE POLICY "Owners can delete change_orders" ON public.change_orders FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

-- 6. Update audit triggers to include new tables
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

  IF TG_TABLE_NAME IN ('expenses','budget_items','revenues','resources','custodies','cost_baselines','milestones','change_orders') THEN
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

  IF TG_TABLE_NAME IN ('expenses','budget_items','revenues','resources','custodies','cost_baselines','milestones','change_orders') THEN
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

-- Create audit triggers on new tables
CREATE TRIGGER audit_milestones_update AFTER UPDATE ON public.milestones FOR EACH ROW EXECUTE FUNCTION public.audit_update();
CREATE TRIGGER audit_milestones_delete AFTER DELETE ON public.milestones FOR EACH ROW EXECUTE FUNCTION public.audit_delete();
CREATE TRIGGER audit_change_orders_update AFTER UPDATE ON public.change_orders FOR EACH ROW EXECUTE FUNCTION public.audit_update();
CREATE TRIGGER audit_change_orders_delete AFTER DELETE ON public.change_orders FOR EACH ROW EXECUTE FUNCTION public.audit_delete();
