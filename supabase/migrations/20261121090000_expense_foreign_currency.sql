-- An expense's invoice in another currency.
--
-- `amount` stays in the project's currency and is what every figure reads;
-- nothing computed from it changes. Beside it an expense may keep what the
-- invoice said (its amount and ISO 4217 currency) and the rate the person
-- entering it used. All three together or none: a half-filled set would say
-- a conversion happened without saying how.
--
-- No equality between amount and original_amount × exchange_rate is enforced:
-- the booked amount may also carry VAT handling, and the rate recorded is the
-- one the person gave. Changes no existing row.

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS original_amount   numeric(14,2),
  ADD COLUMN IF NOT EXISTS original_currency text,
  ADD COLUMN IF NOT EXISTS exchange_rate     numeric(18,6);

ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_foreign_invoice_whole;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_foreign_invoice_whole CHECK (
  -- Counted, not compared: with a NULL among them a plain comparison is
  -- NULL, and a CHECK lets NULL through, so a half-filled set was accepted.
  num_nonnulls(original_amount, original_currency, exchange_rate) = 0
  OR (num_nonnulls(original_amount, original_currency, exchange_rate) = 3
      AND original_amount > 0 AND exchange_rate > 0 AND original_currency ~ '^[A-Z]{3}$')
);

COMMENT ON COLUMN public.expenses.original_amount   IS 'Invoice amount in its own currency, when it differs from the project currency.';
COMMENT ON COLUMN public.expenses.original_currency IS 'ISO 4217 code of the invoice currency.';
COMMENT ON COLUMN public.expenses.exchange_rate     IS 'Project-currency units per one unit of original_currency, as entered.';
