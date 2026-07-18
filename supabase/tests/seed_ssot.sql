-- ============================================================================
-- SSOT Fixtures Seed — idempotent
-- ----------------------------------------------------------------------------
-- Usage:
--   psql "$SUPABASE_DB_URL" \
--     -v owner_uid="'00000000-0000-0000-0000-000000000000'" \
--     -f supabase/tests/seed_ssot.sql
--
-- Creates: 1 company "SSOT Test Co", 1 portfolio, 3 projects, funds, custodies,
-- cash transfers, expenses, and payment_request drafts+paid+advance flows.
-- Deletes any previous "SSOT Test Co" data first (cascade).
-- ============================================================================

\if :{?owner_uid}
\else
  \echo 'ERROR: pass -v owner_uid=''<uuid>'' (a user that exists in auth.users)'
  \quit
\endif

BEGIN;

-- 1) Wipe previous run (cascade deletes projects/funds/expenses/etc.)
DELETE FROM public.companies WHERE name = 'SSOT Test Co';

-- 2) Rebuild
DO $seed$
DECLARE
  _uid       uuid := :owner_uid;
  _co_id     uuid;
  _pf_id     uuid;
  _p1        uuid; _p2 uuid; _p3 uuid;
  _f1        uuid; _f2 uuid; _f3 uuid;
  _cu1       uuid; _cu2 uuid;
  _bi1       uuid;
BEGIN
  INSERT INTO public.companies(user_id, name, description, status)
  VALUES (_uid, 'SSOT Test Co', 'Fixtures for SSOT/pgTAP tests', 'active')
  RETURNING id INTO _co_id;

  INSERT INTO public.portfolios(user_id, company_id, name, fiscal_year)
  VALUES (_uid, _co_id, 'SSOT Portfolio', '2026')
  RETURNING id INTO _pf_id;

  -- Project A — funds + direct expenses + custody draw + cash transfer
  INSERT INTO public.projects(user_id, company_id, portfolio_id, name, contract_value, currency,
      start_date, end_date, duration_months, resource_count, status, tax_percent, vat_inclusive)
  VALUES (_uid, _co_id, _pf_id, 'SSOT Project A', 500000, 'SAR',
      '2026-01-01', '2026-12-31', 12, 3, 'active', 15, false)
  RETURNING id INTO _p1;

  -- Project B — payment_requests: draft + paid reimbursement + outstanding advance
  INSERT INTO public.projects(user_id, company_id, portfolio_id, name, contract_value, currency,
      start_date, end_date, duration_months, resource_count, status, tax_percent, vat_inclusive)
  VALUES (_uid, _co_id, _pf_id, 'SSOT Project B (PRs)', 250000, 'SAR',
      '2026-01-01', '2026-06-30', 6, 2, 'active', 15, false)
  RETURNING id INTO _p2;

  -- Project C — edge case: multiple funds, some settled
  INSERT INTO public.projects(user_id, company_id, portfolio_id, name, contract_value, currency,
      start_date, end_date, duration_months, resource_count, status, tax_percent, vat_inclusive)
  VALUES (_uid, _co_id, _pf_id, 'SSOT Project C (multi-fund)', 1000000, 'SAR',
      '2026-01-01', '2026-12-31', 12, 5, 'active', 15, false)
  RETURNING id INTO _p3;

  -- ── Funds on A
  INSERT INTO public.project_funds(project_id, fund_number, amount, transfer_date, status, created_by)
  VALUES (_p1, 1, 50000, '2026-01-05', 'acknowledged', _uid)
  RETURNING id INTO _f1;

  -- ── Custody on A drawn from _f1
  INSERT INTO public.custodies(project_id, company_id, user_id, resource_name, amount,
      received_date, status, source_fund_id)
  VALUES (_p1, _co_id, _uid, 'Site Manager (A)', 10000, '2026-01-10', 'active', _f1)
  RETURNING id INTO _cu1;

  -- ── Budget item on A (needed for expenses linkage)
  INSERT INTO public.budget_items(user_id, project_id, category, description, planned_amount,
      start_month, end_month, cost_type, cost_class)
  VALUES (_uid, _p1, 'labor', 'Labor — A', 100000, 1, 12, 'recurring', 'direct')
  RETURNING id INTO _bi1;

  -- ── Direct expense from fund
  INSERT INTO public.expenses(user_id, project_id, budget_item_id, category, description, amount,
      date, month, vendor, approval_status, fund_id, is_vat_exempt)
  VALUES (_uid, _p1, _bi1, 'labor', 'Direct spend from Fund #1', 5000,
      '2026-01-15', 1, 'Vendor X', 'approved', _f1, false);

  -- ── Custody expense
  INSERT INTO public.expenses(user_id, project_id, budget_item_id, category, description, amount,
      date, month, vendor, approval_status, custody_id, is_vat_exempt)
  VALUES (_uid, _p1, _bi1, 'materials', 'Custody purchase', 2000,
      '2026-01-20', 1, 'Vendor Y', 'approved', _cu1, false);

  -- ── Cash transfer Fund → Custody (5,000)
  INSERT INTO public.cash_transfers(project_id, from_fund_id, to_custody_id, amount, transfer_date, user_id, notes)
  VALUES (_p1, _f1, _cu1, 5000, '2026-01-25', _uid, 'SSOT cash transfer');

  -- ── Funds on C
  INSERT INTO public.project_funds(project_id, fund_number, amount, transfer_date, status, created_by)
  VALUES (_p3, 1, 100000, '2026-01-05', 'settled', _uid) RETURNING id INTO _f2;
  INSERT INTO public.project_funds(project_id, fund_number, amount, transfer_date, status, created_by)
  VALUES (_p3, 2, 150000, '2026-02-05', 'acknowledged', _uid) RETURNING id INTO _f3;
  INSERT INTO public.custodies(project_id, company_id, user_id, resource_name, amount,
      received_date, status, source_fund_id)
  VALUES (_p3, _co_id, _uid, 'Site Manager (C)', 20000, '2026-02-10', 'active', _f3)
  RETURNING id INTO _cu2;

  -- ── Payment requests on B: draft + advance (paid & outstanding)
  INSERT INTO public.payment_requests(project_id, request_type, amount, currency, description,
      status, requested_by, user_id, is_advance_outstanding)
  VALUES (_p2, 'other', 3000, 'SAR', 'SSOT draft PR', 'draft', _uid, _uid, false);

  -- Advance paid → outstanding
  INSERT INTO public.project_funds(project_id, fund_number, amount, transfer_date, status, created_by)
  VALUES (_p2, 1, 30000, '2026-01-05', 'acknowledged', _uid);
  DECLARE _f_b uuid;
  BEGIN
    SELECT id INTO _f_b FROM public.project_funds WHERE project_id = _p2 AND fund_number = 1;
    INSERT INTO public.payment_requests(project_id, request_type, amount, currency, description,
        status, requested_by, user_id, paid_from_fund_id, paid_date, is_advance_outstanding)
    VALUES (_p2, 'advance', 8000, 'SAR', 'SSOT outstanding advance', 'paid', _uid, _uid,
        _f_b, '2026-01-15', true);
  END;

  RAISE NOTICE 'SSOT fixtures ready: company=%, projects=[A:%, B:%, C:%]',
    _co_id, _p1, _p2, _p3;
END
$seed$;

COMMIT;
