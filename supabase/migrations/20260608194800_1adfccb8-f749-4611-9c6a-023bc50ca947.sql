
ALTER TABLE public.expenses
  ADD CONSTRAINT chk_expense_single_funding_source
  CHECK (NOT (fund_id IS NOT NULL AND custody_id IS NOT NULL));

ALTER TABLE public.payment_requests
  ADD CONSTRAINT chk_pr_single_pay_source
  CHECK (NOT (paid_from_fund_id IS NOT NULL AND paid_from_custody_id IS NOT NULL));
