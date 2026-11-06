"""Write the import transaction for import.sh to stdout.

    python3 build_import.py export.json <table> [<table> ...]

The tables come in load order (order.sql). Every public table in the
target is emptied first, in the same transaction: the migrations seed
single-row settings (email_send_state, second_factor_settings) whose live
values come with the export. Each table's rows go in through
json_populate_recordset, so columns match by name and a column the export
lacks takes its default. A table in the target with no rows in the export is
loaded as empty; a table in the export that the target lacks stops the import,
because its data would otherwise be lost silently.
"""
import json
import sys

TAG = "$sightb_import$"


def literal(value) -> str:
    text = json.dumps(value, ensure_ascii=False)
    if TAG in text:
        raise SystemExit("the export contains the quoting tag; change TAG")
    return f"{TAG}{text}{TAG}::json"


def main() -> None:
    path, tables = sys.argv[1], sys.argv[2:]
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    public = data.get("public") or {}
    missing = sorted(set(public) - set(tables))
    if missing:
        raise SystemExit(f"tables in the export but not in the target: {', '.join(missing)}")

    out = ["BEGIN;", "SET LOCAL session_replication_role = replica;"]
    # The migrations seed a few single-row settings tables; the export
    # carries their live values, so every public table starts empty here.
    out.append("TRUNCATE " + ", ".join(f'public."{t}"' for t in tables) + ";")
    # The exported accounts replace any rows of theirs a previous run left, so
    # the import can be run again; other accounts in the target are untouched.
    users = data.get("auth_users") or []
    out.append(
        "DELETE FROM auth.identities WHERE user_id IN (SELECT (u->>'id')::uuid FROM json_array_elements("
        + literal(users) + ") u);"
    )
    out.append("DELETE FROM auth.users WHERE id IN (SELECT (u->>'id')::uuid FROM json_array_elements(" + literal(users) + ") u);")
    for schema_table, key in (("auth.users", "auth_users"), ("auth.identities", "auth_identities")):
        rows = data.get(key) or []
        out.append(f"INSERT INTO {schema_table} SELECT * FROM json_populate_recordset(NULL::{schema_table}, {literal(rows)});")
        id_col = "id" if schema_table == "auth.users" else "user_id"
        out.append(
            f"DO $check$ BEGIN IF (SELECT count(*) FROM {schema_table} WHERE {id_col} IN "
            f"(SELECT (u->>'id')::uuid FROM json_array_elements({literal(users)}) u)) <> {len(rows)} "
            f"THEN RAISE EXCEPTION '{schema_table}: expected {len(rows)} rows'; END IF; END $check$;"
        )
    for table in tables:
        rows = public.get(table) or []
        qualified = f'public."{table}"'
        if rows:
            out.append(f"INSERT INTO {qualified} SELECT * FROM json_populate_recordset(NULL::{qualified}, {literal(rows)});")
        out.append(
            f"DO $check$ BEGIN IF (SELECT count(*) FROM {qualified}) <> {len(rows)} "
            f"THEN RAISE EXCEPTION 'table {table}: expected {len(rows)} rows'; END IF; END $check$;"
        )
    out.append("COMMIT;")
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
