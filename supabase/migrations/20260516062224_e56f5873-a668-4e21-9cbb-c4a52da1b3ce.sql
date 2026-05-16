-- Bridge payment_requests to funds & custodies (Wave 4هـ-2)
ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS paid_from_custody_id uuid,
  ADD COLUMN IF NOT EXISTS paid_from_fund_id    uuid;

CREATE INDEX IF NOT EXISTS idx_payment_requests_paid_from_fund    ON public.payment_requests(paid_from_fund_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_paid_from_custody ON public.payment_requests(paid_from_custody_id);

-- Update trigger so the auto-created expense inherits the fund/custody link
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
BEGIN
  IF NEW.status = 'paid' AND COALESCE(OLD.status, 'draft'::payment_request_status) <> 'paid'
     AND NEW.request_type = 'reimbursement' AND NEW.auto_created_expense_id IS NULL THEN

    SELECT name INTO _resource_name FROM public.resources WHERE id = NEW.resource_id;

    _category := 'other';
    IF jsonb_array_length(NEW.linked_reimbursement_ids) > 0 THEN
      SELECT category INTO _category FROM public.resource_reimbursements
      WHERE id = (NEW.linked_reimbursement_ids->>0)::uuid;
      IF _category IS NULL THEN _category := 'other'; END IF;
    END IF;

    INSERT INTO public.expenses (
      project_id, resource_id, category, description, amount,
      date, month, vendor, approval_status, approved_by,
      notes, user_id, is_vat_exempt, fund_id, custody_id
    ) VALUES (
      NEW.project_id, NEW.resource_id, _category,
      'استرداد: ' || NEW.description,
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
      NEW.paid_from_custody_id
    ) RETURNING id INTO _expense_id;

    NEW.auto_created_expense_id := _expense_id;

    IF jsonb_array_length(NEW.linked_reimbursement_ids) > 0 THEN
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