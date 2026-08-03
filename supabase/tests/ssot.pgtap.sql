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

SELECT plan(18);

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


-- ══════════════════════════════════════════════════════════════════════════
-- End-to-end cash path:
--   fund → cash transfer → custody → expense → advance → settlement → payable
-- Each step asserts that the SSOT figures stay reconciled after the write.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  _p uuid; _uid uuid; _cid uuid; _f uuid; _cu uuid; _pr uuid; _pay uuid;
BEGIN
  SELECT id, user_id, company_id INTO _p, _uid, _cid
    FROM public.projects WHERE name = 'SSOT Project A';

  -- Dedicated fund so the earlier assertions stay untouched.
  INSERT INTO public.project_funds(project_id, fund_number, amount, transfer_date, status, created_by)
  VALUES (_p, 90, 100000, '2026-03-01', 'transferred', _uid)
  RETURNING id INTO _f;

  INSERT INTO public.custodies(project_id, company_id, user_id, resource_name, amount,
                               received_date, status, source_fund_id)
  VALUES (_p, _cid, _uid, 'E2E Custodian', 20000, '2026-03-02', 'active', _f)
  RETURNING id INTO _cu;

  INSERT INTO public.cash_transfers(project_id, from_fund_id, to_custody_id, amount, transfer_date, user_id)
  VALUES (_p, _f, _cu, 5000, '2026-03-03', _uid);

  INSERT INTO public.expenses(user_id, project_id, category, description, amount, date, month,
                              approval_status, custody_id, is_vat_exempt)
  VALUES (_uid, _p, 'other', 'E2E custody spend', 12000, '2026-03-04', 3, 'approved', _cu, false);

  INSERT INTO public.payment_requests(project_id, resource_id, request_type, amount, currency,
                                      description, status, requested_by, user_id,
                                      paid_from_fund_id, paid_date)
  VALUES (_p, (SELECT id FROM public.resources WHERE project_id = _p LIMIT 1),
          'advance', 8000, 'SAR', 'E2E advance', 'paid', _uid, _uid, _f, '2026-03-05')
  RETURNING id INTO _pr;

  INSERT INTO public.resource_reimbursements(project_id, category, description, amount, expense_date,
                                             status, user_id, source_kind, vendor_name)
  VALUES (_p, 'other', 'E2E vendor payable', 3000, '2026-03-06', 'approved', _uid, 'vendor', 'E2E Vendor')
  RETURNING id INTO _pay;

  PERFORM set_config('ssot.e2e_f',   _f::text,   false);
  PERFORM set_config('ssot.e2e_cu',  _cu::text,  false);
  PERFORM set_config('ssot.e2e_pr',  _pr::text,  false);
  PERFORM set_config('ssot.e2e_pay', _pay::text, false);
  PERFORM set_config('ssot.e2e_p',   _p::text,   false);
END $$;

-- 11) Advance marked outstanding by mark_advance_outstanding_on_paid
SELECT is(
  (SELECT is_advance_outstanding FROM public.payment_requests
     WHERE id = current_setting('ssot.e2e_pr')::uuid),
  true,
  'E2E: paid advance is flagged outstanding'
);

-- 12) Advances never auto-create an expense (they are receivables)
SELECT is(
  (SELECT auto_created_expense_id FROM public.payment_requests
     WHERE id = current_setting('ssot.e2e_pr')::uuid),
  NULL::uuid,
  'E2E: advance does not create an expense before settlement'
);

-- 13) Custody balance = amount + cash_in − spent
SELECT is(
  (SELECT cu.amount
     + COALESCE((SELECT SUM(amount) FROM public.cash_transfers
                   WHERE to_custody_id = cu.id), 0)
     - COALESCE((SELECT SUM(amount) FROM public.expenses
                   WHERE custody_id = cu.id), 0)
     FROM public.custodies cu WHERE cu.id = current_setting('ssot.e2e_cu')::uuid)::numeric,
  13000::numeric,
  'E2E: custody balance = 20k + 5k transferred − 12k spent'
);

-- 14) Fund balance drains by custody draw + cash transfer + outstanding advance
SELECT is(
  (SELECT pf.amount
     - COALESCE((SELECT SUM(amount) FROM public.custodies
                   WHERE source_fund_id = pf.id), 0)
     - COALESCE((SELECT SUM(amount) FROM public.cash_transfers
                   WHERE from_fund_id = pf.id), 0)
     - COALESCE((SELECT SUM(GREATEST(amount - COALESCE(refunded_amount,0), 0))
                   FROM public.payment_requests
                   WHERE paid_from_fund_id = pf.id AND request_type = 'advance'
                     AND status = 'paid' AND is_advance_outstanding), 0)
     FROM public.project_funds pf WHERE pf.id = current_setting('ssot.e2e_f')::uuid)::numeric,
  67000::numeric,
  'E2E: fund balance = 100k − 20k custody − 5k cash − 8k advance'
);

-- 15) Settling the advance via cash refund clears the outstanding flag
DO $$
DECLARE _pr uuid := current_setting('ssot.e2e_pr')::uuid;
BEGIN
  INSERT INTO public.settlement_events(payment_request_id, project_id, event_type, amount,
                                       refund_to_fund_id, created_by)
  VALUES (_pr, current_setting('ssot.e2e_p')::uuid, 'cash_refund', 8000,
          current_setting('ssot.e2e_f')::uuid,
          (SELECT user_id FROM public.projects WHERE id = current_setting('ssot.e2e_p')::uuid));
END $$;

SELECT is(
  (SELECT is_advance_outstanding FROM public.payment_requests
     WHERE id = current_setting('ssot.e2e_pr')::uuid),
  false,
  'E2E: full cash refund closes the advance'
);

-- 16) refunded_amount recomputed from settlement_events by the trigger
SELECT is(
  (SELECT refunded_amount FROM public.payment_requests
     WHERE id = current_setting('ssot.e2e_pr')::uuid)::numeric,
  8000::numeric,
  'E2E: refunded_amount mirrors the settlement events ledger'
);

-- 17) Settling a vendor payable through an expense closes the payable
DO $$
DECLARE _eid uuid;
BEGIN
  INSERT INTO public.expenses(user_id, project_id, category, description, amount, date, month,
                              approval_status, custody_id, is_vat_exempt, reimburses_payable_id)
  VALUES ((SELECT user_id FROM public.projects WHERE id = current_setting('ssot.e2e_p')::uuid),
          current_setting('ssot.e2e_p')::uuid, 'other', 'E2E payable settlement', 3000,
          '2026-03-07', 3, 'approved', current_setting('ssot.e2e_cu')::uuid, false,
          current_setting('ssot.e2e_pay')::uuid)
  RETURNING id INTO _eid;
  PERFORM set_config('ssot.e2e_settle_exp', _eid::text, false);
END $$;

SELECT is(
  (SELECT status::text FROM public.resource_reimbursements
     WHERE id = current_setting('ssot.e2e_pay')::uuid),
  'reimbursed',
  'E2E: expense linked to a payable settles it via settle_payable_on_expense'
);

-- 18) Deleting that expense reopens the payable (no silent data loss)
DO $$
BEGIN
  DELETE FROM public.expenses WHERE id = current_setting('ssot.e2e_settle_exp')::uuid;
END $$;

SELECT is(
  (SELECT status::text FROM public.resource_reimbursements
     WHERE id = current_setting('ssot.e2e_pay')::uuid),
  'approved',
  'E2E: deleting the settling expense reopens the payable'
);


SELECT * FROM finish();

ROLLBACK;
