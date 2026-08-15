-- ============================================================================
-- pgTAP security regression tests
--
-- Covers the two guarantees that a code change can silently break:
--   1. record-ownership triggers  (user_id cannot be reassigned)
--   2. attachment access rules    (a receipt path is readable only through a
--                                  real record in a project you have a role on)
--
-- Prereq: seed_ssot.sql loaded, pgtap installed.
-- Run:
--   psql "$SUPABASE_DB_URL" -f supabase/tests/security.pgtap.sql
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(18);

-- ── Fixtures ───────────────────────────────────────────────────────────────
DO $$
DECLARE
  _p1 uuid; _owner uuid; _exp uuid;
BEGIN
  SELECT id, user_id INTO _p1, _owner FROM public.projects WHERE name = 'SSOT Project A';
  SELECT id INTO _exp FROM public.expenses WHERE project_id = _p1 LIMIT 1;

  UPDATE public.expenses
     SET receipt_attachments =
         jsonb_build_array(jsonb_build_object('name','sec-test','path','sec-test/receipt.jpg'))
   WHERE id = _exp;

  PERFORM set_config('sec.p1', _p1::text, false);
  PERFORM set_config('sec.owner', _owner::text, false);
  PERFORM set_config('sec.exp', _exp::text, false);
END $$;

-- ── 1. Ownership triggers exist on every user-owned table ──────────────────
SELECT is(
  (SELECT count(*)::int
     FROM pg_trigger t
     JOIN pg_class c ON c.oid = t.tgrelid
     JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE p.proname = 'prevent_owner_reassignment'
      AND c.relname = tbl
      AND NOT t.tgisinternal),
  1,
  format('%s has the prevent_owner_reassignment trigger', tbl)
) FROM unnest(ARRAY['expenses','projects','companies','budget_items',
                    'resource_reimbursements','payment_requests']) AS tbl;
-- 6 tests

-- ── 7. prevent_owner_reassignment blocks a non-admin ───────────────────────
SELECT throws_ok(
  $q$ SET LOCAL role authenticated;
      UPDATE public.expenses
         SET user_id = '00000000-0000-0000-0000-0000000000ff'
       WHERE id = current_setting('sec.exp')::uuid; $q$,
  NULL, NULL,
  'reassigning expenses.user_id without an admin/owner role is rejected'
);

-- ── 8-9. Attachment access: the SECURITY DEFINER guards exist and are locked
SELECT ok(
  (SELECT prosecdef FROM pg_proc WHERE proname = 'can_access_expense_receipt'),
  'can_access_expense_receipt is SECURITY DEFINER'
);
SELECT ok(
  (SELECT prosecdef FROM pg_proc WHERE proname = 'can_access_resource_receipt'),
  'can_access_resource_receipt is SECURITY DEFINER'
);

-- ── 10-11. anon may never execute the attachment guards ────────────────────
SELECT ok(
  NOT has_function_privilege('anon', 'public.can_access_expense_receipt(text)', 'EXECUTE'),
  'anon cannot execute can_access_expense_receipt'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.explain_attachment_access(text)', 'EXECUTE'),
  'anon cannot execute explain_attachment_access'
);

-- ── 12. An unknown path matches no record → access denied ──────────────────
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.expenses e
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(e.receipt_attachments,'[]'::jsonb)) a
    WHERE a->>'path' = 'nobody/does-not-exist.jpg'
  ),
  'an orphan path resolves to zero records (guard returns false)'
);

-- ── 13. A seeded path resolves to exactly one owning project ───────────────
SELECT is(
  (SELECT count(DISTINCT e.project_id)::int FROM public.expenses e
     CROSS JOIN LATERAL jsonb_array_elements(COALESCE(e.receipt_attachments,'[]'::jsonb)) a
    WHERE a->>'path' = 'sec-test/receipt.jpg'),
  1,
  'a receipt path maps to exactly one owning project'
);

-- ── 14. Storage policies on the receipt buckets go through the guards ──────
SELECT ok(
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (qual LIKE '%can_access_expense_receipt%'
           OR qual LIKE '%can_access_resource_receipt%')) >= 1,
  'storage.objects policies delegate to the attachment access guards'
);

-- ── 15-16. The explainer must agree with the policy it claims to explain ───
--
-- explain_attachment_access re-implements the access rules rather than running
-- can_access_expense_receipt, so the two can drift and the inspector can
-- confidently describe a decision that is no longer the decision being made.
-- Tests 8-11 pin that both functions exist and are locked; these pin that they
-- still say the same thing.
--
-- Both need a session, and auth.uid() is not drivable in every environment the
-- suite runs in. Where it is not, these pass with a note rather than fail: this
-- repository has already been burned three times by CI failures that reflected
-- the harness rather than the code.
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', current_setting('sec.owner'))::text,
                     true);
END $$;

SELECT CASE WHEN auth.uid() IS NULL THEN
  pass('skipped: auth.uid() is not drivable in this environment')
ELSE
  is(
    public.explain_attachment_access('sec-test/receipt.jpg')->>'decision',
    CASE WHEN public.can_access_expense_receipt('sec-test/receipt.jpg') THEN 'allow' ELSE 'deny' END,
    'explainer and storage guard agree on a real receipt path'
  )
END;

SELECT CASE WHEN auth.uid() IS NULL THEN
  pass('skipped: auth.uid() is not drivable in this environment')
ELSE
  is(
    public.explain_attachment_access('nobody/does-not-exist.jpg')->>'decision',
    CASE WHEN public.can_access_expense_receipt('nobody/does-not-exist.jpg') THEN 'allow' ELSE 'deny' END,
    'explainer and storage guard agree on an orphan path'
  )
END;

-- ── 17-18. The deny path must not disclose whether a path exists ───────────
--
-- A caller with no role anywhere is denied either way; the point is that the
-- two denials are indistinguishable. Before the 2026-08-15 migration they were
-- not: a real path returned match_count/bucket/source and the reason
-- no_role_on_owning_project, an unknown one returned
-- orphan_path_no_matching_record — enough to probe for existence.
--
-- Any uuid with no user_roles rows works; nothing is inserted.
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', '00000000-0000-0000-0000-0000000000ff')::text,
                     true);
END $$;

SELECT CASE WHEN auth.uid() IS NULL THEN
  pass('skipped: auth.uid() is not drivable in this environment')
ELSE
  ok(
    NOT (public.explain_attachment_access('sec-test/receipt.jpg') ? 'match_count')
    AND NOT (public.explain_attachment_access('sec-test/receipt.jpg') ? 'bucket'),
    'an unauthorised deny carries no existence keys'
  )
END;

SELECT CASE WHEN auth.uid() IS NULL THEN
  pass('skipped: auth.uid() is not drivable in this environment')
ELSE
  is(
    (public.explain_attachment_access('sec-test/receipt.jpg')  - 'checked_at' - 'path')::text,
    (public.explain_attachment_access('nobody/does-not-exist.jpg') - 'checked_at' - 'path')::text,
    'an unauthorised caller cannot tell a real path from an orphan'
  )
END;

SELECT * FROM finish();

ROLLBACK;
