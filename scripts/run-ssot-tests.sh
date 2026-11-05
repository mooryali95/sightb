#!/usr/bin/env bash
# ============================================================================
# SSOT test runner — seeds fixtures then runs pgTAP + Vitest.
#
# Requires:
#   SUPABASE_DB_URL   full postgres URI (with password)
#   SSOT_OWNER_UID    uuid of an auth.users row that owns the fixtures
#
# Local:
#   export SUPABASE_DB_URL='postgresql://...'
#   export SSOT_OWNER_UID='00000000-0000-0000-0000-000000000000'
#   bash scripts/run-ssot-tests.sh
# ============================================================================
set -euo pipefail

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is required}"
: "${SSOT_OWNER_UID:?SSOT_OWNER_UID is required (existing auth.users id)}"

echo "▶ Seeding SSOT fixtures…"
psql "$SUPABASE_DB_URL" \
  -v ON_ERROR_STOP=1 \
  -v owner_uid="'$SSOT_OWNER_UID'" \
  -f supabase/tests/seed_ssot.sql

echo "▶ Running pgTAP tests…"
psql "$SUPABASE_DB_URL" \
  -v ON_ERROR_STOP=1 \
  -f supabase/tests/ssot.pgtap.sql

echo "▶ Running security regression tests (ownership triggers + attachment access)…"
psql "$SUPABASE_DB_URL" \
  -v ON_ERROR_STOP=1 \
  -f supabase/tests/security.pgtap.sql

echo "▶ Running role-write tests (who may grant or change a role)…"
psql "$SUPABASE_DB_URL" \
  -v ON_ERROR_STOP=1 \
  -f supabase/tests/roles.sql

echo "▶ Running fund-advance test (an advance settled from its fund is counted once)…"
psql "$SUPABASE_DB_URL" \
  -v ON_ERROR_STOP=1 \
  -f supabase/tests/fund-advance.sql

echo "▶ Running tenant-isolation test (access follows the current role; only an owner makes owners)…"
psql "$SUPABASE_DB_URL" \
  -v ON_ERROR_STOP=1 \
  -f supabase/tests/tenant-isolation.sql

echo "▶ Running Vitest suite (finance / funds / budget-comparison / advance-settlement)…"
bunx vitest run

echo "✔ SSOT tests passed."
