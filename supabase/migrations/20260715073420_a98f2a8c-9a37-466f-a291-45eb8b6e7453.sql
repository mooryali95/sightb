
-- 1) check_fund_balance: include cash_transfers on both sides
CREATE OR REPLACE FUNCTION public.check_fund_balance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _fund_total numeric;
  _fund_direct_spent numeric;
  _fund_custody_draw numeric;
  _fund_outstanding_advances numeric;
  _fund_cash_transfers_out numeric;
  _custody_total numeric;
  _custody_cash_in numeric;
  _custody_spent numeric;
  _custody_outstanding_advances numeric;
  _new_custody_source uuid;
BEGIN
  IF NEW.fund_id IS NOT NULL THEN
    SELECT source_fund_id INTO _new_custody_source FROM public.custodies WHERE id = NEW.custody_id;
    IF _new_custody_source IS NOT NULL AND _new_custody_source = NEW.fund_id THEN
      NULL;
    ELSE
      SELECT amount INTO _fund_total FROM public.project_funds WHERE id = NEW.fund_id;
      IF _fund_total IS NOT NULL THEN
        SELECT COALESCE(SUM(e.amount),0) INTO _fund_direct_spent
        FROM public.expenses e
        LEFT JOIN public.custodies cu ON cu.id = e.custody_id
        WHERE e.fund_id = NEW.fund_id
          AND e.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
          AND (cu.source_fund_id IS NULL OR cu.source_fund_id <> NEW.fund_id);
        SELECT COALESCE(SUM(amount),0) INTO _fund_custody_draw
        FROM public.custodies WHERE source_fund_id = NEW.fund_id;
        SELECT COALESCE(SUM(GREATEST(amount - COALESCE(refunded_amount,0), 0)),0) INTO _fund_outstanding_advances
        FROM public.payment_requests
        WHERE paid_from_fund_id = NEW.fund_id
          AND request_type = 'advance'
          AND status = 'paid'
          AND is_advance_outstanding = true;
        SELECT COALESCE(SUM(amount),0) INTO _fund_cash_transfers_out
        FROM public.cash_transfers WHERE from_fund_id = NEW.fund_id;
        IF (_fund_direct_spent + _fund_custody_draw + _fund_outstanding_advances + _fund_cash_transfers_out + NEW.amount) > _fund_total THEN
          RAISE EXCEPTION 'المصروف يتجاوز الرصيد المتبقي للدفعة. المتاح: %, المطلوب: %',
            (_fund_total - _fund_direct_spent - _fund_custody_draw - _fund_outstanding_advances - _fund_cash_transfers_out)::text, NEW.amount::text
            USING ERRCODE = 'P0001';
        END IF;
      END IF;
    END IF;
  END IF;

  IF NEW.custody_id IS NOT NULL THEN
    SELECT amount INTO _custody_total FROM public.custodies WHERE id = NEW.custody_id;
    IF _custody_total IS NOT NULL THEN
      SELECT COALESCE(SUM(amount),0) INTO _custody_cash_in
      FROM public.cash_transfers WHERE to_custody_id = NEW.custody_id;
      SELECT COALESCE(SUM(amount),0) INTO _custody_spent
      FROM public.expenses
      WHERE custody_id = NEW.custody_id
        AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
      SELECT COALESCE(SUM(GREATEST(amount - COALESCE(refunded_amount,0), 0)),0) INTO _custody_outstanding_advances
      FROM public.payment_requests
      WHERE paid_from_custody_id = NEW.custody_id
        AND request_type = 'advance'
        AND status = 'paid'
        AND is_advance_outstanding = true;
      IF (_custody_spent + _custody_outstanding_advances + NEW.amount) > (_custody_total + _custody_cash_in) THEN
        RAISE EXCEPTION 'المصروف يتجاوز رصيد العهدة. المتاح: %, المطلوب: %',
          (_custody_total + _custody_cash_in - _custody_spent - _custody_outstanding_advances)::text, NEW.amount::text
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) check_custody_against_fund: subtract cash transfers already made from that fund
CREATE OR REPLACE FUNCTION public.check_custody_against_fund()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _fund_total numeric;
  _direct_spent numeric;
  _other_custody_draw numeric;
  _outstanding_advances numeric;
  _cash_transfers_out numeric;
