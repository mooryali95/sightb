-- ============================================================================
-- SightB · production health check
--
-- SUPERSEDED — prefer `bash scripts/security-scan.sh`, which now runs every
-- check below automatically from the Security Re-scan workflow.
--
-- Keep this file only as an emergency fallback for when CI cannot reach the
-- database. Running it by hand costs a round-trip, goes stale the moment
-- anything merges, and can draw down the Lovable workspace quota — which
-- meters usage and then asks for payment. The workflow talks to Supabase
-- directly and consumes none of it.
--
-- Coverage is now: scan steps 2/6 (RLS), 3/6 (search_path, anon EXECUTE),
-- 5/6 (migration drift) and 6/6 (disclosure fix, ISO constraints, currency
-- values). The scan's drift check also improves on row 1 below, which compares
-- against a hard-coded file count that must be edited by hand every time a
-- migration is added.
--
-- If you do run it: one statement, read-only, safe at any time. The Supabase
-- editor shows only the LAST statement's result set, which is why everything
-- below is a single SELECT — an earlier version was eight statements and
-- silently reported only the last one.
-- ============================================================================

WITH
files AS (
  -- Update this number when migrations are added. It is the one value here
  -- that cannot be read from the database, and comparing it to the ledger is
  -- the check that would have caught migrations sitting unapplied for days.
  SELECT 83 AS expected
),
ledger AS (SELECT count(*)::int AS n FROM supabase_migrations.schema_migrations),
disclosure AS (
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'explain_attachment_access')
      THEN '❌ function missing'
    WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'explain_attachment_access'
                   AND prosrc LIKE '%not_authorized%')
      THEN '✅ ok — deny path discloses nothing'
    ELSE '❌ NOT APPLIED — run supabase/migrations/20260815004500_*.sql'
  END AS v
)
SELECT 1 AS n, 'migration ledger vs repository' AS check,
       CASE WHEN (SELECT n FROM ledger) = (SELECT expected FROM files)
            THEN '✅ ok — ' || (SELECT n FROM ledger) || ' = ' || (SELECT expected FROM files)
            ELSE '❌ DRIFT — ledger has ' || (SELECT n FROM ledger)
                 || ', repository has ' || (SELECT expected FROM files)
                 || '. A file with no row means it was merged but never applied.'
       END AS result
UNION ALL SELECT 2, 'attachment disclosure fix', (SELECT v FROM disclosure)
UNION ALL SELECT 3, 'ISO 4217 constraints',
  CASE WHEN (SELECT count(*) FROM pg_constraint WHERE conname LIKE '%currency_iso4217%') = 2
       THEN '✅ ok — both tables constrained'
       ELSE '❌ expected 2, found '
            || (SELECT count(*) FROM pg_constraint WHERE conname LIKE '%currency_iso4217%') END
UNION ALL SELECT 4, 'currency values',
  COALESCE((SELECT '✅ ok — ' || string_agg(DISTINCT currency, ', ') FROM public.projects), '(no projects)')
UNION ALL SELECT 5, 'tables without RLS',
  COALESCE((SELECT '❌ ' || string_agg(c.relname, ', ')
              FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity),
           '✅ ok — every table protected')
UNION ALL SELECT 6, 'SECURITY DEFINER without search_path',
  COALESCE((SELECT '❌ ' || string_agg(p.proname, ', ')
              FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.prosecdef
               AND (p.proconfig IS NULL OR NOT EXISTS (
                    SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%'))),
           '✅ ok — all pinned')
UNION ALL SELECT 7, 'anon can execute privileged functions',
  COALESCE((SELECT '❌ ' || string_agg(p.proname, ', ')
              FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.prosecdef
               AND p.proname IN ('can_access_expense_receipt','can_access_resource_receipt',
                                 'explain_attachment_access','ssot_explain',
                                 'project_financial_summary','split_settle_advance')
               AND has_function_privilege('anon', p.oid, 'EXECUTE')),
           '✅ ok — anon blocked')
ORDER BY n;
