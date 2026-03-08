
-- Fix: Allow system_audit triggers to handle service_role calls where auth.uid() is NULL
-- Update system_audit_user_invites to skip logging when no auth.uid()
CREATE OR REPLACE FUNCTION public.system_audit_user_invites()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid := auth.uid();
  _email text;
  _action text;
  _details jsonb;
BEGIN
  -- Skip audit if no authenticated user (e.g. service_role calls)
  IF _user_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

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
$function$;

-- Also fix system_audit_user_roles for same reason
CREATE OR REPLACE FUNCTION public.system_audit_user_roles()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid := auth.uid();
  _email text;
  _target_email text;
  _action text;
  _details jsonb;
  _target_uid uuid;
BEGIN
  IF _user_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

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
$function$;
