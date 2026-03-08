
-- System-level audit log for owner tracking
CREATE TABLE public.system_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_email text,
  action text NOT NULL, -- 'insert', 'update', 'delete'
  entity_type text NOT NULL, -- 'company', 'portfolio', 'user_role', 'user_invite', 'project'
  entity_id uuid,
  entity_name text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.system_audit_log ENABLE ROW LEVEL SECURITY;

-- Only owner can view
CREATE POLICY "Only owner can view system audit log" ON public.system_audit_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'owner' AND scope_type = 'system'
    )
  );

-- No direct insert/update/delete from client
-- Triggers will use SECURITY DEFINER

-- Trigger function for companies
CREATE OR REPLACE FUNCTION public.system_audit_companies()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _email text;
  _action text;
  _details jsonb;
BEGIN
  SELECT email INTO _email FROM public.profiles WHERE id = _user_id;

  IF TG_OP = 'INSERT' THEN
    _action := 'insert';
    _details := jsonb_build_object('name', NEW.name, 'status', NEW.status);
    INSERT INTO system_audit_log (user_id, user_email, action, entity_type, entity_id, entity_name, details)
    VALUES (_user_id, _email, _action, 'company', NEW.id, NEW.name, _details);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    _action := 'update';
    _details := jsonb_build_object('old', jsonb_build_object('name', OLD.name, 'status', OLD.status), 'new', jsonb_build_object('name', NEW.name, 'status', NEW.status));
    INSERT INTO system_audit_log (user_id, user_email, action, entity_type, entity_id, entity_name, details)
    VALUES (_user_id, _email, _action, 'company', OLD.id, NEW.name, _details);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    _action := 'delete';
    _details := jsonb_build_object('name', OLD.name);
    INSERT INTO system_audit_log (user_id, user_email, action, entity_type, entity_id, entity_name, details)
    VALUES (_user_id, _email, _action, 'company', OLD.id, OLD.name, _details);
    RETURN OLD;
  END IF;
END;
$$;

CREATE TRIGGER trg_system_audit_companies
  AFTER INSERT OR UPDATE OR DELETE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.system_audit_companies();

-- Trigger function for portfolios
CREATE OR REPLACE FUNCTION public.system_audit_portfolios()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _email text;
  _action text;
  _details jsonb;
BEGIN
  SELECT email INTO _email FROM public.profiles WHERE id = _user_id;

  IF TG_OP = 'INSERT' THEN
    _action := 'insert';
    _details := jsonb_build_object('name', NEW.name, 'company_id', NEW.company_id);
    INSERT INTO system_audit_log (user_id, user_email, action, entity_type, entity_id, entity_name, details)
    VALUES (_user_id, _email, _action, 'portfolio', NEW.id, NEW.name, _details);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    _action := 'update';
    _details := jsonb_build_object('old', jsonb_build_object('name', OLD.name), 'new', jsonb_build_object('name', NEW.name));
    INSERT INTO system_audit_log (user_id, user_email, action, entity_type, entity_id, entity_name, details)
    VALUES (_user_id, _email, _action, 'portfolio', OLD.id, NEW.name, _details);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    _action := 'delete';
    _details := jsonb_build_object('name', OLD.name);
    INSERT INTO system_audit_log (user_id, user_email, action, entity_type, entity_id, entity_name, details)
    VALUES (_user_id, _email, _action, 'portfolio', OLD.id, OLD.name, _details);
    RETURN OLD;
  END IF;
END;
$$;

CREATE TRIGGER trg_system_audit_portfolios
  AFTER INSERT OR UPDATE OR DELETE ON public.portfolios
  FOR EACH ROW EXECUTE FUNCTION public.system_audit_portfolios();

-- Trigger function for projects
CREATE OR REPLACE FUNCTION public.system_audit_projects()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _email text;
  _action text;
  _details jsonb;
BEGIN
  SELECT email INTO _email FROM public.profiles WHERE id = _user_id;

  IF TG_OP = 'INSERT' THEN
    _action := 'insert';
    _details := jsonb_build_object('name', NEW.name, 'company_id', NEW.company_id, 'status', NEW.status, 'contract_value', NEW.contract_value);
    INSERT INTO system_audit_log (user_id, user_email, action, entity_type, entity_id, entity_name, details)
    VALUES (_user_id, _email, _action, 'project', NEW.id, NEW.name, _details);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    _action := 'update';
    _details := jsonb_build_object('old', jsonb_build_object('name', OLD.name, 'status', OLD.status), 'new', jsonb_build_object('name', NEW.name, 'status', NEW.status));
    INSERT INTO system_audit_log (user_id, user_email, action, entity_type, entity_id, entity_name, details)
    VALUES (_user_id, _email, _action, 'project', OLD.id, NEW.name, _details);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    _action := 'delete';
    _details := jsonb_build_object('name', OLD.name);
    INSERT INTO system_audit_log (user_id, user_email, action, entity_type, entity_id, entity_name, details)
    VALUES (_user_id, _email, _action, 'project', OLD.id, OLD.name, _details);
    RETURN OLD;
  END IF;
