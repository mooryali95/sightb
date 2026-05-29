
-- Priority B: data integrity + split overflow linkage + delete protection

-- 1) Track linked overflow expense from split_settle_advance
ALTER TABLE public.settlement_events
  ADD COLUMN IF NOT EXISTS overflow_expense_id uuid;

-- 2) Proper FKs (drop existing if any to be idempotent, then add)
ALTER TABLE public.settlement_events
  DROP CONSTRAINT IF EXISTS settlement_events_payment_request_id_fkey,
  DROP CONSTRAINT IF EXISTS settlement_events_expense_id_fkey,
  DROP CONSTRAINT IF EXISTS settlement_events_overflow_expense_id_fkey,
  DROP CONSTRAINT IF EXISTS settlement_events_project_id_fkey,
  DROP CONSTRAINT IF EXISTS settlement_events_budget_item_id_fkey;

ALTER TABLE public.settlement_events
  ADD CONSTRAINT settlement_events_payment_request_id_fkey
    FOREIGN KEY (payment_request_id) REFERENCES public.payment_requests(id) ON DELETE CASCADE,
  ADD CONSTRAINT settlement_events_expense_id_fkey
    FOREIGN KEY (expense_id) REFERENCES public.expenses(id) ON DELETE SET NULL,
  ADD CONSTRAINT settlement_events_overflow_expense_id_fkey
    FOREIGN KEY (overflow_expense_id) REFERENCES public.expenses(id) ON DELETE SET NULL,
  ADD CONSTRAINT settlement_events_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE,
  ADD CONSTRAINT settlement_events_budget_item_id_fkey
    FOREIGN KEY (budget_item_id) REFERENCES public.budget_items(id) ON DELETE SET NULL;

-- 3) Update split_settle_advance to populate overflow_expense_id
CREATE OR REPLACE FUNCTION public.split_settle_advance(
  _payment_request_id uuid,
  _settle_amount numeric,
  _overflow_amount numeric,
  _overflow_source text,
  _overflow_fund_id uuid,
  _overflow_custody_id uuid,
  _category text,
  _description text,
  _date text,
  _month integer,
  _budget_item_id uuid,
  _notes text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _pr          public.payment_requests%ROWTYPE;
  _uid         uuid := auth.uid();
  _outstanding numeric;
  _event_id    uuid;
  _expense_id  uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO _pr FROM public.payment_requests
   WHERE id = _payment_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment_request_not_found' USING ERRCODE = 'P0001'; END IF;

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
    IF _overflow_fund_id IS NULL THEN RAISE EXCEPTION 'fund_required' USING ERRCODE = 'P0001'; END IF;
  ELSIF _overflow_source = 'custody' THEN
    IF _overflow_custody_id IS NULL THEN RAISE EXCEPTION 'custody_required' USING ERRCODE = 'P0001'; END IF;
  ELSE
    RAISE EXCEPTION 'invalid_overflow_source' USING ERRCODE = 'P0001';
  END IF;

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

  INSERT INTO public.settlement_events(
    payment_request_id, project_id, event_type, amount,
    expense_id, overflow_expense_id, notes, created_by
  ) VALUES (
    _payment_request_id, _pr.project_id, 'documented', _settle_amount,
    NULL, _expense_id, NULLIF(btrim(_notes), ''), _uid
  ) RETURNING id INTO _event_id;

  RETURN jsonb_build_object(
    'event_id', _event_id,
    'expense_id', _expense_id,
    'overflow_amount', _overflow_amount,
    'settle_amount', _settle_amount
  );
END $$;

-- 4) Block deletion of payment_request with non-reverse settlement events (admins bypass)
CREATE OR REPLACE FUNCTION public.protect_pr_with_settlements()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _has_events boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.settlement_events
    WHERE payment_request_id = OLD.id AND event_type <> 'reverse'
  ) INTO _has_events;
  IF _has_events AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'لا يمكن حذف طلب صرف عليه أحداث تسوية. تراجع عن الأحداث أولاً، أو اطلب من المدير.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS payment_requests_protect_delete_with_events ON public.payment_requests;
CREATE TRIGGER payment_requests_protect_delete_with_events
  BEFORE DELETE ON public.payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.protect_pr_with_settlements();
