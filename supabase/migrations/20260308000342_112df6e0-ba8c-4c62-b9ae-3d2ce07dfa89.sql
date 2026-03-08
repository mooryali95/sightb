
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
  -- Skip audit if no authenticated user (e.g. admin SQL console)
  IF _user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME IN ('expenses','budget_items','revenues','resources','custodies','cost_baselines') THEN
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

  IF TG_TABLE_NAME IN ('expenses','budget_items','revenues','resources','custodies','cost_baselines') THEN
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
