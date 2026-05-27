
-- نوع حدث التسوية
DO $$ BEGIN
  CREATE TYPE public.settlement_event_type AS ENUM (
    'cash_refund', 'documented', 'payroll_deduction', 'written_off', 'reverse'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- الجدول
CREATE TABLE IF NOT EXISTS public.settlement_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_request_id uuid NOT NULL,
  project_id uuid NOT NULL,
  event_type public.settlement_event_type NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  refund_to_fund_id uuid NULL,
  refund_to_custody_id uuid NULL,
  expense_id uuid NULL,
  expense_category text NULL,
  budget_item_id uuid NULL,
  notes text NULL,
  reversed_event_id uuid NULL REFERENCES public.settlement_events(id) ON DELETE SET NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settlement_events_pr  ON public.settlement_events(payment_request_id);
CREATE INDEX IF NOT EXISTS idx_settlement_events_proj ON public.settlement_events(project_id);

-- GRANT
GRANT SELECT, INSERT ON public.settlement_events TO authenticated;
GRANT ALL ON public.settlement_events TO service_role;

-- RLS
ALTER TABLE public.settlement_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View settlement events with project access"
  ON public.settlement_events FOR SELECT TO authenticated
  USING (public.has_access(auth.uid(), 'project'::scope_type, project_id));

CREATE POLICY "Editors can insert settlement events"
  ON public.settlement_events FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND public.can_edit(auth.uid(), 'project'::scope_type, project_id)
  );

CREATE POLICY "Deny updates on settlement events"
  ON public.settlement_events FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "Deny deletes on settlement events"
  ON public.settlement_events FOR DELETE TO authenticated
  USING (false);

-- محفّز إعادة حساب ملخص السلفة على payment_requests
CREATE OR REPLACE FUNCTION public.recalc_payment_request_from_events()
RETURNS trigger
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

  -- الرد النقدي يقلّل القائم. باقي الأنواع تُغلق المتبقي عند تساويه/تجاوزه.
  SELECT COALESCE(SUM(amount) FILTER (WHERE event_type = 'cash_refund'), 0),
         COALESCE(SUM(amount) FILTER (WHERE event_type IN
            ('documented','payroll_deduction','written_off')), 0)
    INTO _refunded, _settled
    FROM public.settlement_events
    WHERE payment_request_id = _pr_id;

  SELECT event_type, notes
    INTO _last_type, _last_notes
    FROM public.settlement_events
    WHERE payment_request_id = _pr_id
    ORDER BY created_at DESC
    LIMIT 1;

  UPDATE public.payment_requests
  SET refunded_amount = _refunded,
      settled_amount = CASE WHEN (_refunded + _settled) >= _amount
                            THEN _amount ELSE NULL END,
      is_advance_outstanding = CASE WHEN (_refunded + _settled) >= _amount
                                    THEN false ELSE true END,
      advance_settled_at = CASE WHEN (_refunded + _settled) >= _amount
                                 THEN COALESCE(advance_settled_at, now()) ELSE NULL END,
      settlement_type = COALESCE(_last_type::text::public.advance_settlement_type, settlement_type),
      settlement_notes = COALESCE(_last_notes, settlement_notes)
  WHERE id = _pr_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_settlement_events_recalc ON public.settlement_events;
CREATE TRIGGER trg_settlement_events_recalc
  AFTER INSERT ON public.settlement_events
  FOR EACH ROW EXECUTE FUNCTION public.recalc_payment_request_from_events();

-- محفّز التدقيق
CREATE OR REPLACE FUNCTION public.audit_settlement_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _email text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  SELECT email INTO _email FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.system_audit_log
    (user_id, user_email, action, entity_type, entity_id, entity_name, details)
  VALUES (
    auth.uid(), _email,
    'settlement_event_' || NEW.event_type::text,
    'settlement_event', NEW.id,
    'حدث تسوية: ' || NEW.event_type::text || ' بمبلغ ' || NEW.amount::text,
    jsonb_build_object(
      'payment_request_id', NEW.payment_request_id,
      'project_id', NEW.project_id,
      'amount', NEW.amount,
      'expense_id', NEW.expense_id,
      'notes', NEW.notes
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_settlement_events_audit ON public.settlement_events;
CREATE TRIGGER trg_settlement_events_audit
  AFTER INSERT ON public.settlement_events
  FOR EACH ROW EXECUTE FUNCTION public.audit_settlement_event();

-- Backfill: السلف المسوّاة سابقاً
INSERT INTO public.settlement_events
  (payment_request_id, project_id, event_type, amount, refund_to_fund_id,
   refund_to_custody_id, expense_id, notes, created_by, created_at)
SELECT
  pr.id,
  pr.project_id,
  CASE
    WHEN pr.settlement_type = 'cash_refund' THEN 'cash_refund'::public.settlement_event_type
    WHEN pr.settlement_type = 'documented' THEN 'documented'::public.settlement_event_type
    WHEN pr.settlement_type = 'payroll_deduction' THEN 'payroll_deduction'::public.settlement_event_type
    WHEN pr.settlement_type = 'written_off' THEN 'written_off'::public.settlement_event_type
  END,
  COALESCE(pr.settled_amount, pr.refunded_amount, pr.amount),
  pr.refund_to_fund_id,
  pr.refund_to_custody_id,
  (SELECT id FROM public.expenses
    WHERE source_payment_request_id = pr.id
    ORDER BY created_at ASC LIMIT 1),
  COALESCE(pr.settlement_notes, '[backfill]'),
  COALESCE(pr.advance_settled_by, pr.user_id),
  COALESCE(pr.advance_settled_at, pr.updated_at, now())
FROM public.payment_requests pr
WHERE pr.request_type = 'advance'
  AND pr.settlement_type IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.settlement_events se WHERE se.payment_request_id = pr.id
  );

-- Backfill: سلف بها رد جزئي بدون settlement_type
INSERT INTO public.settlement_events
  (payment_request_id, project_id, event_type, amount, refund_to_fund_id,
   refund_to_custody_id, notes, created_by, created_at)
SELECT
  pr.id, pr.project_id, 'cash_refund'::public.settlement_event_type,
  pr.refunded_amount, pr.refund_to_fund_id, pr.refund_to_custody_id,
  '[backfill رد جزئي]', pr.user_id, COALESCE(pr.updated_at, now())
FROM public.payment_requests pr
WHERE pr.request_type = 'advance'
  AND pr.settlement_type IS NULL
  AND COALESCE(pr.refunded_amount, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.settlement_events se WHERE se.payment_request_id = pr.id
  );
