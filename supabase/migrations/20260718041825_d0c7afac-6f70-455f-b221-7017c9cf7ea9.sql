
CREATE OR REPLACE FUNCTION public.audit_emergency_fund_create()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _blocking RECORD;
  _reason text;
BEGIN
  -- Detect an emergency create: another fund on the same project not yet settled.
  SELECT fund_number, status
    INTO _blocking
  FROM public.project_funds
  WHERE project_id = NEW.project_id
    AND id <> NEW.id
    AND status <> 'settled'
  ORDER BY fund_number ASC
  LIMIT 1;

  IF _blocking.fund_number IS NULL THEN
    RETURN NEW; -- normal (non-emergency) fund creation
  END IF;

  SELECT email INTO _email FROM public.profiles WHERE id = _uid;

  -- Extract reason from notes if it uses the "[دفعة استثنائية] …" marker
  IF NEW.notes IS NOT NULL AND position('[دفعة استثنائية]' in NEW.notes) > 0 THEN
    _reason := btrim(replace(NEW.notes, '[دفعة استثنائية]', ''));
  ELSE
    _reason := NEW.notes;
  END IF;

  INSERT INTO public.system_audit_log
    (user_id, user_email, action, entity_type, entity_id, entity_name, details)
  VALUES (
    _uid, _email,
    'emergency_fund_create',
    'project_fund',
    NEW.id,
    'دفعة استثنائية #' || NEW.fund_number::text || ' — ' || NEW.amount::text,
    jsonb_build_object(
      'project_id', NEW.project_id,
      'amount', NEW.amount,
      'fund_number', NEW.fund_number,
      'transfer_date', NEW.transfer_date,
      'blocking_fund_number', _blocking.fund_number,
      'blocking_fund_status', _blocking.status,
      'reason', _reason,
      'created_by', NEW.created_by
    )
  );

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.audit_emergency_fund_create() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_emergency_fund_create ON public.project_funds;
CREATE TRIGGER trg_audit_emergency_fund_create
AFTER INSERT ON public.project_funds
FOR EACH ROW EXECUTE FUNCTION public.audit_emergency_fund_create();