BEGIN
  IF NEW.source_fund_id IS NOT NULL THEN
    SELECT amount INTO _fund_total FROM public.project_funds WHERE id = NEW.source_fund_id;
    IF _fund_total IS NULL THEN
      RAISE EXCEPTION 'الدفعة المصدر غير موجودة' USING ERRCODE = 'P0001';
    END IF;
    SELECT COALESCE(SUM(e.amount),0) INTO _direct_spent
    FROM public.expenses e
    LEFT JOIN public.custodies cu ON cu.id = e.custody_id
    WHERE e.fund_id = NEW.source_fund_id
      AND (cu.source_fund_id IS NULL OR cu.source_fund_id <> NEW.source_fund_id);
    SELECT COALESCE(SUM(amount),0) INTO _other_custody_draw
    FROM public.custodies
    WHERE source_fund_id = NEW.source_fund_id
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
    SELECT COALESCE(SUM(GREATEST(amount - COALESCE(refunded_amount,0), 0)),0) INTO _outstanding_advances
    FROM public.payment_requests
    WHERE paid_from_fund_id = NEW.source_fund_id
      AND request_type = 'advance'
      AND status = 'paid'
      AND is_advance_outstanding = true;
    SELECT COALESCE(SUM(amount),0) INTO _cash_transfers_out
    FROM public.cash_transfers WHERE from_fund_id = NEW.source_fund_id;
    IF (_direct_spent + _other_custody_draw + _outstanding_advances + _cash_transfers_out + NEW.amount) > _fund_total THEN
      RAISE EXCEPTION 'مبلغ العهدة يتجاوز رصيد الدفعة. المتاح: %, المطلوب: %',
        (_fund_total - _direct_spent - _other_custody_draw - _outstanding_advances - _cash_transfers_out)::text, NEW.amount::text
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 3) auto_close_custody_on_exhaustion: use custody.amount + cash_transfers_in
CREATE OR REPLACE FUNCTION public.auto_close_custody_on_exhaustion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _affected_custodies uuid[];
  _cid uuid;
  _total numeric;
  _cash_in numeric;
  _spent numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _affected_custodies := ARRAY[NEW.custody_id];
  ELSIF TG_OP = 'UPDATE' THEN
    _affected_custodies := ARRAY[NEW.custody_id, OLD.custody_id];
  ELSIF TG_OP = 'DELETE' THEN
    _affected_custodies := ARRAY[OLD.custody_id];
  END IF;

  FOREACH _cid IN ARRAY _affected_custodies LOOP
    IF _cid IS NOT NULL THEN
      SELECT amount INTO _total FROM public.custodies WHERE id = _cid;
      SELECT COALESCE(SUM(amount),0) INTO _cash_in FROM public.cash_transfers WHERE to_custody_id = _cid;
      SELECT COALESCE(SUM(amount),0) INTO _spent FROM public.expenses WHERE custody_id = _cid;
      IF _total IS NOT NULL THEN
        IF _spent >= (_total + _cash_in) THEN
          UPDATE public.custodies
          SET status = 'closed',
              closed_date = COALESCE(closed_date, CURRENT_DATE::text)
          WHERE id = _cid AND status = 'active';
        ELSE
          UPDATE public.custodies
          SET status = 'active',
              closed_date = NULL
          WHERE id = _cid AND status = 'closed';
        END IF;
      END IF;
    END IF;
  END LOOP;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

-- 4) New guard on cash_transfers
CREATE OR REPLACE FUNCTION public.validate_cash_transfer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _fund RECORD;
  _custody_status text;
  _direct_spent numeric;
  _custody_draw numeric;
  _outstanding_advances numeric;
  _other_transfers_out numeric;
  _available numeric;
BEGIN
  SELECT status, amount INTO _fund FROM public.project_funds WHERE id = NEW.from_fund_id;
  IF _fund IS NULL THEN
    RAISE EXCEPTION 'الدفعة المصدر غير موجودة' USING ERRCODE = 'P0001';
  END IF;
  IF _fund.status NOT IN ('transferred','acknowledged') THEN
    RAISE EXCEPTION 'لا يمكن التحويل من دفعة غير نشطة (الحالة: %)', _fund.status
      USING ERRCODE = 'P0001';
  END IF;

  SELECT status INTO _custody_status FROM public.custodies WHERE id = NEW.to_custody_id;
  IF _custody_status IS NULL THEN
    RAISE EXCEPTION 'العهدة المستهدفة غير موجودة' USING ERRCODE = 'P0001';
  END IF;
  IF _custody_status = 'closed' THEN
    RAISE EXCEPTION 'لا يمكن التحويل إلى عهدة مُقفلة' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.amount <= 0 THEN
    RAISE EXCEPTION 'مبلغ التحويل يجب أن يكون أكبر من صفر' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(SUM(e.amount),0) INTO _direct_spent
  FROM public.expenses e
  LEFT JOIN public.custodies cu ON cu.id = e.custody_id
  WHERE e.fund_id = NEW.from_fund_id
    AND (cu.source_fund_id IS NULL OR cu.source_fund_id <> NEW.from_fund_id);
  SELECT COALESCE(SUM(amount),0) INTO _custody_draw
  FROM public.custodies WHERE source_fund_id = NEW.from_fund_id;
  SELECT COALESCE(SUM(GREATEST(amount - COALESCE(refunded_amount,0), 0)),0) INTO _outstanding_advances
  FROM public.payment_requests
  WHERE paid_from_fund_id = NEW.from_fund_id
    AND request_type = 'advance'
    AND status = 'paid'
    AND is_advance_outstanding = true;
  SELECT COALESCE(SUM(amount),0) INTO _other_transfers_out
  FROM public.cash_transfers
  WHERE from_fund_id = NEW.from_fund_id
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  _available := _fund.amount - _direct_spent - _custody_draw - _outstanding_advances - _other_transfers_out;
  IF NEW.amount > _available THEN
    RAISE EXCEPTION 'مبلغ التحويل يتجاوز رصيد الدفعة. المتاح: %, المطلوب: %',
      _available::text, NEW.amount::text
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_cash_transfer ON public.cash_transfers;
CREATE TRIGGER trg_validate_cash_transfer
BEFORE INSERT OR UPDATE ON public.cash_transfers
FOR EACH ROW EXECUTE FUNCTION public.validate_cash_transfer();
