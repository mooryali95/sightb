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
  _self uuid := COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
BEGIN
  -- An advance's outstanding part is cash already counted as drawn. An
  -- expense that settles that advance (source_payment_request_id) converts
  -- it, so it must reduce the outstanding figure instead of being counted twice.
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
        WHERE e.fund_id = NEW.fund_id AND e.id <> _self
          AND (cu.source_fund_id IS NULL OR cu.source_fund_id <> NEW.fund_id);
        SELECT COALESCE(SUM(amount),0) INTO _fund_custody_draw
        FROM public.custodies WHERE source_fund_id = NEW.fund_id;
        SELECT COALESCE(SUM(GREATEST(pr.amount - COALESCE(pr.refunded_amount,0)
            - COALESCE((SELECT SUM(x.amount) FROM public.expenses x
                        WHERE x.source_payment_request_id = pr.id AND x.id <> _self
                          AND x.fund_id = NEW.fund_id), 0)
            - CASE WHEN pr.id = NEW.source_payment_request_id THEN NEW.amount ELSE 0 END, 0)),0)
          INTO _fund_outstanding_advances
        FROM public.payment_requests pr
        WHERE pr.paid_from_fund_id = NEW.fund_id AND pr.request_type = 'advance'
          AND pr.status = 'paid' AND pr.is_advance_outstanding = true;
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
      FROM public.expenses WHERE custody_id = NEW.custody_id AND id <> _self;
      SELECT COALESCE(SUM(GREATEST(pr.amount - COALESCE(pr.refunded_amount,0)
          - COALESCE((SELECT SUM(x.amount) FROM public.expenses x
                      WHERE x.source_payment_request_id = pr.id AND x.id <> _self
                        AND x.custody_id = NEW.custody_id), 0)
          - CASE WHEN pr.id = NEW.source_payment_request_id THEN NEW.amount ELSE 0 END, 0)),0)
        INTO _custody_outstanding_advances
      FROM public.payment_requests pr
      WHERE pr.paid_from_custody_id = NEW.custody_id AND pr.request_type = 'advance'
        AND pr.status = 'paid' AND pr.is_advance_outstanding = true;
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
REVOKE EXECUTE ON FUNCTION public.check_fund_balance() FROM PUBLIC, anon, authenticated;