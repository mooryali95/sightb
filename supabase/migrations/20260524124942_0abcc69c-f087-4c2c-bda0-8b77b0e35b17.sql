-- 1. أعمدة جديدة
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS source_payment_request_id uuid;

CREATE INDEX IF NOT EXISTS idx_expenses_source_payment_request_id
  ON public.expenses(source_payment_request_id) WHERE source_payment_request_id IS NOT NULL;

ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS refunded_amount numeric NOT NULL DEFAULT 0;

-- 2. تعديل حساب الرصيد ليأخذ السلف ذات الرد الجزئي بعين الاعتبار
CREATE OR REPLACE FUNCTION public.check_fund_balance()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _fund_total numeric;
  _fund_direct_spent numeric;
  _fund_custody_draw numeric;
  _fund_outstanding_advances numeric;
  _custody_total numeric;
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
        IF (_fund_direct_spent + _fund_custody_draw + _fund_outstanding_advances + NEW.amount) > _fund_total THEN
          RAISE EXCEPTION 'المصروف يتجاوز الرصيد المتبقي للدفعة. المتاح: %, المطلوب: %',
            (_fund_total - _fund_direct_spent - _fund_custody_draw - _fund_outstanding_advances)::text, NEW.amount::text
            USING ERRCODE = 'P0001';
        END IF;
      END IF;
    END IF;
  END IF;

  IF NEW.custody_id IS NOT NULL THEN
    SELECT amount INTO _custody_total FROM public.custodies WHERE id = NEW.custody_id;
    IF _custody_total IS NOT NULL THEN
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
      IF (_custody_spent + _custody_outstanding_advances + NEW.amount) > _custody_total THEN
        RAISE EXCEPTION 'المصروف يتجاوز رصيد العهدة. المتاح: %, المطلوب: %',
          (_custody_total - _custody_spent - _custody_outstanding_advances)::text, NEW.amount::text
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_custody_against_fund()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _fund_total numeric;
  _direct_spent numeric;
  _other_custody_draw numeric;
  _outstanding_advances numeric;
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
    IF (_direct_spent + _other_custody_draw + _outstanding_advances + NEW.amount) > _fund_total THEN
      RAISE EXCEPTION 'مبلغ العهدة يتجاوز رصيد الدفعة. المتاح: %, المطلوب: %',
        (_fund_total - _direct_spent - _other_custody_draw - _outstanding_advances)::text, NEW.amount::text
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 3. حماية صلاحية الشطب — فقط الأدمن
CREATE OR REPLACE FUNCTION public.enforce_advance_write_off_admin()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.settlement_type = 'written_off'
     AND (OLD.settlement_type IS DISTINCT FROM 'written_off')
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'شطب السلفة صلاحية مدير فقط.'
      USING ERRCODE = 'P0001';
  END IF;
  IF NEW.settlement_type = 'written_off'
     AND (OLD.settlement_type IS DISTINCT FROM 'written_off')
     AND COALESCE(btrim(NEW.settlement_notes), '') = '' THEN
    RAISE EXCEPTION 'سبب الشطب مطلوب.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_advance_write_off_admin ON public.payment_requests;
CREATE TRIGGER trg_enforce_advance_write_off_admin
BEFORE UPDATE ON public.payment_requests
FOR EACH ROW EXECUTE FUNCTION public.enforce_advance_write_off_admin();

-- 4. تدقيق صريح لتسويات السلف في system_audit_log
CREATE OR REPLACE FUNCTION public.audit_advance_settlement()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid := auth.uid();
  _email text;
BEGIN
  IF _user_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.settlement_type IS DISTINCT FROM OLD.settlement_type AND NEW.settlement_type IS NOT NULL THEN
    SELECT email INTO _email FROM public.profiles WHERE id = _user_id;
    INSERT INTO public.system_audit_log
      (user_id, user_email, action, entity_type, entity_id, entity_name, details)
    VALUES (
      _user_id, _email,
      'advance_settle_' || NEW.settlement_type::text,
      'payment_request', NEW.id,
      'تسوية سلفة: ' || COALESCE(NEW.description, ''),
      jsonb_build_object(
        'amount', NEW.amount,
        'settled_amount', NEW.settled_amount,
        'refunded_amount', NEW.refunded_amount,
        'settlement_notes', NEW.settlement_notes,
        'refund_to_fund_id', NEW.refund_to_fund_id,
        'refund_to_custody_id', NEW.refund_to_custody_id,
        'project_id', NEW.project_id
      )
    );
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_audit_advance_settlement ON public.payment_requests;
CREATE TRIGGER trg_audit_advance_settlement
AFTER UPDATE ON public.payment_requests
FOR EACH ROW EXECUTE FUNCTION public.audit_advance_settlement();

-- 5. تشديد سياسة الحذف: لا يجوز حذف سلفة مدفوعة (قائمة أو مسوّاة)
DROP POLICY IF EXISTS "Admins can delete payment requests" ON public.payment_requests;
CREATE POLICY "Admins can delete payment requests"
ON public.payment_requests
FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND status = ANY (ARRAY[
    'draft'::payment_request_status,
    'cancelled'::payment_request_status,
    'rejected'::payment_request_status
  ])
);