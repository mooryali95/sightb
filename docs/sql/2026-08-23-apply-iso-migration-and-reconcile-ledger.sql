-- ============================================================================
-- Apply 20260815010000 by hand, and reconcile the migration ledger.
-- 23 August 2026
--
-- Context: migrations merged through GitHub are not applied by the Lovable
-- pipeline (proved on 23 Aug — see docs/production-readiness-key-points.md).
-- Two of them are therefore recorded nowhere:
--
--   20260815004500  explain_attachment_access disclosure fix  — effect IS live
--                   (run by hand on 15 Aug)
--   20260815010000  currency ISO 4217 constraints             — effect IS live
--                   (the constraints were applied by hand on 12 Aug, before
--                    the migration file existed)
--
-- So the schema is already correct. What is wrong is the LEDGER: two rows are
-- missing for work that is applied. This script closes that.
--
-- Step 1 re-runs the ISO migration for real. It is deliberately a no-op when
-- the work is done, so on this database it should change nothing — the point
-- is to prove it runs clean against the real schema, not just the local
-- harness it was tested on.
--
-- Step 2 records both versions. This writes to a Supabase-managed table, so
-- read the note there before running it.
-- ============================================================================


-- ── Step 1 · run the migration itself ──────────────────────────────────────
-- Paste the full contents of
--   supabase/migrations/20260815010000_currency_iso4217_constraints.sql
-- here and run it. Expected: `NOTICE: currency values already ISO 4217 — no
-- rows updated`, no rows changed, no error. It is safe to re-run.


-- ── Step 2 · reconcile the ledger ──────────────────────────────────────────
--
-- Why this is safe here, and only here: both migrations are idempotent
-- (CREATE OR REPLACE, and ADD CONSTRAINT guarded by a catalog check) and both
-- effects are verified present. Recording them makes the ledger agree with the
-- database. Leaving them out is also safe — a later automatic apply would
-- simply re-run two no-ops — so if you would rather not write to a
-- platform-managed table, skip this step and nothing breaks.
--
-- Do NOT use this pattern for a migration whose effect is not actually
-- applied: that would make the pipeline skip real work.

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES
  ('20260815004500', 'explain_attachment_access_no_existence_disclosure'),
  ('20260815010000', 'currency_iso4217_constraints')
ON CONFLICT (version) DO NOTHING;


-- ── Step 3 · verify ────────────────────────────────────────────────────────
-- One statement, so the editor shows all of it.

SELECT 'ledger: disclosure fix' AS check,
       (SELECT count(*)::text FROM supabase_migrations.schema_migrations
         WHERE version = '20260815004500') AS result
UNION ALL
SELECT 'ledger: iso constraints',
       (SELECT count(*)::text FROM supabase_migrations.schema_migrations
         WHERE version = '20260815010000')
UNION ALL
SELECT 'ledger: total rows',
       (SELECT count(*)::text FROM supabase_migrations.schema_migrations)
UNION ALL
SELECT 'live: disclosure fix in function body',
       (SELECT (prosrc LIKE '%not_authorized%')::text FROM pg_proc
         WHERE proname = 'explain_attachment_access')
UNION ALL
SELECT 'live: iso constraints present',
       (SELECT count(*)::text FROM pg_constraint
         WHERE conname LIKE '%currency_iso4217%')
UNION ALL
-- Confirms the live CHECK matches what the migration file declares, rather
-- than assuming the hand-run version and the tracked file agree.
SELECT 'live: projects CHECK definition',
       COALESCE((SELECT pg_get_constraintdef(oid) FROM pg_constraint
                  WHERE conname = 'projects_currency_iso4217'), '(absent)')
UNION ALL
SELECT 'live: currency values still clean',
       COALESCE((SELECT string_agg(DISTINCT currency, ', ') FROM public.projects), '(none)');
