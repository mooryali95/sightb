
CREATE OR REPLACE FUNCTION public.audit_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _project_id uuid := NULL;
BEGIN
  -- Dynamically get project_id only for tables that have it
  IF TG_TABLE_NAME IN ('expenses','budget_items','revenues','resources','custodies','cost_baselines') THEN
    EXECUTE format('SELECT ($1).%I', 'project_id') INTO _project_id USING OLD;
  END IF;

  INSERT INTO public.audit_log (user_id, action, table_name, record_id, record_data, project_id)
  VALUES (
    auth.uid(),
    'update',
    TG_TABLE_NAME,
    OLD.id,
    jsonb_build_object(
      'old', to_jsonb(OLD),
      'new', to_jsonb(NEW)
    ),
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
BEGIN
  IF TG_TABLE_NAME IN ('expenses','budget_items','revenues','resources','custodies','cost_baselines') THEN
    EXECUTE format('SELECT ($1).%I', 'project_id') INTO _project_id USING OLD;
  END IF;

  INSERT INTO public.audit_log (user_id, action, table_name, record_id, record_data, project_id)
  VALUES (
    auth.uid(),
    'delete',
    TG_TABLE_NAME,
    OLD.id,
    to_jsonb(OLD),
    _project_id
  );
  RETURN OLD;
END;
$function$;
