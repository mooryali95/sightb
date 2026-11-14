#!/usr/bin/env bash
# A function with verify_jwt = false is reachable by anyone on the internet.
# Each must then check its caller itself (the user's session, a shared secret,
# a webhook signature) and refuse with 401, or be retired and answer 410.
# A new one added without that check fails here, naming it.
set -u
cd "$(dirname "$0")/.."
fail=0
for fn in $(awk '/^\s*\[functions\./{gsub(/.*\[functions\.|\].*/,"");n=$0} /verify_jwt *= *false/{print n}' supabase/config.toml); do
  f="supabase/functions/$fn/index.ts"
  if [ ! -f "$f" ]; then echo "  $fn: verify_jwt = false but $f is missing"; fail=1; continue; fi
  if grep -qE "status: 410" "$f"; then continue; fi                       # retired
  if grep -qE "getUser\(|getClaims\(" "$f" && grep -qE "40[13]" "$f"; then continue; fi  # the caller's session
  if grep -qE "status: 401|json\(401" "$f"; then continue; fi             # a secret or signature, refused with 401
  echo "  $fn: verify_jwt = false and no check of the caller (no getUser/401/410)"; fail=1
done
[ $fail -eq 0 ] || { echo "function-auth-guard: every function open to anonymous calls must authenticate its caller."; exit 1; }
echo "Every function open without a JWT checks its caller."
