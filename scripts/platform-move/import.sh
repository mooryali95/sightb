#!/usr/bin/env bash
# Load an export (export.sql's result, saved as a file) into the new database.
#
#   NEW_DB_URL=postgres://... bash scripts/platform-move/import.sh export.json
#
# The new database must already carry the schema (`supabase db push` from this
# repository). Its public tables are emptied and refilled from the export.
#
# One transaction, with triggers and foreign-key checks suspended
# (session_replication_role = replica): the audit triggers do not record the
# import as edits, and a cycle between tables cannot fail the load. Each table
# is counted against its export inside the transaction, so any difference
# rolls the whole import back. Exit 0 only when every table matches.
set -euo pipefail
export_file="${1:?path to export.json}"
: "${NEW_DB_URL:?set NEW_DB_URL}"
here="$(cd "$(dirname "$0")" && pwd)"

mapfile -t tables < <(psql "$NEW_DB_URL" -qAt -v ON_ERROR_STOP=1 -f "$here/order.sql")
[ "${#tables[@]}" -gt 0 ] || { echo "no public tables in the target; push the schema first" >&2; exit 2; }

python3 "$here/build_import.py" "$export_file" "${tables[@]}" | psql "$NEW_DB_URL" -q -v ON_ERROR_STOP=1
echo "Imported ${#tables[@]} tables and the sign-in records; every row count matches the export."
