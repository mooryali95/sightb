-- ═══════════════════════════════════════════════════════════════════════════════
-- إعادة هيكلة السلف كأصول مدينة (Receivable) منفصلة عن المصروفات
-- - السلفة المدفوعة لا تُنشئ مصروفاً (تبقى ذمة على المورد)
-- - السلف القائمة تحجز رصيد الدفعة/العهدة
-- - 4 أنواع تسوية: documented | cash_refund | payroll_deduction | written_off
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1) أعمدة جديدة على payment_requests
DO $$ BEGIN
  CREATE TYPE public.advance_settlement_type AS ENUM ('documented','cash_refund','payroll_deduction','written_off');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS settlement_type public.advance_settlement_type,
  ADD COLUMN IF NOT EXISTS settled_amount numeric,
  ADD COLUMN IF NOT EXISTS settlement_notes text,
  ADD COLUMN IF NOT EXISTS refund_to_fund_id uuid,
  ADD COLUMN IF NOT EXISTS refund_to_custody_id uuid;

-- 2) تنظيف بيانات قديمة:
--    - السلف المدفوعة "القائمة" (is_advance_outstanding=true) لها مصروف تلقائي:
--      احذف المصروف وافصل الربط — السلفة تبقى كذمة فقط.
DO $$
DECLARE _exp_id uuid;
BEGIN
  FOR _exp_id IN
    SELECT auto_created_expense_id FROM public.payment_requests
    WHERE request_type='advance'
      AND status='paid'
      AND is_advance_outstanding = true
      AND auto_created_expense_id IS NOT NULL
  LOOP
    DELETE FROM public.expenses WHERE id = _exp_id;
  END LOOP;
  UPDATE public.payment_requests
     SET auto_created_expense_id = NULL
   WHERE request_type='advance'
     AND status='paid'
     AND is_advance_outstanding = true;
END $$;

--    - السلف المدفوعة المسوّاة سابقاً: ضع settlement_type='documented' و settled_amount=amount
UPDATE public.payment_requests
   SET settlement_type = 'documented',
       settled_amount  = amount
 WHERE request_type='advance'
   AND status='paid'
   AND is_advance_outstanding = false
   AND advance_settled_at IS NOT NULL
   AND settlement_type IS NULL;

-- 3) عدّل trigger إنشاء المصروف التلقائي: السلف لا تُنشئ مصروفاً
CREATE OR REPLACE FUNCTION public.auto_create_expense_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _resource_name text;
  _expense_id uuid;
  _category text;
  _ids uuid[];
  _desc_prefix text;
  _effective_fund_id uuid;
BEGIN
  IF NEW.status = 'paid' AND COALESCE(OLD.status, 'draft'::payment_request_status) <> 'paid'
     AND NEW.auto_created_expense_id IS NULL THEN

    -- ★ السلف لا تنشئ مصروفاً — تُعامل كذمة مدينة (Receivable) حتى التسوية
    IF NEW.request_type = 'advance' THEN
      RETURN NEW;
    END IF;

    SELECT name INTO _resource_name FROM public.resources WHERE id = NEW.resource_id;

    _category := 'other';
    IF NEW.request_type = 'salary' THEN _category := 'salary';
    ELSIF NEW.request_type = 'reimbursement' AND jsonb_array_length(NEW.linked_reimbursement_ids) > 0 THEN
      SELECT category INTO _category FROM public.resource_reimbursements
      WHERE id = (NEW.linked_reimbursement_ids->>0)::uuid;
      IF _category IS NULL THEN _category := 'other'; END IF;
    END IF;

    _desc_prefix := CASE NEW.request_type
      WHEN 'reimbursement' THEN 'استرداد: '
      WHEN 'salary' THEN 'راتب: '
      WHEN 'bonus' THEN 'مكافأة: '
      ELSE ''
    END;

    IF NEW.paid_from_custody_id IS NOT NULL THEN
      _effective_fund_id := NULL;
    ELSE
      _effective_fund_id := NEW.paid_from_fund_id;
    END IF;

    INSERT INTO public.expenses (
      project_id, resource_id, category, description, amount,
      date, month, vendor, approval_status, approved_by,
      notes, user_id, is_vat_exempt, fund_id, custody_id, budget_item_id
    ) VALUES (
      NEW.project_id, NEW.resource_id, _category,
      _desc_prefix || NEW.description,
      NEW.amount,
      COALESCE(NEW.paid_date::text, CURRENT_DATE::text),
      EXTRACT(MONTH FROM COALESCE(NEW.paid_date, CURRENT_DATE))::int,
      _resource_name, 'approved',
      COALESCE(NEW.approved_by::text, NEW.user_id::text),
      'منشأ تلقائياً من طلب صرف #' || NEW.id::text,
      NEW.user_id, false,
      _effective_fund_id, NEW.paid_from_custody_id, NEW.budget_item_id
    ) RETURNING id INTO _expense_id;

    NEW.auto_created_expense_id := _expense_id;

    IF NEW.request_type = 'reimbursement' AND jsonb_array_length(NEW.linked_reimbursement_ids) > 0 THEN
      SELECT array_agg((value)::text::uuid) INTO _ids
      FROM jsonb_array_elements_text(NEW.linked_reimbursement_ids);
      UPDATE public.resource_reimbursements
      SET status = 'reimbursed', payment_request_id = NEW.id
      WHERE id = ANY(_ids);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 4) عدّل sync_outstanding_advance_to_expense ليتعامل مع غياب المصروف بأمان
CREATE OR REPLACE FUNCTION public.sync_outstanding_advance_to_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- لم تعد السلف تنشئ مصروفاً، لكن نُبقي التزامن للسجلات القديمة فقط
  IF NEW.auto_created_expense_id IS NOT NULL THEN
    UPDATE public.expenses
       SET is_outstanding_advance = COALESCE(NEW.is_advance_outstanding, false)
     WHERE id = NEW.auto_created_expense_id
       AND is_outstanding_advance IS DISTINCT FROM COALESCE(NEW.is_advance_outstanding, false);
  END IF;
  RETURN NEW;
END;
$function$;

-- 5) تحديث check_fund_balance: السلف القائمة تحجز رصيد الدفعة
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
        -- السلف القائمة المدفوعة من هذه الدفعة
        SELECT COALESCE(SUM(amount),0) INTO _fund_outstanding_advances
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
      SELECT COALESCE(SUM(amount),0) INTO _custody_outstanding_advances
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

-- 6) تحديث check_custody_against_fund لاحتساب السلف القائمة على الدفعة
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
    SELECT COALESCE(SUM(amount),0) INTO _outstanding_advances
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