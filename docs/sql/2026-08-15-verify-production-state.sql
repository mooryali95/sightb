-- ============================================================================
-- Read-only production verification — 15 August 2026
--
-- Answers three questions that cannot be settled from the repository alone.
-- Every statement is a SELECT. Nothing here writes, locks, or alters anything;
-- it is safe to run against production during business hours.
--
--   Run: Supabase dashboard -> SQL Editor -> paste -> Run
-- ============================================================================

-- ── 1. Is the 2026-08-15 disclosure fix actually applied? ──────────────────
-- The migration is committed to supabase/migrations, but the ISO 4217
-- constraint that IS live was applied by hand from docs/sql/ — so migrations
-- in this project may not be applied automatically. This settles it.
--
-- Expect: applied = true. If false, the fix is in git but NOT in the database,
-- and the deny path is still disclosing whether an attachment path exists.
SELECT
  'explain_attachment_access disclosure fix' AS check,
  (prosrc LIKE '%not_authorized%')           AS applied,
  CASE WHEN prosrc LIKE '%not_authorized%'
       THEN 'live'
       ELSE 'NOT APPLIED — run supabase/migrations/20260815004500_explain_attachment_access_no_existence_disclosure.sql'
  END AS action
FROM pg_proc
WHERE proname = 'explain_attachment_access';

-- ── 2. Did the ISO 4217 migration really run, and is anything left behind? ──
-- PR #5 was merged on the premise that it did. If any row still holds a display
-- symbol, the CHECK constraint would have rejected it — so a non-zero count
-- here means the constraint is absent and the story is more complicated.
SELECT 'projects.currency values' AS check, currency, count(*) AS rows
  FROM public.projects GROUP BY currency
UNION ALL
SELECT 'payment_requests.currency values', currency, count(*)
  FROM public.payment_requests GROUP BY currency
ORDER BY 1, 3 DESC;

-- Are the constraints themselves present?
-- Expect: two rows. Absent means project creation was never actually broken,
-- and PR #5 fixed a regression that had not landed yet — harmless either way,
-- but worth knowing.
SELECT 'iso4217 constraints' AS check, conrelid::regclass AS table_name, conname
  FROM pg_constraint
 WHERE conname LIKE '%currency_iso4217%'
 ORDER BY 2;

-- ── 3. Would creating a project succeed today? ─────────────────────────────
-- The exact value the app now writes (DEFAULT_CURRENCY = 'SAR') tested against
-- the live constraint, without inserting anything.
-- Expect: passes = true.
SELECT
  'new project currency accepted' AS check,
  'SAR' AS value_app_writes,
  NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'projects_currency_iso4217'
       AND pg_get_constraintdef(oid) NOT LIKE '%''SAR''%'
  ) AS passes;

-- ── Bonus: the invariants security-scan.sh checks, in one pass ─────────────
-- These are the same four checks the nightly runs, so you can confirm the
-- database agrees with what CI believes.
SELECT 'tables without RLS' AS check,
       COALESCE(string_agg(c.relname, ', '), '(none — good)') AS result
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;

SELECT 'SECURITY DEFINER without search_path' AS check,
       COALESCE(string_agg(p.proname, ', '), '(none — good)') AS result
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.prosecdef
   AND (p.proconfig IS NULL
        OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%'));

SELECT 'anon can execute privileged functions' AS check,
       COALESCE(string_agg(p.proname, ', '), '(none — good)') AS result
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.prosecdef
   AND p.proname IN ('can_access_expense_receipt','can_access_resource_receipt',
                     'explain_attachment_access','ssot_explain',
                     'project_financial_summary','split_settle_advance')
   AND has_function_privilege('anon', p.oid, 'EXECUTE');
