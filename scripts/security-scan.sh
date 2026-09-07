#!/usr/bin/env bash
# ============================================================================
# One-click security re-scan.
#
# Runs the checks that must hold after EVERY deployment:
#   1. dependency audit          (known CVEs in the lockfile)
#   2. RLS coverage              (every public table has RLS enabled)
#   3. SECURITY DEFINER hygiene  (fixed search_path, no anon EXECUTE)
#   4. grant sanity              (what the anon role can actually read)
#   5. migration drift           (every tracked file present in the history table)
#   6. schema invariants         (disclosure fix, ISO 4217 constraints, currency values)
#
# All six are read-only: the dependency audit touches no database, and checks
# 2-6 only read the system catalogs. Nothing here writes, so this scan can run
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

# Bound every registry call, where coreutils provides the means to. Left
# empty rather than failing if it does not: an unbounded audit still beats
# no audit at all.
AUDIT_TIMEOUT=""
command -v timeout >/dev/null 2>&1 && AUDIT_TIMEOUT="timeout 120"

step "1/6 Dependency audit"
# Scope is production dependencies only, and that scoping is the whole point.
#
# The audit used to count every installed package and was therefore left
# non-gating, with a note to "flip STRICT_AUDIT=1 once xlsx is replaced".
# Measuring showed that guidance was wrong. With xlsx gone there are still 28
# high/critical advisories across the full tree — but they are in vitest, vite,
# rollup, and the glob/minimatch chain under eslint. Build tooling. A ReDoS in
# the thing that matches filenames at build time is not a risk to a user's
# financial data, and gating on it would paint this workflow red every night
# for reasons nobody can act on. A workflow that is always red is a workflow
# nobody reads.
#
# Production dependencies are what actually reach a browser, and there the
# count is zero. So that is what this gates on, by default, with no opt-in.
#
# npm rather than bun: `bun audit` has no production-only scope (--json,
# --audit-level and --ignore are the only flags). `npm audit --omit=dev` does,
# and now works because package-lock.json is back in sync.
AUDIT_JSON="${TMPDIR:-/tmp}/sightb-audit.json"
if ! command -v npm >/dev/null 2>&1; then
  fail "npm is not on PATH — the dependency audit did not run"
elif ! command -v node >/dev/null 2>&1; then
  fail "node is not on PATH — cannot read the audit report"
