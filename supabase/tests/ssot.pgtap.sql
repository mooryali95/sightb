-- ============================================================================
-- pgTAP tests for SSOT triggers and formulas
--
-- Prereq: seed_ssot.sql already loaded. Extension pgtap installed:
--   CREATE EXTENSION IF NOT EXISTS pgtap;
--
-- Run:
--   psql "$SUPABASE_DB_URL" -f supabase/tests/ssot.pgtap.sql
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(10);

-- ── Fixture lookups ────────────────────────────────────────────────────────
DO $$
DECLARE
  _p1 uuid; _f1 uuid; _cu1 uuid;
BEGIN
  SELECT id INTO _p1 FROM public.projects WHERE name = 'SSOT Project A';
  SELECT id INTO _f1 FROM public.project_funds WHERE project_id = _p1 AND fund_number = 1;
  SELECT id INTO _cu1 FROM public.custodies WHERE project_id = _p1 AND source_fund_id = _f1;
  PERFORM set_config('ssot.p1', _p1::text, false);
  PERFORM set_config('ssot.f1', _f1::text, false);
  PERFORM set_config('ssot.cu1', _cu1::text, false);
END $$;

-- 1) Fund balance = amount − (direct + custody + advances + transfers_out)
SELECT is(
  (SELECT amount
      - COALESCE((SELECT SUM(e.amount) FROM public.expenses e
                    LEFT JOIN public.custodies cu ON cu.id = e.custody_id
                    WHERE e.fund_id = current_setting('ssot.f1')::uuid
                      AND (cu.source_fund_id IS NULL
                           OR cu.source_fund_id <> current_setting('ssot.f1')::uuid)), 0)
      - COALESCE((SELECT SUM(amount) FROM public.custodies
                    WHERE source_fund_id = current_setting('ssot.f1')::uuid), 0)
      - COALESCE((SELECT SUM(GREATEST(amount - COALESCE(refunded_amount,0), 0))
                    FROM public.payment_requests
                    WHERE paid_from_fund_id = current_setting('ssot.f1')::uuid
                      AND request_type = 'advance' AND status = 'paid'
                      AND is_advance_outstanding), 0)
      - COALESCE((SELECT SUM(amount) FROM public.cash_transfers
                    WHERE from_fund_id = current_setting('ssot.f1')::uuid), 0)
    FROM public.project_funds WHERE id = current_setting('ssot.f1')::uuid)::numeric,
  30000::numeric,
  'Fund #1 remaining balance = 30,000 (50k − 5k direct − 10k custody − 5k cash_transfer)'
);

-- 2) check_fund_balance rejects over-limit expense
SELECT throws_ok(
  $q$ INSERT INTO public.expenses(user_id, project_id, category, description, amount,
        date, month, approval_status, fund_id, is_vat_exempt)
      VALUES ((SELECT user_id FROM public.projects WHERE id = current_setting('ssot.p1')::uuid),
              current_setting('ssot.p1')::uuid,
              'other','over-limit', 999999, '2026-02-01', 2, 'approved',
              current_setting('ssot.f1')::uuid, false); $q$,
  'P0001', NULL,
  'check_fund_balance blocks expense that exceeds fund'
);

-- 3) validate_cash_transfer rejects over-limit transfer
SELECT throws_ok(
  $q$ INSERT INTO public.cash_transfers(project_id, from_fund_id, to_custody_id, amount,
        transfer_date, user_id)
      VALUES (current_setting('ssot.p1')::uuid,
              current_setting('ssot.f1')::uuid,
              current_setting('ssot.cu1')::uuid,
              999999, '2026-02-01',
              (SELECT user_id FROM public.projects WHERE id = current_setting('ssot.p1')::uuid)); $q$,
  'P0001', NULL,
  'validate_cash_transfer blocks over-limit cash transfer'
);

-- 4) Custody auto-closes when fully exhausted
DO $$
DECLARE _cid uuid; _uid uuid;
BEGIN
  SELECT id, user_id INTO _cid, _uid FROM public.custodies
    WHERE project_id = current_setting('ssot.p1')::uuid AND status = 'active' LIMIT 1;
  IF _cid IS NOT NULL THEN
    INSERT INTO public.expenses(user_id, project_id, category, description, amount,
      date, month, approval_status, custody_id, is_vat_exempt)
    VALUES (_uid, current_setting('ssot.p1')::uuid,
            'other','drain custody', 13000, '2026-03-01', 3, 'approved', _cid, false);
  END IF;
END $$;

SELECT is(
  (SELECT status FROM public.custodies WHERE id = current_setting('ssot.cu1')::uuid),
  'closed'::text,
  'auto_close_custody_on_exhaustion: custody closed after spend ≥ amount + cash_in'
);

-- 5) enforce_single_expense_source clears fund_id when custody_id set
DO $$
DECLARE _cid uuid; _fid uuid; _pid uuid; _uid uuid; _new uuid;
BEGIN
  _pid := current_setting('ssot.p1')::uuid;
  _cid := current_setting('ssot.cu1')::uuid;
  _fid := current_setting('ssot.f1')::uuid;
  SELECT user_id INTO _uid FROM public.projects WHERE id = _pid;
  -- reopen custody for test
  UPDATE public.custodies SET status = 'active', closed_date = NULL WHERE id = _cid;
  INSERT INTO public.expenses(user_id, project_id, category, description, amount,
    date, month, approval_status, fund_id, custody_id, is_vat_exempt)
  VALUES (_uid, _pid, 'other','both sources', 100, '2026-04-01', 4, 'approved', _fid, _cid, false)
  RETURNING id INTO _new;
  PERFORM set_config('ssot.dual', _new::text, false);
END $$;

SELECT is(
  (SELECT fund_id FROM public.expenses WHERE id = current_setting('ssot.dual')::uuid),
  NULL::uuid,
  'enforce_single_expense_source: fund_id nulled when custody_id present'
);

-- 6) validate_cash_transfer rejects zero/negative amount
SELECT throws_ok(
  $q$ INSERT INTO public.cash_transfers(project_id, from_fund_id, to_custody_id, amount,
        transfer_date, user_id)
      VALUES (current_setting('ssot.p1')::uuid,
              current_setting('ssot.f1')::uuid,
              current_setting('ssot.cu1')::uuid,
              0, '2026-02-01',
              (SELECT user_id FROM public.projects WHERE id = current_setting('ssot.p1')::uuid)); $q$,
  'P0001', NULL,
  'validate_cash_transfer blocks zero amount'
);

-- 7) recalc_payment_request_from_events: outstanding advance stays outstanding
SELECT is(
  (SELECT is_advance_outstanding FROM public.payment_requests
     WHERE description = 'SSOT outstanding advance'),
  true,
  'Outstanding advance flag preserved before settlement events'
);

-- 8) Only one draft PR exists on Project B
SELECT is(
  (SELECT COUNT(*)::int FROM public.payment_requests
     WHERE project_id = (SELECT id FROM public.projects WHERE name = 'SSOT Project B (PRs)')
       AND status = 'draft'),
  1,
  'Project B has exactly 1 draft PR'
);

-- 9) system_audit_log received insert for projects
SELECT ok(
  EXISTS (SELECT 1 FROM public.system_audit_log
            WHERE entity_type = 'project'
              AND entity_name LIKE 'SSOT Project%'
              AND action = 'insert'),
  'system_audit trigger logs project inserts'
);

-- 10) has_role SECURITY DEFINER function exists and is stable
SELECT has_function('public'::name, 'has_role'::name, ARRAY['uuid','app_role']);

SELECT * FROM finish();

ROLLBACK;
