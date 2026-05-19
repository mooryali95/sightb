
-- Wave 5b: add is_outstanding_advance to expenses + sync triggers

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS is_outstanding_advance boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_expenses_outstanding_advance
  ON public.expenses(is_outstanding_advance) WHERE is_outstanding_advance = true;

-- Sync function: whenever a payment_request changes advance-outstanding state,
-- update the linked auto-created expense accordingly.
CREATE OR REPLACE FUNCTION public.sync_outstanding_advance_to_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.auto_created_expense_id IS NOT NULL THEN
    UPDATE public.expenses
       SET is_outstanding_advance = COALESCE(NEW.is_advance_outstanding, false)
     WHERE id = NEW.auto_created_expense_id
       AND is_outstanding_advance IS DISTINCT FROM COALESCE(NEW.is_advance_outstanding, false);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_outstanding_advance ON public.payment_requests;
CREATE TRIGGER trg_sync_outstanding_advance
AFTER INSERT OR UPDATE OF is_advance_outstanding, auto_created_expense_id
ON public.payment_requests
FOR EACH ROW EXECUTE FUNCTION public.sync_outstanding_advance_to_expense();

-- Backfill: any existing paid advance gets the outstanding flag set on creation moment.
-- (Historically there were no advance-type auto expenses; trigger only existed for reimbursement.)
UPDATE public.payment_requests
   SET is_advance_outstanding = true
 WHERE request_type = 'advance' AND status = 'paid' AND is_advance_outstanding = false
   AND advance_settled_at IS NULL;