else
  # npm audit exits non-zero both when it finds advisories and when it fails to
  # run, so the exit status cannot tell those apart — but a parseable report
  # can. If the JSON parses, the audit ran. Those two outcomes need opposite
  # responses: a tool that could not run is a bug in this script.
  # Bounded, and retried once. On 4 September this call hung for five minutes
  # and came back with nothing parseable, reddening the nightly scan for a
  # reason outside this repository. Failing loudly was the correct response —
  # the report genuinely had not been computed — but a registry hiccup should
  # not need a human. Two bounded attempts, then the parse below decides.
  for attempt in 1 2; do
    $AUDIT_TIMEOUT npm audit --omit=dev --json >"$AUDIT_JSON" 2>/dev/null
    if node -e 'const d = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
                if (!d.metadata || !d.metadata.vulnerabilities) process.exit(1);' \
            "$AUDIT_JSON" 2>/dev/null; then break; fi
    [ "$attempt" -eq 1 ] && sleep 5
  done
  if COUNT=$(node -e '
    const fs = require("fs");
    let data;
    try { data = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); }
    catch { process.exit(2); }
    if (!data.metadata || !data.metadata.vulnerabilities) process.exit(2);
    const v = data.metadata.vulnerabilities;
    for (const [name, adv] of Object.entries(data.vulnerabilities || {}))
      if (adv.severity === "high" || adv.severity === "critical")
        console.error("  " + adv.severity.padEnd(8) + " " + name +
                      " — fix available: " + JSON.stringify(adv.fixAvailable));
    console.log((v.high || 0) + (v.critical || 0));
  ' "$AUDIT_JSON"); then
    if [ "$COUNT" -eq 0 ]; then
      pass "no high/critical advisories in production dependencies"
    else
      fail "$COUNT high/critical advisories in production dependencies"
      printf '  These ship to users. Upgrade, or replace the package if no fix exists.\n'
    fi
  else
    fail 'npm audit produced no parseable report — the dependency audit did not run'
  fi

  # Development advisories are reported but never gate: they affect the build
  # machine, not the deployed application. Printed so a genuinely alarming one
  # is still visible rather than hidden by the scoping above.
  $AUDIT_TIMEOUT npm audit --json >"$AUDIT_JSON" 2>/dev/null || true
  DEV=$(node -e '
    const fs = require("fs");
    try {
      const d = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      const v = d.metadata.vulnerabilities;
      console.log((v.high || 0) + (v.critical || 0));
    } catch { console.log("?"); }
  ' "$AUDIT_JSON")
  printf '\033[33mℹ %s high/critical across all dependencies including build tooling — informational.\033[0m\n' "$DEV"
fi

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  printf '\n\033[33m⚠ SUPABASE_DB_URL not set — database checks skipped.\033[0m\n'
  exit $FAILED
fi

psql_q() { psql "$SUPABASE_DB_URL" -tAX -c "$1"; }

step "2/6 RLS coverage on public tables"
NO_RLS=$(psql_q "SELECT string_agg(c.relname, ', ')
                   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;")
if [ -z "$NO_RLS" ]; then pass "all public tables have RLS enabled"
else fail "tables without RLS: $NO_RLS"; fi

step "3/6 SECURITY DEFINER hygiene"
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

step "4/6 Grant sanity (what anon can actually reach)"
# This check used to ask a question whose answer meant nothing: does a table
# anon holds SELECT on lack a policy naming anon? On this database that was
# true of 35 tables out of 36 — and every one of them was safe.
#
# The reason is how Supabase is wired. It grants anon SELECT on public tables
# by default, and the policies here are written TO authenticated. With RLS on
# and no policy matching anon, Postgres denies by default: anon sees zero rows.
# So the old check read the safe, ordinary arrangement as a leak, and would
# have painted this workflow red on 35 tables the first night SUPABASE_DB_URL
# was set. A gate that cries wolf on the correct configuration is worse than no
# gate — people learn to scroll past it.
#
# It also missed the case that matters. A policy declared TO public applies to
# every role, anon included, but `'anon' = ANY(roles)` never matches `{public}`.
# The one shape that could actually expose data was the one shape it skipped.
#
# Both halves below were tested against a scratch Postgres in every direction:
# silent on a healthy database, and each fault firing only its own half.

# 4a. Empirical, and deliberately so: assume the anon role and count what comes
#     back. That is the path a logged-out browser takes, so zero here is
#     evidence rather than inference. Wrapped in a transaction that always rolls
#     back — SET LOCAL confines the role change to it, and the scan stays
#     read-only.
#
#     ON_ERROR_STOP is not optional. Without it a failed SET ROLE aborts the
#     transaction, psql prints the error to stderr and still exits 0, and the
#     empty result reads as "nothing found" — reporting a pass this check never
#     computed. That is the bun-pm-audit bug exactly, and it appeared in the
#     first draft of this rewrite.
ANON_READS=$(psql "$SUPABASE_DB_URL" -tAXq -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SET LOCAL ROLE anon;
SELECT coalesce(string_agg(x.relname || ' (' || x.n || ' rows)', ', ' ORDER BY x.relname), '')
  FROM (SELECT c.relname,
               (xpath('/row/c/text()',
                      query_to_xml(format('SELECT count(*) AS c FROM public.%I', c.relname),
                                   false, true, '')))[1]::text::bigint AS n
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'r'
           AND has_table_privilege('anon', c.oid, 'SELECT')) x
 WHERE x.n > 0;
ROLLBACK;
SQL
) || ANON_READS='__COULD_NOT_RUN__'

if [ "$ANON_READS" = '__COULD_NOT_RUN__' ]; then
  fail "could not assume the anon role — this check did not run"
  printf '  A check that cannot run must never be counted as a pass.\n'
elif [ -n "$ANON_READS" ]; then
  fail "anon can read rows from: $ANON_READS"
  printf '  Reachable without logging in. Find the permissive policy and scope it.\n'
else
  pass "anon reads no rows from any public table"
fi

# 4b. Static, and it earns its place: 4a can only speak for tables that hold
#     rows today. An empty table with a wide-open policy leaks the moment it is
#     populated, and 4a stays silent throughout. So every policy anon can reach
#     must also carry a visible guard.
#
#     Reachable means the roles list names anon, or names public — which is
#     every role. Guarded means it defers to service_role, or requires
#     auth.uid() (NULL for anon, so the predicate denies), or is a flat false.
UNGUARDED=$(psql_q "
  SELECT coalesce(string_agg(tablename || '.' || policyname, ', ' ORDER BY tablename, policyname), '')
    FROM pg_policies
   WHERE schemaname = 'public'
     AND permissive = 'PERMISSIVE'
     AND ('anon' = ANY(roles) OR 'public' = ANY(roles))
     AND NOT (concat_ws(' ', qual, with_check) ~ '(service_role|auth[.]uid[(][)])'
           OR (coalesce(qual, 'false')       ~ '^[[:space:]]*false[[:space:]]*\$'
          AND  coalesce(with_check, 'false') ~ '^[[:space:]]*false[[:space:]]*\$'));")
if [ -z "$UNGUARDED" ]; then
  pass "every policy anon can reach is guarded"
else
  fail "policies reachable by anon with no guard: $UNGUARDED"
  printf '  A policy TO public reaches anon too. Scope it, or deny it explicitly.\n'
fi

step "5/6 Migration drift (tracked files vs applied history)"
# The check that would have caught the original problem. Migrations merged
# through GitHub are not applied by the Lovable pipeline, so a file can sit in
# supabase/migrations for days while the code depending on it is live. Two did.
#
# Matching is on real timestamps with a tolerance, NOT string equality. The
# filename and the recorded version routinely differ by a second or two, and
# comparing them as text — or as integers — reports false drift: 20260307175459
# and 20260307175500 are one second apart, but 41 apart numerically.
VERSIONS=$(ls supabase/migrations/*.sql 2>/dev/null \
           | sed 's|.*/||; s|_.*||' \
           | grep -E '^[0-9]{14}$' \
           | sort -u \
           | awk '{printf "%s\047%s\047", (NR>1 ? "," : ""), $0}')

if [ -z "$VERSIONS" ]; then
  fail "no migration files found — is this being run from the repository root?"
else
  UNAPPLIED=$(psql_q "
    SELECT COALESCE(string_agg(v, ', ' ORDER BY v), '')
      FROM unnest(ARRAY[$VERSIONS]) AS v
     WHERE NOT EXISTS (
       SELECT 1 FROM supabase_migrations.schema_migrations m
        WHERE abs(EXTRACT(EPOCH FROM (
                to_timestamp(m.version, 'YYYYMMDDHH24MISS')
              - to_timestamp(v,         'YYYYMMDDHH24MISS')))) <= 10
     );")
  if [ -z "$UNAPPLIED" ]; then
    pass "every tracked migration is present in the history table"
  else
    fail "merged but never applied: $UNAPPLIED"
    printf '  Apply them with the Apply-migrations workflow, or by hand from the SQL editor.\n'
  fi
fi

step "6/6 Schema invariants"
# These three used to live only in docs/sql/2026-08-23-health-check.sql, a file
# the owner had to paste into the Supabase SQL editor by hand and send the
# results back. That was the wrong shape: it costs a round-trip every time, the
# answer is stale the moment anything merges, and it can draw down the Lovable
# workspace quota — which meters usage and then asks for payment.
#
# Running them here costs nothing extra: this job already holds a connection,
# talks to Supabase directly, and never touches Lovable.

# 6a. The attachment explainer must not disclose whether a path exists.
#     An unprivileged caller gets a uniform `not_authorized` on every deny.
DISCLOSURE=$(psql_q "SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'explain_attachment_access')
      THEN 'missing'
    WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'explain_attachment_access'
                   AND prosrc LIKE '%not_authorized%')
      THEN 'ok'
    ELSE 'unapplied'
  END;")
case "$DISCLOSURE" in
  ok)        pass "attachment explainer deny path discloses nothing" ;;
  missing)   fail "explain_attachment_access does not exist" ;;
  unapplied) fail "attachment disclosure fix NOT applied — 20260815004500 is merged but not live" ;;
  *)         fail "could not determine the disclosure state (got: '$DISCLOSURE')" ;;
esac

# 6b. Both currency columns must carry the ISO 4217 CHECK constraint.
ISO_N=$(psql_q "SELECT count(*) FROM pg_constraint WHERE conname LIKE '%currency_iso4217%';")
if [ "$ISO_N" = "2" ]; then
  pass "ISO 4217 constraints present on both tables"
else
  fail "expected 2 ISO 4217 constraints, found ${ISO_N:-none} — 20260815010000 may not be applied"
fi

# 6c. No legacy currency symbols may survive. The constraint should make this
#     impossible, so a hit here means the constraint is missing or was added
#     NOT VALID over rows that never got normalised.
BAD_CCY=$(psql_q "SELECT COALESCE(string_agg(DISTINCT currency, ', '), '')
                    FROM public.projects
                   WHERE currency IS NOT NULL AND currency !~ '^[A-Z]{3}$';")
if [ -z "$BAD_CCY" ]; then
  pass "every project currency is a 3-letter ISO code"
else
  fail "non-ISO currency values still stored: $BAD_CCY"
fi

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
