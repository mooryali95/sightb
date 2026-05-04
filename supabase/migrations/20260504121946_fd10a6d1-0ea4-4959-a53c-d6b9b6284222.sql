
-- =====================================================================
-- M3: علامة legacy للمصروفات التاريخية السابقة لأول دفعة
-- =====================================================================
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS legacy_pre_fund boolean NOT NULL DEFAULT false;

-- وسم المصروفات التاريخية القديمة (مرة واحدة فقط)
UPDATE public.expenses e
SET legacy_pre_fund = true
WHERE fund_id IS NULL
  AND legacy_pre_fund = false
  AND NOT EXISTS (
    SELECT 1 FROM public.project_funds pf
    WHERE pf.project_id = e.project_id
      AND pf.transfer_date <= COALESCE(NULLIF(e.date,'')::date, e.created_at::date)
  );

-- =====================================================================
-- M1: فرض ربط المصروف بالدفعة على مستوى القاعدة
-- =====================================================================
CREATE OR REPLACE FUNCTION public.enforce_expense_fund_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _has_active_fund boolean;
BEGIN
  -- استثناء المصروفات المُنشأة تلقائياً من نظام الاسترداد
  IF NEW.notes IS NOT NULL AND NEW.notes LIKE 'منشأ تلقائياً%' THEN
    RETURN NEW;
  END IF;

  -- استثناء المصروفات التاريخية الموسومة
  IF NEW.legacy_pre_fund = true THEN
    RETURN NEW;
  END IF;

  -- إذا fund_id موجود، تخطّ — سيُفحص بـ check_fund_balance
  IF NEW.fund_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- تحقّق إن كان للمشروع دفعة نشطة (مُستلمة أو محوّلة)
  SELECT EXISTS (
    SELECT 1 FROM public.project_funds pf
    WHERE pf.project_id = NEW.project_id
      AND pf.status IN ('transferred','acknowledged')
  ) INTO _has_active_fund;

  IF _has_active_fund THEN
    RAISE EXCEPTION 'يجب ربط المصروف بدفعة نشطة. يوجد للمشروع دفعات قائمة.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_expense_fund_link ON public.expenses;
CREATE TRIGGER trg_enforce_expense_fund_link
  BEFORE INSERT OR UPDATE OF fund_id, project_id ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_expense_fund_link();

-- =====================================================================
-- M2: منع تجاوز رصيد الدفعة أو العهدة
-- =====================================================================
CREATE OR REPLACE FUNCTION public.check_fund_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _fund_total numeric;
  _fund_spent numeric;
  _custody_total numeric;
  _custody_spent numeric;
BEGIN
  -- فحص رصيد الدفعة
  IF NEW.fund_id IS NOT NULL THEN
    SELECT amount INTO _fund_total FROM public.project_funds WHERE id = NEW.fund_id;
    IF _fund_total IS NOT NULL THEN
      SELECT COALESCE(SUM(amount),0) INTO _fund_spent
      FROM public.expenses
      WHERE fund_id = NEW.fund_id
        AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
      IF (_fund_spent + NEW.amount) > _fund_total THEN
        RAISE EXCEPTION 'المصروف يتجاوز الرصيد المتبقي للدفعة. المتاح: %, المطلوب: %',
          (_fund_total - _fund_spent)::text, NEW.amount::text
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  -- فحص رصيد العهدة
  IF NEW.custody_id IS NOT NULL THEN
    SELECT amount INTO _custody_total FROM public.custodies WHERE id = NEW.custody_id;
    IF _custody_total IS NOT NULL THEN
      SELECT COALESCE(SUM(amount),0) INTO _custody_spent
      FROM public.expenses
      WHERE custody_id = NEW.custody_id
        AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
      IF (_custody_spent + NEW.amount) > _custody_total THEN
        RAISE EXCEPTION 'المصروف يتجاوز رصيد العهدة. المتاح: %, المطلوب: %',
          (_custody_total - _custody_spent)::text, NEW.amount::text
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_fund_balance ON public.expenses;
CREATE TRIGGER trg_check_fund_balance
  BEFORE INSERT OR UPDATE OF amount, fund_id, custody_id ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.check_fund_balance();

-- =====================================================================
-- M4: إغلاق العهدة تلقائياً عند نفاد الرصيد
-- =====================================================================
CREATE OR REPLACE FUNCTION public.auto_close_custody_on_exhaustion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _affected_custodies uuid[];
  _cid uuid;
  _total numeric;
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
      SELECT COALESCE(SUM(amount),0) INTO _spent FROM public.expenses WHERE custody_id = _cid;
      IF _total IS NOT NULL THEN
        IF _spent >= _total THEN
          UPDATE public.custodies
          SET status = 'closed',
              closed_date = COALESCE(closed_date, CURRENT_DATE::text)
          WHERE id = _cid AND status = 'active';
        ELSE
          -- إعادة فتح إن انخفض الصرف عن السقف (نتيجة حذف مصروف)
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
$$;

DROP TRIGGER IF EXISTS trg_auto_close_custody ON public.expenses;
CREATE TRIGGER trg_auto_close_custody
  AFTER INSERT OR UPDATE OF amount, custody_id OR DELETE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_close_custody_on_exhaustion();

-- =====================================================================
-- M6: حماية fund_id من التعديل بعد الإنشاء (للأدمن فقط)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.protect_expense_fund_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.fund_id IS NOT NULL
     AND NEW.fund_id IS DISTINCT FROM OLD.fund_id
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'لا يمكن تغيير ربط المصروف بالدفعة بعد إنشائه. تواصل مع المدير.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_expense_fund_link ON public.expenses;
CREATE TRIGGER trg_protect_expense_fund_link
  BEFORE UPDATE OF fund_id ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_expense_fund_link();
