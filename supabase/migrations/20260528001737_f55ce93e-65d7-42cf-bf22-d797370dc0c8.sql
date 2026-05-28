
-- 1) CHECK constraint: reverse events must reference original, others must not
ALTER TABLE public.settlement_events
  DROP CONSTRAINT IF EXISTS settlement_events_reverse_ref_chk;
ALTER TABLE public.settlement_events
  ADD CONSTRAINT settlement_events_reverse_ref_chk CHECK (
    (event_type = 'reverse' AND reversed_event_id IS NOT NULL)
    OR (event_type <> 'reverse' AND reversed_event_id IS NULL)
  );

-- 2) Prevent double-reverse: only one reverse per original event
CREATE UNIQUE INDEX IF NOT EXISTS settlement_events_one_reverse_per_event
  ON public.settlement_events (reversed_event_id)
  WHERE event_type = 'reverse';

-- 3) Update recalc function: ignore reverse events and any events they reverse
CREATE OR REPLACE FUNCTION public.recalc_payment_request_from_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pr_id uuid := COALESCE(NEW.payment_request_id, OLD.payment_request_id);
  _amount numeric;
  _refunded numeric;
  _settled numeric;
  _last_type public.settlement_event_type;
  _last_notes text;
BEGIN
  SELECT amount INTO _amount FROM public.payment_requests WHERE id = _pr_id;
  IF _amount IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  -- Effective events = NOT reverse AND NOT reversed by some reverse event
  WITH reversed_ids AS (
    SELECT reversed_event_id AS id
    FROM public.settlement_events
    WHERE payment_request_id = _pr_id
      AND event_type = 'reverse'
      AND reversed_event_id IS NOT NULL
  ),
  effective AS (
    SELECT se.*
    FROM public.settlement_events se
    WHERE se.payment_request_id = _pr_id
      AND se.event_type <> 'reverse'
      AND se.id NOT IN (SELECT id FROM reversed_ids)
  )
  SELECT
    COALESCE(SUM(amount) FILTER (WHERE event_type = 'cash_refund'), 0),
    COALESCE(SUM(amount) FILTER (WHERE event_type IN ('documented','payroll_deduction','written_off')), 0)
  INTO _refunded, _settled
  FROM effective;

  -- last non-reverse, non-reversed event drives the displayed settlement_type
  WITH reversed_ids AS (
    SELECT reversed_event_id AS id
    FROM public.settlement_events
    WHERE payment_request_id = _pr_id
      AND event_type = 'reverse'
      AND reversed_event_id IS NOT NULL
  )
  SELECT event_type, notes
    INTO _last_type, _last_notes
    FROM public.settlement_events
    WHERE payment_request_id = _pr_id
      AND event_type <> 'reverse'
      AND id NOT IN (SELECT id FROM reversed_ids)
    ORDER BY created_at DESC
    LIMIT 1;

  UPDATE public.payment_requests
  SET refunded_amount = _refunded,
      settled_amount = CASE WHEN (_refunded + _settled) >= _amount THEN _amount ELSE NULL END,
      is_advance_outstanding = CASE WHEN (_refunded + _settled) >= _amount THEN false ELSE true END,
      advance_settled_at = CASE WHEN (_refunded + _settled) >= _amount
                                THEN COALESCE(advance_settled_at, now()) ELSE NULL END,
      advance_settled_by = CASE WHEN (_refunded + _settled) >= _amount
                                THEN COALESCE(advance_settled_by, auth.uid()) ELSE NULL END,
      settlement_type = CASE
        WHEN _last_type IS NULL THEN NULL
        ELSE _last_type::text::public.advance_settlement_type
      END,
      settlement_notes = _last_notes
  WHERE id = _pr_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Ensure trigger covers insert (delete blocked by RLS, but recalc on any change is safe)
DROP TRIGGER IF EXISTS trg_settlement_events_recalc ON public.settlement_events;
CREATE TRIGGER trg_settlement_events_recalc
  AFTER INSERT OR DELETE ON public.settlement_events
  FOR EACH ROW EXECUTE FUNCTION public.recalc_payment_request_from_events();
