-- ============================================================================
-- Read-only production verification — 15 August 2026
--
-- ONE statement on purpose. The Supabase SQL editor returns only the last
-- statement's result set when several are run together, so a multi-statement
-- script silently drops every check but the final one. Everything below is a
-- single SELECT returning one row per check.
--
-- Read-only: no writes, no locks, no DDL. Safe during business hours.
--
--   Run: Supabase dashboard -> SQL Editor -> paste -> Run
-- ============================================================================

WITH disclosure_fix AS (
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'explain_attachment_access')
      THEN '❌ FUNCTION MISSING — neither the 2026-08-14 nor the 2026-08-15 migration is applied'
    WHEN EXISTS (SELECT 1 FROM pg_proc
                  WHERE proname = 'explain_attachment_access'
                    AND prosrc LIKE '%not_authorized%')
      THEN '✅ APPLIED — the deny path no longer discloses existence'
    ELSE '❌ NOT APPLIED — fix is in git only. Run supabase/migrations/20260815004500_explain_attachment_access_no_existence_disclosure.sql'
  END AS v
),
iso_constraints AS (
  SELECT COALESCE(string_agg(conrelid::regclass || '.' || conname, '  |  ' ORDER BY conname),
                  '(absent — no ISO 4217 CHECK on this database)') AS v
    FROM pg_constraint WHERE conname LIKE '%currency_iso4217%'
),
proj_currency AS (
  SELECT COALESCE(string_agg(currency || ' × ' || n, '  |  ' ORDER BY currency), '(no rows)') AS v
    FROM (SELECT currency, count(*)::text AS n FROM public.projects GROUP BY currency) t
),
pay_currency AS (
  SELECT COALESCE(string_agg(currency || ' × ' || n, '  |  ' ORDER BY currency), '(no rows)') AS v
    FROM (SELECT currency, count(*)::text AS n FROM public.payment_requests GROUP BY currency) t
),
sar_ok AS (
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_currency_iso4217')
      THEN 'no constraint — any value accepted (so project creation was never blocked)'
    WHEN EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'projects_currency_iso4217'
                    AND pg_get_constraintdef(oid) LIKE '%''SAR''%')
      THEN '✅ SAR accepted — project creation works with what the app now writes'
    ELSE '❌ SAR rejected — project creation is still broken'
  END AS v
),
no_rls AS (
  SELECT COALESCE(string_agg(c.relname, ', '), '(none — good)') AS v
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
),
no_path AS (
  SELECT COALESCE(string_agg(p.proname, ', '), '(none — good)') AS v
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosecdef
     AND (p.proconfig IS NULL
          OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%'))
),
anon_exec AS (
  SELECT COALESCE(string_agg(p.proname, ', '), '(none — good)') AS v
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosecdef
     AND p.proname IN ('can_access_expense_receipt','can_access_resource_receipt',
                       'explain_attachment_access','ssot_explain',
                       'project_financial_summary','split_settle_advance')
     AND has_function_privilege('anon', p.oid, 'EXECUTE')
)
SELECT 1 AS n, '1 · disclosure fix (#7) applied?'      AS check, v AS result FROM disclosure_fix
UNION ALL SELECT 2, '2 · ISO 4217 constraints',           v FROM iso_constraints
UNION ALL SELECT 3, '3 · projects.currency values',       v FROM proj_currency
UNION ALL SELECT 4, '4 · payment_requests.currency',      v FROM pay_currency
UNION ALL SELECT 5, '5 · can a project be created?',      v FROM sar_ok
UNION ALL SELECT 6, '6 · tables without RLS',             v FROM no_rls
UNION ALL SELECT 7, '7 · SECDEF without search_path',     v FROM no_path
UNION ALL SELECT 8, '8 · anon can exec privileged fns',   v FROM anon_exec
ORDER BY n;
