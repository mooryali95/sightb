-- ISO 4217 currency encoding — brought into the tracked migration history.
--
-- This constraint has been live on production since 12 August, but it was
-- applied by hand from docs/sql/2026-08-11-currency-iso4217.sql and never had
-- a migration file. So the database carried schema the repository did not
-- describe, and supabase/migrations could not rebuild it. This file closes
-- that gap; it introduces nothing new.
--
-- Written to be a no-op wherever the work is already done:
--   * production      — constraints exist, all rows already SAR: nothing runs
--   * a fresh branch  — no legacy rows to normalise, constraints get created
--   * a stale copy    — legacy symbols normalised first, then constrained
--
-- Two traps the hand-run version hit, both avoided here:
--
--   1. No pg_temp functions. The Supabase SQL editor can spread statements
--      across pooled connections, so nothing temporary survives between them
--      (the original failed with `schema "pg_temp" does not exist`). Every
--      block below is self-contained.
--
--   2. Audit triggers. projects and payment_requests carry triggers that write
--      auth.uid() into system_audit_log.user_id, which is NOT NULL — so an
--      UPDATE from a session with no identity dies with 23502. Disabling the
--      triggers was rejected deliberately: silently switching the currency of
--      every project in a financial system is precisely the change an auditor
--      expects to find attributed. Instead the session is given the system
--      owner's identity, transaction-local, and only when an UPDATE will
--      actually run.

BEGIN;

-- ── 1. Normalise any legacy display symbols to ISO codes ───────────────────
-- Skipped entirely when nothing needs it, which is the case on production and
-- on any fresh database. The identity is only established if rows will move,
-- so a no-op run never touches the audit log.
DO $$
DECLARE
  _uid uuid;
  _pending int;
BEGIN
  WITH map(raw, iso) AS (
    VALUES
      ('SAR','SAR'), ('ر.س','SAR'), ('ر.س.','SAR'), ('ريال','SAR'),
      ('ريال سعودي','SAR'), ('SR','SAR'), ('﷼','SAR'), ('','SAR'),
      ('USD','USD'), ('$','USD'), ('دولار','USD'),
      ('EUR','EUR'), ('€','EUR'), ('يورو','EUR'),
      ('GBP','GBP'), ('£','GBP'),
      ('AED','AED'), ('د.إ','AED'), ('درهم','AED'),
      ('KWD','KWD'), ('د.ك','KWD'),
      ('BHD','BHD'), ('د.ب','BHD'),
      ('QAR','QAR'), ('ر.ق','QAR'),
      ('OMR','OMR'), ('ر.ع','OMR'),
      ('JOD','JOD'), ('د.أ','JOD'),
      ('EGP','EGP'), ('ج.م','EGP')
  )
  SELECT count(*) INTO _pending
    FROM (
      SELECT p.currency FROM public.projects p
       WHERE p.currency IS DISTINCT FROM (SELECT iso FROM map WHERE raw = p.currency)
      UNION ALL
      SELECT r.currency FROM public.payment_requests r
       WHERE r.currency IS DISTINCT FROM (SELECT iso FROM map WHERE raw = r.currency)
    ) t;

  IF _pending = 0 THEN
    RAISE NOTICE 'currency values already ISO 4217 — no rows updated';
    RETURN;
  END IF;

  -- Compare role as text, not by casting to app_role: 'owner' was added to the
  -- enum in a later migration, and casting would fail with "invalid input
  -- value for enum" on a database where that migration has not run yet.
  SELECT user_id INTO _uid
    FROM public.user_roles
   WHERE scope_type::text = 'system'
     AND role::text IN ('owner', 'admin')
   ORDER BY (role::text = 'owner') DESC, created_at
   LIMIT 1;

  IF _uid IS NULL THEN
    RAISE EXCEPTION 'no system owner/admin found — cannot attribute the currency migration in system_audit_log';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid)::text, true);
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true);

  WITH map(raw, iso) AS (
    VALUES
      ('SAR','SAR'), ('ر.س','SAR'), ('ر.س.','SAR'), ('ريال','SAR'),
      ('ريال سعودي','SAR'), ('SR','SAR'), ('﷼','SAR'), ('','SAR'),
      ('USD','USD'), ('$','USD'), ('دولار','USD'),
      ('EUR','EUR'), ('€','EUR'), ('يورو','EUR'),
      ('GBP','GBP'), ('£','GBP'),
      ('AED','AED'), ('د.إ','AED'), ('درهم','AED'),
      ('KWD','KWD'), ('د.ك','KWD'),
      ('BHD','BHD'), ('د.ب','BHD'),
      ('QAR','QAR'), ('ر.ق','QAR'),
      ('OMR','OMR'), ('ر.ع','OMR'),
      ('JOD','JOD'), ('د.أ','JOD'),
      ('EGP','EGP'), ('ج.م','EGP')
  )
  UPDATE public.projects p
     SET currency = m.iso
    FROM map m
   WHERE m.raw = p.currency AND p.currency <> m.iso;

  WITH map(raw, iso) AS (
    VALUES
      ('SAR','SAR'), ('ر.س','SAR'), ('ر.س.','SAR'), ('ريال','SAR'),
      ('ريال سعودي','SAR'), ('SR','SAR'), ('﷼','SAR'), ('','SAR'),
      ('USD','USD'), ('$','USD'), ('دولار','USD'),
      ('EUR','EUR'), ('€','EUR'), ('يورو','EUR'),
      ('GBP','GBP'), ('£','GBP'),
      ('AED','AED'), ('د.إ','AED'), ('درهم','AED'),
      ('KWD','KWD'), ('د.ك','KWD'),
      ('BHD','BHD'), ('د.ب','BHD'),
      ('QAR','QAR'), ('ر.ق','QAR'),
      ('OMR','OMR'), ('ر.ع','OMR'),
      ('JOD','JOD'), ('د.أ','JOD'),
      ('EGP','EGP'), ('ج.م','EGP')
  )
  UPDATE public.payment_requests r
     SET currency = m.iso
    FROM map m
   WHERE m.raw = r.currency AND r.currency <> m.iso;
END $$;

-- ── 2. Refuse anything that is not an ISO 4217 code ────────────────────────
-- Postgres has no ADD CONSTRAINT IF NOT EXISTS, so the catalog is checked
-- first. Deliberately additive: an existing constraint is left exactly as it
-- is rather than dropped and recreated, because dropping a CHECK on a live
-- financial table — even briefly, even inside a transaction — is a worse
-- default than tolerating a definition that may have drifted. Compare with
-- docs/sql/2026-08-15-verify-production-state.sql if you need to confirm the
-- live definition matches this one.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_currency_iso4217') THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_currency_iso4217
      CHECK (currency IN ('SAR','USD','EUR','GBP','AED','KWD','BHD','QAR','OMR','JOD','EGP'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_requests_currency_iso4217') THEN
    ALTER TABLE public.payment_requests
      ADD CONSTRAINT payment_requests_currency_iso4217
      CHECK (currency IN ('SAR','USD','EUR','GBP','AED','KWD','BHD','QAR','OMR','JOD','EGP'));
  END IF;
END $$;

COMMIT;
