
-- Phase C: Vendor Payables — extend resource_reimbursements to track amounts
-- a vendor paid on behalf of the project (to be reimbursed later from a fund/custody).
-- Phase B tie-in: expenses.reimburses_payable_id links a settling expense back to the payable.

ALTER TABLE public.resource_reimbursements
  ADD COLUMN IF NOT EXISTS source_kind text NOT NULL DEFAULT 'resource',
  ADD COLUMN IF NOT EXISTS vendor_name text,
  ADD COLUMN IF NOT EXISTS settled_expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS settled_at timestamptz;

ALTER TABLE public.resource_reimbursements
  ALTER COLUMN resource_id DROP NOT NULL;

ALTER TABLE public.resource_reimbursements
  DROP CONSTRAINT IF EXISTS reimb_source_kind_chk;
ALTER TABLE public.resource_reimbursements
  ADD CONSTRAINT reimb_source_kind_chk CHECK (
    (source_kind = 'resource' AND resource_id IS NOT NULL)
    OR (source_kind = 'vendor'   AND vendor_name IS NOT NULL AND btrim(vendor_name) <> '')
  );

CREATE INDEX IF NOT EXISTS idx_reimb_source_kind ON public.resource_reimbursements(source_kind);
CREATE INDEX IF NOT EXISTS idx_reimb_settled_expense ON public.resource_reimbursements(settled_expense_id);

-- Link an expense back to the payable it closes.
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS reimburses_payable_id uuid
    REFERENCES public.resource_reimbursements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_reimburses_payable
  ON public.expenses(reimburses_payable_id);

-- Trigger: when an expense is inserted with reimburses_payable_id, close the payable.
CREATE OR REPLACE FUNCTION public.settle_payable_on_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _payable RECORD;
BEGIN
  IF NEW.reimburses_payable_id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO _payable FROM public.resource_reimbursements WHERE id = NEW.reimburses_payable_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الذمة المدينة (Payable) غير موجودة.' USING ERRCODE = 'P0001';
  END IF;
  IF _payable.status = 'reimbursed' THEN
    RAISE EXCEPTION 'تم سداد هذه الذمة مسبقاً.' USING ERRCODE = 'P0001';
  END IF;
  IF _payable.project_id <> NEW.project_id THEN
    RAISE EXCEPTION 'الذمة تخص مشروعاً آخر.' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.amount <> _payable.amount THEN
    RAISE EXCEPTION 'مبلغ مصروف السداد (%) لا يطابق مبلغ الذمة (%). سدد الذمة كاملة أو قسّم يدوياً.',
      NEW.amount::text, _payable.amount::text USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.resource_reimbursements
    SET status = 'reimbursed',
        settled_expense_id = NEW.id,
        settled_at = now(),
        updated_at = now()
    WHERE id = NEW.reimburses_payable_id;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.settle_payable_on_expense() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_settle_payable_on_expense ON public.expenses;
CREATE TRIGGER trg_settle_payable_on_expense
  AFTER INSERT ON public.expenses
  FOR EACH ROW
  WHEN (NEW.reimburses_payable_id IS NOT NULL)
  EXECUTE FUNCTION public.settle_payable_on_expense();

-- Trigger: reopen the payable if the settling expense is deleted.
CREATE OR REPLACE FUNCTION public.reopen_payable_on_expense_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.reimburses_payable_id IS NOT NULL THEN
    UPDATE public.resource_reimbursements
      SET status = 'approved',
          settled_expense_id = NULL,
          settled_at = NULL,
          updated_at = now()
      WHERE id = OLD.reimburses_payable_id
        AND settled_expense_id = OLD.id;
  END IF;
  RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reopen_payable_on_expense_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_reopen_payable_on_expense_delete ON public.expenses;
CREATE TRIGGER trg_reopen_payable_on_expense_delete
  AFTER DELETE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.reopen_payable_on_expense_delete();
