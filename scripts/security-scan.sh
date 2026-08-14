#!/usr/bin/env bash
# ============================================================================
# One-click security re-scan.
#
# Runs the checks that must hold after EVERY deployment:
#   1. dependency audit          (known CVEs in the lockfile)
#   2. RLS coverage              (every public table has RLS enabled)
#   3. SECURITY DEFINER hygiene  (fixed search_path, no anon EXECUTE)
#   4. grant sanity              (no table exposed to anon without a policy)
#   5. security regression tests (pgTAP: ownership triggers + attachments)
#
# DB checks are skipped (not failed) when SUPABASE_DB_URL is absent, so the
# workflow still gives value on forks without database secrets.
#
#   bash scripts/security-scan.sh
# ============================================================================
set -uo pipefail

FAILED=0
step() { printf '\n\033[1m▶ %s\033[0m\n' "$1"; }
fail() { printf '\033[31m✘ %s\033[0m\n' "$1"; FAILED=1; }
pass() { printf '\033[32m✔ %s\033[0m\n' "$1"; }

step "1/5 Dependency audit"
if bun pm audit --audit-level=high 2>/dev/null; then
  pass "no high/critical advisories"
else
  fail "dependency advisories found (see output above)"
fi

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  printf '\n\033[33m⚠ SUPABASE_DB_URL not set — database checks skipped.\033[0m\n'
  exit $FAILED
fi

psql_q() { psql "$SUPABASE_DB_URL" -tAX -c "$1"; }

step "2/5 RLS coverage on public tables"
NO_RLS=$(psql_q "SELECT string_agg(c.relname, ', ')
                   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;")
if [ -z "$NO_RLS" ]; then pass "all public tables have RLS enabled"
else fail "tables without RLS: $NO_RLS"; fi

step "3/5 SECURITY DEFINER hygiene"
NO_PATH=$(psql_q "SELECT string_agg(p.proname, ', ')
                    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.prosecdef
                     AND (p.proconfig IS NULL
                          OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) cfg
                                          WHERE cfg LIKE 'search_path=%'));")
if [ -z "$NO_PATH" ]; then pass "every SECURITY DEFINER function pins search_path"
else fail "SECURITY DEFINER without search_path: $NO_PATH"; fi

ANON_EXEC=$(psql_q "SELECT string_agg(p.proname, ', ')
                      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                     WHERE n.nspname = 'public' AND p.prosecdef
                       AND p.proname IN ('can_access_expense_receipt','can_access_resource_receipt',
                                         'explain_attachment_access','ssot_explain',
                                         'project_financial_summary','split_settle_advance')
                       AND has_function_privilege('anon', p.oid, 'EXECUTE');")
if [ -z "$ANON_EXEC" ]; then pass "anon cannot execute privileged functions"
else fail "anon can execute: $ANON_EXEC"; fi

step "4/5 Grant sanity (anon reach without a permissive policy)"
LEAKY=$(psql_q "SELECT string_agg(t.relname, ', ') FROM (
                  SELECT c.relname, c.oid
                    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                   WHERE n.nspname='public' AND c.relkind='r'
                     AND has_table_privilege('anon', c.oid, 'SELECT')
                ) t
                WHERE NOT EXISTS (SELECT 1 FROM pg_policies pol
                                   WHERE pol.schemaname='public' AND pol.tablename=t.relname
                                     AND 'anon' = ANY(pol.roles));")
if [ -z "$LEAKY" ]; then pass "no anon-readable table lacking an anon policy"
else fail "anon SELECT granted without matching policy: $LEAKY"; fi

step "5/5 Security regression tests (pgTAP)"
if psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/security.pgtap.sql; then
  pass "ownership triggers + attachment access rules hold"
else
  fail "security pgTAP suite failed"
fi

echo
if [ "$FAILED" -eq 0 ]; then echo "✔ Security scan clean."; else echo "✘ Security scan found issues."; fi
exit $FAILED
