#!/usr/bin/env bash
# Every public table created after the second factor became a database rule
# must carry that rule too.
#
# 20260924150000_second_factor_on_the_server.sql puts a RESTRICTIVE policy
# named second_factor on every public table that existed then. A table a
# later migration creates (Lovable writes migrations as well) would have no
# such policy, and a password-only session could read it. This fails the
# build naming the table, rather than letting the gap arrive quietly.
#
# A later migration covers its tables either with
#   CREATE POLICY second_factor ON public.<table> AS RESTRICTIVE ...
# or by re-running the loop that adds it to every table (it contains
# "second_factor ON public.%I"), which covers every table created up to it.
#
# Exit 0 when covered, 1 naming what is not, 2 when the enforcing migration
# cannot be found (the check would otherwise pass having checked nothing).
set -euo pipefail
cd "$(dirname "$0")/.."

ENFORCING="20260924150000_second_factor_on_the_server.sql"
EXEMPT=" user_roles "   # read before the code step to route the person there

mapfile -t files < <(ls supabase/migrations/*.sql | sort)
start=-1
for i in "${!files[@]}"; do
  [ "$(basename "${files[$i]}")" = "$ENFORCING" ] && start=$i
done
if [ "$start" -lt 0 ]; then
  echo "second-factor-coverage: $ENFORCING not found; nothing checked" >&2
  exit 2
fi

missing=0
declare -A pending=()
for ((i = start + 1; i < ${#files[@]}; i++)); do
  f="${files[$i]}"
  for t in $(grep -ioE 'create table (if not exists )?public\.[a-z_]+' "$f" | awk -F. '{print tolower($NF)}'); do
    case "$EXEMPT" in *" $t "*) continue ;; esac
    pending[$t]="$(basename "$f")"
  done
  if grep -qF 'second_factor ON public.%I' "$f"; then
    pending=()
    continue
  fi
  for t in "${!pending[@]}"; do
    if grep -qiE "create policy \"?second_factor\"? on public\.\"?$t\"? " "$f"; then
      unset "pending[$t]"
    fi
  done
done

for t in "${!pending[@]}"; do
  echo "  NOT COVERED public.$t (created in ${pending[$t]})"
  missing=$((missing + 1))
done
if [ "$missing" -gt 0 ]; then
  echo "second-factor-coverage: $missing table(s) lack the second_factor policy."
  echo "Add: CREATE POLICY second_factor ON public.<table> AS RESTRICTIVE FOR ALL TO authenticated"
  echo "     USING ((SELECT public.second_factor_ok())) WITH CHECK ((SELECT public.second_factor_ok()));"
  exit 1
fi
echo "Every public table created since $ENFORCING carries the second_factor policy."
