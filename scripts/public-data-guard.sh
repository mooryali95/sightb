#!/usr/bin/env bash
# The repository is public: no real personal or business data goes in it.
# Fails on an e-mail address outside the test and system domains, and on a
# one-off data script (INSERT/UPDATE/DELETE of business rows) under docs/sql.
# Applied migrations are left out: they must stay byte for byte (CLAUDE.md
# rule 4). See SECURITY.md.
set -u
cd "$(dirname "$0")/.."
fail=0
ALLOWED='example\.(com|org|net|test)|\.test\b|@(x|y|z|a|b|c)\.(com|c)\b|noreply@anthropic\.com|users\.noreply\.github\.com|resend\.dev|basserh\.com|@lovable\.dev|@supabase\.(io|com)'
emails=$(git grep -nIE "[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}" -- . ':!supabase/migrations' ':!*.lock' ':!package-lock.json' ':!scripts/public-data-guard.sh' \
  | grep -vE "$ALLOWED" | grep -E "[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}" || true)
if [ -n "$emails" ]; then echo "$emails" | sed 's/^/  real e-mail address? /'; fail=1; fi
data=$(git grep -lIiE "^\s*(insert into|update|delete from)\s+(public\.)?(expenses|revenues|project_funds|custodies|cash_transfers|company_expenses|intercompany_entries|parties|resources|fund_settlements)\b" -- 'docs/sql/*' || true)
if [ -n "$data" ]; then echo "$data" | sed 's/^/  business-data script in a public repository: /'; fail=1; fi
[ "$fail" = 0 ] && echo "No personal or business data found outside the applied migrations."
exit "$fail"
