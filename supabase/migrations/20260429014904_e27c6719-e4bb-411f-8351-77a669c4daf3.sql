-- 1) Protect last system owner from deletion or role downgrade
CREATE OR REPLACE FUNCTION public.protect_last_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner_count int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'owner' AND OLD.scope_type = 'system' THEN
      SELECT count(*) INTO _owner_count
      FROM public.user_roles
      WHERE role = 'owner' AND scope_type = 'system' AND id <> OLD.id;
      IF _owner_count = 0 THEN
        RAISE EXCEPTION 'Cannot remove the last system owner. Assign another owner first.'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.role = 'owner' AND OLD.scope_type = 'system'
       AND (NEW.role <> 'owner' OR NEW.scope_type <> 'system') THEN
      SELECT count(*) INTO _owner_count
      FROM public.user_roles
      WHERE role = 'owner' AND scope_type = 'system' AND id <> OLD.id;
      IF _owner_count = 0 THEN
        RAISE EXCEPTION 'Cannot downgrade the last system owner.'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_last_owner ON public.user_roles;
CREATE TRIGGER trg_protect_last_owner
BEFORE UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.protect_last_owner();

-- 2) Prevent direct DELETE of active projects (must archive first)
CREATE OR REPLACE FUNCTION public.protect_active_project_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status <> 'archived' THEN
    RAISE EXCEPTION 'Cannot delete an active project. Archive it first (set status to archived).'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_active_project_delete ON public.projects;
CREATE TRIGGER trg_protect_active_project_delete
BEFORE DELETE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.protect_active_project_delete();