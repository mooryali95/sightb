#!/usr/bin/env bash
# A date the person sees or stores is Riyadh's date (todayLocal in
# src/lib/utils.ts), never the UTC date toISOString() gives: between midnight
# and 03:00 that is yesterday, and on the 1st it is last month. Found 5 Nov
# in 30 places. Timestamps (full toISOString()) are fine; only the date cut is
# refused.
set -u
cd "$(dirname "$0")/.."
hits=$(grep -rnE "toISOString\(\)\.(split\('T'\)\[0\]|slice\(0, ?10\)|substring\(0, ?10\))" src --include='*.ts' --include='*.tsx' | grep -v '/__tests__/' || true)
if [ -n "$hits" ]; then
  echo "$hits" | sed 's/^/  UTC date cut: /'
  echo "date-guard: use todayLocal() from @/lib/utils for a calendar date."
  exit 1
fi
echo "Every calendar date is Riyadh's."
