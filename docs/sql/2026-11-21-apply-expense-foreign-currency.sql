-- ============================================================================
-- SightB · invoices in another currency (one-off, CLAUDE.md rule 4 exception)
--
-- Paste ALL of this into Lovable Cloud's SQL editor and run it once. Safe to
-- run again. The last statement returns ONE row: "✅ ready" or what is missing.
-- Source: supabase/migrations/20261121090000_expense_foreign_currency.sql
--
-- Lets an expense keep its invoice's own amount, currency and exchange rate
-- beside the amount in the project's currency. Changes no existing row and no
-- existing figure: every expense starts without them.
-- ============================================================================
BEGIN;

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

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261121090000', 'expense_foreign_currency') ON CONFLICT (version) DO NOTHING;

NOTIFY pgrst, 'reload schema';
COMMIT;

SELECT CASE WHEN missing = '' THEN '✅ ready — an expense can keep its invoice amount, currency and exchange rate'
  ELSE '❌ missing: ' || missing END AS expense_foreign_currency
FROM (
  SELECT concat_ws(', ',
    CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'expenses' AND column_name = 'original_amount') THEN 'expenses.original_amount' END,
    CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'expenses' AND column_name = 'original_currency') THEN 'expenses.original_currency' END,
    CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'expenses' AND column_name = 'exchange_rate') THEN 'expenses.exchange_rate' END,
    CASE WHEN coalesce(pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conname = 'expenses_foreign_invoice_whole' AND conrelid = 'public.expenses'::regclass)), '') NOT LIKE '%num_nonnulls%' THEN 'all-or-none check' END,
    CASE WHEN NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261121090000') THEN 'ledger row' END
  ) AS missing
) m;
