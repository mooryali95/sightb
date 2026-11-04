-- ============================================================================
-- An advance settled from its own fund is not counted twice.
-- check_fund_balance counts an outstanding advance as cash already drawn; the
-- expense that settles it (source_payment_request_id) must convert that draw,
-- not add to it. Fund 2,000, advance 2,000 paid from it, settled by a 2,000
-- expense from the same fund: accepted. Then the fund is spent, so 1 more is
-- refused. Self-contained, rolled back; raises with the case that fails.
-- Run: psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/fund-advance.sql
-- ============================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

INSERT INTO auth.users (id, email) VALUES ('f1000000-0000-4000-8000-0000000000a1', 'fund-advance@test') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role, scope_type, scope_id) VALUES ('f1000000-0000-4000-8000-0000000000a1', 'admin', 'system', NULL);
INSERT INTO public.companies (id, user_id, name) VALUES ('f1000000-0000-4000-8000-0000000000c1', 'f1000000-0000-4000-8000-0000000000a1', 'اختبار السلفة');
INSERT INTO public.projects (id, user_id, company_id, name, currency)
VALUES ('f1000000-0000-4000-8000-0000000000b1', 'f1000000-0000-4000-8000-0000000000a1', 'f1000000-0000-4000-8000-0000000000c1', 'مشروع السلفة', 'SAR');
INSERT INTO public.resources (id, user_id, project_id, name, monthly_cost)
VALUES ('f1000000-0000-4000-8000-0000000000e1', 'f1000000-0000-4000-8000-0000000000a1', 'f1000000-0000-4000-8000-0000000000b1', 'مورد', 0);
INSERT INTO public.project_funds (id, project_id, fund_number, amount, transfer_date, created_by, status)
VALUES ('f1000000-0000-4000-8000-0000000000f1', 'f1000000-0000-4000-8000-0000000000b1', 1, 2000, '2026-01-01', 'f1000000-0000-4000-8000-0000000000a1', 'acknowledged');
INSERT INTO public.payment_requests (id, project_id, resource_id, request_type, amount, currency, description, requested_by, user_id, status, paid_from_fund_id, is_advance_outstanding)
VALUES ('f1000000-0000-4000-8000-0000000000d1', 'f1000000-0000-4000-8000-0000000000b1', 'f1000000-0000-4000-8000-0000000000e1', 'advance', 2000, 'SAR', 'سلفة',
        'f1000000-0000-4000-8000-0000000000a1', 'f1000000-0000-4000-8000-0000000000a1', 'paid', 'f1000000-0000-4000-8000-0000000000f1', true);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.expenses (user_id, project_id, category, description, amount, date, month, approval_status, fund_id, source_payment_request_id, is_vat_exempt)
    VALUES ('f1000000-0000-4000-8000-0000000000a1', 'f1000000-0000-4000-8000-0000000000b1', 'other', 'تسوية السلفة', 2000, '2026-01-05', 1, 'approved',
            'f1000000-0000-4000-8000-0000000000f1', 'f1000000-0000-4000-8000-0000000000d1', true);
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'the settling expense was refused (advance counted twice): %', SQLERRM;
  END;
  BEGIN
    INSERT INTO public.expenses (user_id, project_id, category, description, amount, date, month, approval_status, fund_id, is_vat_exempt)
    VALUES ('f1000000-0000-4000-8000-0000000000a1', 'f1000000-0000-4000-8000-0000000000b1', 'other', 'زيادة', 1, '2026-01-06', 1, 'approved',
            'f1000000-0000-4000-8000-0000000000f1', true);
    RAISE EXCEPTION 'an expense past the spent fund was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'an expense past%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'fund-advance: both cases hold';
END $$;

ROLLBACK;
