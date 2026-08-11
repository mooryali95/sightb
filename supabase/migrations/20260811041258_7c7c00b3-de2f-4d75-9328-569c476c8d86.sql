CREATE OR REPLACE FUNCTION public.enforce_single_expense_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- XOR: expense must be funded by exactly one source (fund OR custody)
  IF NEW.fund_id IS NOT NULL AND NEW.custody_id IS NOT NULL THEN
    RAISE EXCEPTION 'لا يمكن ربط المصروف بدفعة وعهدة معاً. اختر مصدراً واحداً فقط.'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.fund_id IS NULL AND NEW.custody_id IS NULL THEN
    IF COALESCE(NEW.legacy_pre_fund, false) = true
       OR (NEW.notes IS NOT NULL AND NEW.notes LIKE 'منشأ تلقائياً%')
       OR NEW.source_payment_request_id IS NOT NULL THEN
      RETURN NEW;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.project_funds pf
      WHERE pf.project_id = NEW.project_id
        AND pf.status IN ('transferred','acknowledged')
    ) THEN
      RAISE EXCEPTION 'يجب ربط المصروف بدفعة أو عهدة.' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.enforce_single_expense_source() FROM PUBLIC, anon, authenticated;