END;
$$;

CREATE TRIGGER trg_system_audit_projects
  AFTER INSERT OR UPDATE OR DELETE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.system_audit_projects();

-- Trigger function for user_roles
CREATE OR REPLACE FUNCTION public.system_audit_user_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _email text;
  _target_email text;
  _action text;
  _details jsonb;
  _target_uid uuid;
BEGIN
  SELECT email INTO _email FROM public.profiles WHERE id = _user_id;

  IF TG_OP = 'INSERT' THEN
    _target_uid := NEW.user_id;
    SELECT email INTO _target_email FROM public.profiles WHERE id = _target_uid;
    _action := 'insert';
    _details := jsonb_build_object('target_user_id', _target_uid, 'target_email', _target_email, 'role', NEW.role, 'scope_type', NEW.scope_type, 'scope_id', NEW.scope_id);
    INSERT INTO system_audit_log (user_id, user_email, action, entity_type, entity_id, entity_name, details)
    VALUES (_user_id, _email, _action, 'user_role', NEW.id, NEW.role::text || ' → ' || COALESCE(_target_email, _target_uid::text), _details);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    _target_uid := OLD.user_id;
    SELECT email INTO _target_email FROM public.profiles WHERE id = _target_uid;
    _action := 'update';
    _details := jsonb_build_object('target_user_id', _target_uid, 'target_email', _target_email, 'old_role', OLD.role, 'new_role', NEW.role, 'scope_type', NEW.scope_type);
    INSERT INTO system_audit_log (user_id, user_email, action, entity_type, entity_id, entity_name, details)
    VALUES (_user_id, _email, _action, 'user_role', OLD.id, OLD.role::text || ' → ' || NEW.role::text || ' (' || COALESCE(_target_email, '') || ')', _details);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    _target_uid := OLD.user_id;
    SELECT email INTO _target_email FROM public.profiles WHERE id = _target_uid;
    _action := 'delete';
    _details := jsonb_build_object('target_user_id', _target_uid, 'target_email', _target_email, 'role', OLD.role, 'scope_type', OLD.scope_type, 'scope_id', OLD.scope_id);
    INSERT INTO system_audit_log (user_id, user_email, action, entity_type, entity_id, entity_name, details)
    VALUES (_user_id, _email, _action, 'user_role', OLD.id, OLD.role::text || ' ✕ ' || COALESCE(_target_email, _target_uid::text), _details);
    RETURN OLD;
  END IF;
END;
$$;

CREATE TRIGGER trg_system_audit_user_roles
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.system_audit_user_roles();

-- Trigger function for user_invites
CREATE OR REPLACE FUNCTION public.system_audit_user_invites()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _email text;
  _action text;
  _details jsonb;
BEGIN
  SELECT email INTO _email FROM public.profiles WHERE id = _user_id;

  IF TG_OP = 'INSERT' THEN
    _action := 'insert';
    _details := jsonb_build_object('invited_email', NEW.email, 'role', NEW.role, 'scope_type', NEW.scope_type, 'scope_id', NEW.scope_id);
    INSERT INTO system_audit_log (user_id, user_email, action, entity_type, entity_id, entity_name, details)
    VALUES (_user_id, _email, _action, 'user_invite', NEW.id, NEW.role::text || ' → ' || NEW.email, _details);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    _action := 'update';
    _details := jsonb_build_object('invited_email', NEW.email, 'old_status', OLD.status, 'new_status', NEW.status);
    INSERT INTO system_audit_log (user_id, user_email, action, entity_type, entity_id, entity_name, details)
    VALUES (_user_id, _email, _action, 'user_invite', OLD.id, NEW.email || ' (' || NEW.status || ')', _details);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    _action := 'delete';
    _details := jsonb_build_object('invited_email', OLD.email, 'role', OLD.role);
    INSERT INTO system_audit_log (user_id, user_email, action, entity_type, entity_id, entity_name, details)
    VALUES (_user_id, _email, _action, 'user_invite', OLD.id, OLD.email, _details);
    RETURN OLD;
  END IF;
END;
$$;

CREATE TRIGGER trg_system_audit_user_invites
  AFTER INSERT OR UPDATE OR DELETE ON public.user_invites
  FOR EACH ROW EXECUTE FUNCTION public.system_audit_user_invites();
