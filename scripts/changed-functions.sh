#!/usr/bin/env bash
# Prints the edge functions a change between two commits needs deployed, one
# name per line, sorted: every function whose own folder changed, and every
# function that imports a shared file that changed. A function whose folder
# was deleted is not printed; there is nothing left to deploy.
#
#   scripts/changed-functions.sh <base-sha> <head-sha>
#
# Fails loudly when the base cannot be read, rather than printing nothing:
# an empty list would read as "nothing changed" and deploy nothing.
set -euo pipefail

base="${1:?usage: changed-functions.sh <base-sha> <head-sha>}"
head="${2:?usage: changed-functions.sh <base-sha> <head-sha>}"
root="supabase/functions"

if [[ "$base" =~ ^0+$ ]] || ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
  echo "changed-functions: base commit '$base' is not readable; refusing to guess" >&2
  exit 2
fi

changed="$(git diff --name-only "$base" "$head" -- "$root")"

{
  # A function's own folder.
  printf '%s\n' "$changed" \
    | awk -F/ -v r="$root" 'index($0, r "/") == 1 && NF >= 4 && $3 != "_shared" { print $3 }'

  # A shared file or folder, and every function that imports it.
  printf '%s\n' "$changed" \
    | awk -F/ -v r="$root" 'index($0, r "/_shared/") == 1 && NF >= 4 { print $4 }' \
    | sort -u \
    | while read -r shared; do
        [ -n "$shared" ] || continue
        grep -rlF --include='*.ts' "_shared/$shared" "$root" 2>/dev/null \
          | awk -F/ '$3 != "_shared" { print $3 }' || true
      done
} | sort -u | while read -r fn; do
  [ -n "$fn" ] && [ -d "$root/$fn" ] && echo "$fn"
done
