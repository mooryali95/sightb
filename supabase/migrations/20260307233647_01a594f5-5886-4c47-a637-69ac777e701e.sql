
-- 1. Fix companies INSERT policy: only admins can create companies
DROP POLICY IF EXISTS "Editors can insert companies" ON public.companies;
CREATE POLICY "Only admins can insert companies"
  ON public.companies FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND has_role(auth.uid(), 'admin'::app_role));

-- 2. Create audit trigger function for UPDATE operations
CREATE OR REPLACE FUNCTION public.audit_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.audit_log (user_id, action, table_name, record_id, record_data, project_id)
  VALUES (
    auth.uid(),
    'update',
    TG_TABLE_NAME,
    OLD.id::text,
    jsonb_build_object(
      'old', to_jsonb(OLD),
      'new', to_jsonb(NEW)
    ),
    CASE
      WHEN TG_TABLE_NAME IN ('expenses','budget_items','revenues','resources') THEN OLD.project_id
      WHEN TG_TABLE_NAME = 'custodies' THEN OLD.project_id
      WHEN TG_TABLE_NAME = 'cost_baselines' THEN OLD.project_id
      ELSE NULL
    END
  );
  RETURN NEW;
END;
$$;

-- 3. Create audit trigger function for DELETE operations (server-side, replaces client-side logDeletion)
CREATE OR REPLACE FUNCTION public.audit_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.audit_log (user_id, action, table_name, record_id, record_data, project_id)
  VALUES (
    auth.uid(),
    'delete',
    TG_TABLE_NAME,
    OLD.id::text,
    to_jsonb(OLD),
    CASE
      WHEN TG_TABLE_NAME IN ('expenses','budget_items','revenues','resources') THEN OLD.project_id
      WHEN TG_TABLE_NAME = 'custodies' THEN OLD.project_id
      WHEN TG_TABLE_NAME = 'cost_baselines' THEN OLD.project_id
      ELSE NULL
    END
  );
  RETURN OLD;
END;
$$;

-- 4. Attach UPDATE triggers to key tables
CREATE TRIGGER audit_expenses_update AFTER UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.audit_update();
CREATE TRIGGER audit_budget_items_update AFTER UPDATE ON public.budget_items FOR EACH ROW EXECUTE FUNCTION public.audit_update();
CREATE TRIGGER audit_revenues_update AFTER UPDATE ON public.revenues FOR EACH ROW EXECUTE FUNCTION public.audit_update();
CREATE TRIGGER audit_resources_update AFTER UPDATE ON public.resources FOR EACH ROW EXECUTE FUNCTION public.audit_update();
CREATE TRIGGER audit_custodies_update AFTER UPDATE ON public.custodies FOR EACH ROW EXECUTE FUNCTION public.audit_update();
CREATE TRIGGER audit_projects_update AFTER UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.audit_update();
CREATE TRIGGER audit_companies_update AFTER UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.audit_update();

-- 5. Attach DELETE triggers (server-side audit, so we can remove client-side logDeletion)
CREATE TRIGGER audit_expenses_delete BEFORE DELETE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.audit_delete();
CREATE TRIGGER audit_budget_items_delete BEFORE DELETE ON public.budget_items FOR EACH ROW EXECUTE FUNCTION public.audit_delete();
CREATE TRIGGER audit_revenues_delete BEFORE DELETE ON public.revenues FOR EACH ROW EXECUTE FUNCTION public.audit_delete();
CREATE TRIGGER audit_resources_delete BEFORE DELETE ON public.resources FOR EACH ROW EXECUTE FUNCTION public.audit_delete();
CREATE TRIGGER audit_custodies_delete BEFORE DELETE ON public.custodies FOR EACH ROW EXECUTE FUNCTION public.audit_delete();
CREATE TRIGGER audit_projects_delete BEFORE DELETE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.audit_delete();
CREATE TRIGGER audit_companies_delete BEFORE DELETE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.audit_delete();
CREATE TRIGGER audit_portfolios_delete BEFORE DELETE ON public.portfolios FOR EACH ROW EXECUTE FUNCTION public.audit_delete();
