#!/usr/bin/env bash
# Prints every migration file present at <base> and gone at <head>, and exits
# 1 when there is any. A renamed file counts as deleted: its version is its
# name, and the live ledger still records the old one.
#
#   scripts/deleted-migrations.sh <base-sha> <head-sha>
#
# An applied migration must never leave the repository. The live ledger keeps
# its version, so `supabase db push` then refuses to run ("Remote migration
# versions not found in local migrations directory"), and a database rebuilt
# from the repository lacks what it created. Lovable deleted
# 20260314014847_email_infra.sql on 23 September while three functions still
# used the table it creates.
set -euo pipefail

base="${1:?usage: deleted-migrations.sh <base-sha> <head-sha>}"
head="${2:?usage: deleted-migrations.sh <base-sha> <head-sha>}"

if [[ "$base" =~ ^0+$ ]] || ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
  echo "deleted-migrations: base commit '$base' is not readable; refusing to guess" >&2
  exit 2
fi

gone="$(git diff --no-renames --diff-filter=D --name-only "$base" "$head" -- 'supabase/migrations/*.sql')"
if [ -n "$gone" ]; then
  echo "Migration files deleted between $(git rev-parse --short "$base") and $(git rev-parse --short "$head"):"
  echo "$gone"
  exit 1
fi
echo "No migration file was deleted."
