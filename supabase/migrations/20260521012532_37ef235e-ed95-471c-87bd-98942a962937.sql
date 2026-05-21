-- (1) Trigger للمصدر الواحد
CREATE OR REPLACE FUNCTION public.enforce_single_expense_source()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.custody_id IS NOT NULL THEN
    NEW.fund_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_single_expense_source ON public.expenses;
CREATE TRIGGER trg_enforce_single_expense_source
BEFORE INSERT OR UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.enforce_single_expense_source();

-- (2) تنظيف البيانات: تعطيل الحماية مؤقتاً لتنظيف الازدواج
ALTER TABLE public.expenses DISABLE TRIGGER USER;
UPDATE public.expenses SET fund_id = NULL
WHERE custody_id IS NOT NULL AND fund_id IS NOT NULL;
ALTER TABLE public.expenses ENABLE TRIGGER USER;

-- (3) تحديث تريغر الدفع التلقائي
CREATE OR REPLACE FUNCTION public.auto_create_expense_on_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

    SELECT name INTO _resource_name FROM public.resources WHERE id = NEW.resource_id;

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
$$;

-- (4) السماح للمدير بحذف السلفة المدفوعة لتصحيح الأخطاء
DROP POLICY IF EXISTS "Admins can delete payment requests" ON public.payment_requests;
CREATE POLICY "Admins can delete payment requests"
ON public.payment_requests
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND (
    status = ANY (ARRAY['draft'::payment_request_status, 'cancelled'::payment_request_status, 'rejected'::payment_request_status])
    OR (status = 'paid'::payment_request_status AND request_type = 'advance'::payment_request_type)
  )
);