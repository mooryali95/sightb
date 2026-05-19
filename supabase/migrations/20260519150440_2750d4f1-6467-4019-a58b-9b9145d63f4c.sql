
-- Wave 5: Outstanding advances + budget linkage + commitments linkage

-- 1) Add fields to payment_requests
ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS is_advance_outstanding boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS advance_settled_at timestamptz,
  ADD COLUMN IF NOT EXISTS advance_settled_by uuid,
  ADD COLUMN IF NOT EXISTS budget_item_id uuid;

-- 2) Add commitment link to expenses
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS commitment_id uuid;

CREATE INDEX IF NOT EXISTS idx_expenses_commitment ON public.expenses(commitment_id);
CREATE INDEX IF NOT EXISTS idx_pr_budget_item ON public.payment_requests(budget_item_id);
CREATE INDEX IF NOT EXISTS idx_pr_outstanding ON public.payment_requests(is_advance_outstanding) WHERE is_advance_outstanding = true;

-- 3) Trigger: when an advance is paid, mark it outstanding
CREATE OR REPLACE FUNCTION public.mark_advance_outstanding_on_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'paid' AND COALESCE(OLD.status,'draft'::payment_request_status) <> 'paid'
     AND NEW.request_type = 'advance' THEN
    NEW.is_advance_outstanding := true;
    NEW.advance_settled_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_advance_outstanding ON public.payment_requests;
CREATE TRIGGER trg_mark_advance_outstanding
BEFORE UPDATE ON public.payment_requests
FOR EACH ROW EXECUTE FUNCTION public.mark_advance_outstanding_on_paid();

-- 4) Update auto_create_expense_on_payment to ALSO cover advance/salary/bonus
--    Advances create an expense but the calculations layer excludes them while outstanding.
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
BEGIN
  IF NEW.status = 'paid' AND COALESCE(OLD.status, 'draft'::payment_request_status) <> 'paid'
     AND NEW.auto_created_expense_id IS NULL THEN

    SELECT name INTO _resource_name FROM public.resources WHERE id = NEW.resource_id;

    -- pick category by type
    _category := 'other';
    IF NEW.request_type = 'salary' THEN _category := 'salary';
    ELSIF NEW.request_type = 'advance' THEN _category := 'salary';
    ELSIF NEW.request_type = 'reimbursement' AND jsonb_array_length(NEW.linked_reimbursement_ids) > 0 THEN
      SELECT category INTO _category FROM public.resource_reimbursements
      WHERE id = (NEW.linked_reimbursement_ids->>0)::uuid;
      IF _category IS NULL THEN _category := 'other'; END IF;
    END IF;

    _desc_prefix := CASE NEW.request_type
      WHEN 'reimbursement' THEN 'استرداد: '
      WHEN 'salary' THEN 'راتب: '
      WHEN 'advance' THEN 'سلفة: '
      WHEN 'bonus' THEN 'مكافأة: '
      ELSE ''
    END;

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
      _resource_name,
      'approved',
      COALESCE(NEW.approved_by::text, NEW.user_id::text),
      'منشأ تلقائياً من طلب صرف #' || NEW.id::text,
      NEW.user_id,
      false,
      NEW.paid_from_fund_id,
      NEW.paid_from_custody_id,
      NEW.budget_item_id
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

-- 5) When a paid payment_request is deleted, delete its auto-created expense
CREATE OR REPLACE FUNCTION public.cleanup_auto_expense_on_pr_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.auto_created_expense_id IS NOT NULL THEN
    DELETE FROM public.expenses WHERE id = OLD.auto_created_expense_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_auto_expense ON public.payment_requests;
CREATE TRIGGER trg_cleanup_auto_expense
BEFORE DELETE ON public.payment_requests
FOR EACH ROW EXECUTE FUNCTION public.cleanup_auto_expense_on_pr_delete();
