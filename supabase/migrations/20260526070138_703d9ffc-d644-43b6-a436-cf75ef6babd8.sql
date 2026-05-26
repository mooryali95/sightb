-- Defensive reset: ensure no expense is still flagged as an outstanding advance.
-- The legacy `expenses.is_outstanding_advance` flag has been superseded by
-- `payment_requests.is_advance_outstanding` since the new settlement flow was introduced.
UPDATE public.expenses
SET is_outstanding_advance = false
WHERE is_outstanding_advance = true;

-- Mark the column as deprecated so future contributors don't reintroduce usage.
COMMENT ON COLUMN public.expenses.is_outstanding_advance IS
  'DEPRECATED (kept for backward compat). Outstanding advances are now tracked on payment_requests.is_advance_outstanding. Always insert as false.';