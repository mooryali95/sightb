
-- 1) Make legacy sync trigger function a no-op before dropping column
CREATE OR REPLACE FUNCTION public.sync_outstanding_advance_to_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN NEW;
END;
$$;

-- 2) Drop the legacy column
ALTER TABLE public.expenses DROP COLUMN IF EXISTS is_outstanding_advance;

-- 3) Atomic split settle advance RPC
CREATE OR REPLACE FUNCTION public.split_settle_advance(
  _payment_request_id  uuid,
  _settle_amount       numeric,
  _overflow_amount     numeric,
  _overflow_source     text,
  _overflow_fund_id    uuid,
  _overflow_custody_id uuid,
  _category            text,
  _description         text,
  _date                text,
  _month               int,
  _budget_item_id      uuid,
  _notes               text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pr          public.payment_requests%ROWTYPE;
  _uid         uuid := auth.uid();
  _outstanding numeric;
  _event_id    uuid;
  _expense_id  uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO _pr FROM public.payment_requests
   WHERE id = _payment_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_request_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.can_edit(_uid, 'project'::scope_type, _pr.project_id) THEN
    RAISE EXCEPTION 'insufficient_permission' USING ERRCODE = 'P0001';
  END IF;

  IF _pr.request_type <> 'advance' OR NOT _pr.is_advance_outstanding THEN
    RAISE EXCEPTION 'advance_not_outstanding' USING ERRCODE = 'P0001';
  END IF;

  IF _settle_amount <= 0 OR _overflow_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amounts' USING ERRCODE = 'P0001';
  END IF;

  _outstanding := GREATEST(_pr.amount - COALESCE(_pr.refunded_amount, 0), 0);
  IF _settle_amount > _outstanding THEN
    RAISE EXCEPTION 'settle_exceeds_outstanding' USING ERRCODE = 'P0001';
  END IF;

  IF _overflow_source = 'fund' THEN
    IF _overflow_fund_id IS NULL THEN
      RAISE EXCEPTION 'fund_required' USING ERRCODE = 'P0001';
    END IF;
  ELSIF _overflow_source = 'custody' THEN
    IF _overflow_custody_id IS NULL THEN
      RAISE EXCEPTION 'custody_required' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid_overflow_source' USING ERRCODE = 'P0001';
  END IF;

  -- Insert overflow expense (check_fund_balance trigger validates balance)
  INSERT INTO public.expenses(
    user_id, project_id, budget_item_id, category, description, amount,
    date, month, resource_id, notes, fund_id, custody_id,
    source_payment_request_id, approval_status, approved_by, is_vat_exempt
  ) VALUES (
    _uid, _pr.project_id, _budget_item_id, _category, _description, _overflow_amount,
    _date, _month, _pr.resource_id,
    'فائض تسوية سلفة #' || _payment_request_id::text
      || COALESCE(' — ' || NULLIF(btrim(_notes), ''), ''),
    CASE WHEN _overflow_source = 'fund'    THEN _overflow_fund_id    END,
    CASE WHEN _overflow_source = 'custody' THEN _overflow_custody_id END,
    _payment_request_id, 'approved', _uid::text, false
  ) RETURNING id INTO _expense_id;

  -- Settlement event closes the advance (recalc trigger updates PR)
  INSERT INTO public.settlement_events(
    payment_request_id, project_id, event_type, amount,
    expense_id, notes, created_by
  ) VALUES (
    _payment_request_id, _pr.project_id, 'documented', _settle_amount,
    NULL, NULLIF(btrim(_notes), ''), _uid
  ) RETURNING id INTO _event_id;

  RETURN jsonb_build_object(
    'event_id', _event_id,
    'expense_id', _expense_id,
    'overflow_amount', _overflow_amount,
    'settle_amount', _settle_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.split_settle_advance(
  uuid, numeric, numeric, text, uuid, uuid, text, text, text, int, uuid, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.split_settle_advance(
  uuid, numeric, numeric, text, uuid, uuid, text, text, text, int, uuid, text
) TO authenticated;
