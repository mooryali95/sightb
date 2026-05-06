-- Add source fund link to custodies (custody funded from a project fund)
ALTER TABLE public.custodies
  ADD COLUMN IF NOT EXISTS source_fund_id uuid REFERENCES public.project_funds(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_custodies_source_fund_id ON public.custodies(source_fund_id);

-- Update check_fund_balance: include custody draws on fund + exclude expenses inside a fund-sourced custody
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
  _custody_total numeric;
  _custody_spent numeric;
  _new_custody_source uuid;
BEGIN
  -- فحص رصيد الدفعة (عند ربط مصروف بدفعة مباشرة)
  IF NEW.fund_id IS NOT NULL THEN
    -- إذا كان المصروف داخل عهدة مأخوذة من نفس الدفعة، لا نحاسبها على الدفعة (محاسبتها على العهدة فقط)
    SELECT source_fund_id INTO _new_custody_source FROM public.custodies WHERE id = NEW.custody_id;
    IF _new_custody_source IS NOT NULL AND _new_custody_source = NEW.fund_id THEN
      -- لا فحص على الدفعة هنا — العهدة هي الحاوية
      NULL;
    ELSE
      SELECT amount INTO _fund_total FROM public.project_funds WHERE id = NEW.fund_id;
      IF _fund_total IS NOT NULL THEN
        -- مصروفات مباشرة على الدفعة (ليست داخل عهدة مسحوبة من نفس الدفعة)
        SELECT COALESCE(SUM(e.amount),0) INTO _fund_direct_spent
        FROM public.expenses e
        LEFT JOIN public.custodies cu ON cu.id = e.custody_id
        WHERE e.fund_id = NEW.fund_id
          AND e.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
          AND (cu.source_fund_id IS NULL OR cu.source_fund_id <> NEW.fund_id);
        -- عهد مسحوبة من هذه الدفعة (يُحسب كامل مبلغها كاستنزاف)
        SELECT COALESCE(SUM(amount),0) INTO _fund_custody_draw
        FROM public.custodies WHERE source_fund_id = NEW.fund_id;
        IF (_fund_direct_spent + _fund_custody_draw + NEW.amount) > _fund_total THEN
          RAISE EXCEPTION 'المصروف يتجاوز الرصيد المتبقي للدفعة. المتاح: %, المطلوب: %',
            (_fund_total - _fund_direct_spent - _fund_custody_draw)::text, NEW.amount::text
            USING ERRCODE = 'P0001';
        END IF;
      END IF;
    END IF;
  END IF;

  -- فحص رصيد العهدة (كما السابق)
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
$function$;

-- Update enforce_expense_fund_link: إذا المصروف داخل عهدة، لا نلزمه بدفعة مباشرة (العهدة تحاسب من مصدرها)
CREATE OR REPLACE FUNCTION public.enforce_expense_fund_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _has_active_fund boolean;
BEGIN
  IF NEW.notes IS NOT NULL AND NEW.notes LIKE 'منشأ تلقائياً%' THEN
    RETURN NEW;
  END IF;
  IF NEW.legacy_pre_fund = true THEN
    RETURN NEW;
  END IF;
  IF NEW.fund_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  -- مصروف مرتبط بعهدة لا يحتاج fund_id مباشرة (التتبع المالي عبر العهدة)
  IF NEW.custody_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
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
$function$;

-- Trigger: عند إنشاء/تحديث عهدة بمصدر دفعة، تأكد أن مبلغ العهدة لا يتجاوز رصيد الدفعة
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
    IF (_direct_spent + _other_custody_draw + NEW.amount) > _fund_total THEN
      RAISE EXCEPTION 'مبلغ العهدة يتجاوز رصيد الدفعة. المتاح: %, المطلوب: %',
        (_fund_total - _direct_spent - _other_custody_draw)::text, NEW.amount::text
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_check_custody_against_fund ON public.custodies;
CREATE TRIGGER trg_check_custody_against_fund
  BEFORE INSERT OR UPDATE OF amount, source_fund_id ON public.custodies
  FOR EACH ROW EXECUTE FUNCTION public.check_custody_against_fund();