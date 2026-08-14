#!/usr/bin/env bash
# ============================================================================
# One-click security re-scan.
#
# Runs the checks that must hold after EVERY deployment:
#   1. dependency audit          (known CVEs in the lockfile)
#   2. RLS coverage              (every public table has RLS enabled)
#   3. SECURITY DEFINER hygiene  (fixed search_path, no anon EXECUTE)
#   4. grant sanity              (no table exposed to anon without a policy)
#
# All four are read-only: the dependency audit touches no database, and checks
# 2-4 only read the system catalogs. Nothing here writes, so this scan can run
# alongside any other job without contending for rows. (The pgTAP security
# suite needs seeded fixtures and lives in run-ssot-tests.sh — see the note at
# the foot of this file.)
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

step "1/4 Dependency audit"
# The command is `bun audit`, not `bun pm audit` — the latter is not a
# subcommand, so bun printed its help text and exited non-zero. The old `if`
# read that as "advisories found", which is how run #1 of this workflow
# reported a dependency finding without ever having audited anything.
#
# `bun audit` also exits non-zero *both* when it finds advisories and when it
# fails to run, so the exit status still cannot tell those apart — but a
# parseable JSON report can. If the JSON parses, the audit ran.
#
# The two outcomes need opposite responses: a tool that cannot run is a bug in
# this script and always fails; advisories are a tracked backlog item (P1-04)
# and only fail when explicitly asked.
AUDIT_JSON="${TMPDIR:-/tmp}/sightb-audit.json"
COUNT=0
if ! command -v bun >/dev/null 2>&1; then
  fail "bun is not on PATH — the dependency audit did not run"
elif ! command -v node >/dev/null 2>&1; then
  fail "node is not on PATH — cannot read the audit report"
else
  bun audit --json >"$AUDIT_JSON" 2>/dev/null || true
  COUNT=$(node -e '
    const fs = require("fs");
    let data;
    try { data = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); }
    catch { process.exit(2); }
    let n = 0;
    for (const [pkg, list] of Object.entries(data))
      for (const a of list)
        if (a.severity === "high" || a.severity === "critical") {
          n++;
          console.error("  " + a.severity.padEnd(8) + " " + pkg + " — " + a.title);
        }
    console.log(n);
  ' "$AUDIT_JSON")
  if [ $? -ne 0 ]; then
    fail 'bun audit produced no parseable report — the dependency audit did not run'
    COUNT=0
  elif [ "$COUNT" -eq 0 ]; then
    pass "no high/critical advisories"
  elif [ "${STRICT_AUDIT:-0}" = "1" ]; then
    fail "$COUNT high/critical advisories (STRICT_AUDIT=1)"
  else
    # Non-gating by default, deliberately. `xlsx` carries two high advisories
    # with no fix published, so a gating audit would paint this workflow red
    # every night for a known, already-tracked reason — and a workflow that is
    # always red is a workflow nobody reads. The findings are still printed
    # above and land in the job summary. Flip STRICT_AUDIT=1 once P1-04 is
    # closed (xlsx replaced, single lockfile) and this becomes a real gate.
    printf '\033[33m⚠ %s high/critical advisories — tracked as P1-04, not gating.\033[0m\n' "$COUNT"
  fi
fi

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  printf '\n\033[33m⚠ SUPABASE_DB_URL not set — database checks skipped.\033[0m\n'
  exit $FAILED
fi

psql_q() { psql "$SUPABASE_DB_URL" -tAX -c "$1"; }

step "2/4 RLS coverage on public tables"
NO_RLS=$(psql_q "SELECT string_agg(c.relname, ', ')
                   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;")
if [ -z "$NO_RLS" ]; then pass "all public tables have RLS enabled"
else fail "tables without RLS: $NO_RLS"; fi

step "3/4 SECURITY DEFINER hygiene"
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

step "4/4 Grant sanity (anon reach without a permissive policy)"
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

# The pgTAP security suite deliberately does NOT run here.
#
# supabase/tests/security.pgtap.sql reads its fixtures by name
# (`WHERE name = 'SSOT Project A'`) and UPDATEs a seeded expense row. Those
# fixtures are created by seed_ssot.sql, which only run-ssot-tests.sh calls —
# so running the suite from here was wrong twice over:
#
#   1. On a database that has not been seeded, the fixture lookup yields NULL
#      and the suite fails for a reason unrelated to security.
#   2. Both workflows trigger on push to main, so once SUPABASE_DB_URL is set,
#      this ran concurrently with the SSOT job — re-seeding the very rows this
#      suite was mid-way through updating inside its own transaction.
#
# The suite has one correct home: run-ssot-tests.sh, immediately after the
# seed, which is where it already runs. Everything above this line is
# read-only catalog introspection and is safe to run at any time against any
# database, seeded or not.
echo
printf 'ℹ pgTAP security suite runs in the SSOT Tests workflow (it needs seeded fixtures).\n'

echo
if [ "$FAILED" -eq 0 ]; then echo "✔ Security scan clean."; else echo "✘ Security scan found issues."; fi
exit $FAILED
