#!/usr/bin/env bash
# A function with verify_jwt = false is reachable by anyone on the internet.
# Each must then check its caller itself (the user's session, a shared secret,
# a webhook signature) and refuse with 401 or 403, or be retired and answer 410.
# A new one added without that fails here, naming it.
#
# This is a presence check on the code, not proof the check is right: it
# reads the file without its comments and wants a refusal status written as
# a status, and for "retired" a file that opens no database client at all.
set -u
cd "$(dirname "$0")/.."
fail=0
code() { sed -E 's@^[[:space:]]*(//|\*|/\*).*$@@; s@[[:space:]]//[^"'"'"'`]*$@@' "$1"; }
refuses='(status:[[:space:]]*40[13]\b|json\(40[13]\b|Response\([^)]*,[[:space:]]*\{[[:space:]]*status:[[:space:]]*40[13]\b)'
for fn in $(awk '/^\s*\[functions\./{gsub(/.*\[functions\.|\].*/,"");n=$0} /verify_jwt *= *false/{print n}' supabase/config.toml); do
  f="supabase/functions/$fn/index.ts"
  if [ ! -f "$f" ]; then echo "  $fn: verify_jwt = false but $f is missing"; fail=1; continue; fi
  src=$(code "$f")
  # Retired: answers 410 and touches no data.
  if grep -qE 'status:[[:space:]]*410\b' <<<"$src" && ! grep -qE 'createClient\(' <<<"$src"; then continue; fi
  # Live: writes a refusal status.
  if grep -qE "$refuses" <<<"$src"; then continue; fi
  echo "  $fn: verify_jwt = false and no refusal of an unknown caller (no 401/403 status; not a retired 410)"; fail=1
done
[ $fail -eq 0 ] || { echo "function-auth-guard: every function open to anonymous calls must authenticate its caller."; exit 1; }
echo "Every function open without a JWT refuses an unknown caller or is retired."
