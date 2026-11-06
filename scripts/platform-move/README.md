# Moving off Lovable Cloud

The tools for the move planned in `docs/platform-move.md`. Tested on
6 November 2026: a local database built from every migration was loaded from
an export of another, twice, and the fingerprints matched exactly. Removing one
expense from the export made them differ.

| File | What it does |
|---|---|
| `export.sql` | Every public table and the sign-in records (`auth.users`, `auth.identities`) as one JSON document. Read only. |
| `order.sql` | The public tables in load order, parents before children. |
| `build_import.py` | Writes the import transaction from the export. |
| `import.sh` | Loads the export into the new database in one transaction, triggers suspended, and checks every table's row count against the export before it commits. |
| `verify.sql` | A fingerprint of the data: row counts of every table, accounts, and the money totals. Identical on both sides means the move is complete. |

## Steps

### The owner

1. Create a Supabase project (Pro plan) in the chosen region.
2. In GitHub, Settings, Secrets and variables, Actions, add:
   - `SUPABASE_PROD_DB_URL`: the new project's connection string, from Project
     Settings, Database. This also switches on `migrate.yml`.
   - `SUPABASE_ACCESS_TOKEN`: from the Supabase account settings. This switches
     on `deploy-functions.yml`.
   - `SUPABASE_DB_URL`: a second, empty project for tests. This switches on the
     SSOT tests and the database checks in the security scan.
3. Set up email sending for `sight.basserh.com` (Resend or similar) and add its
   key to the new project's function secrets.

### Claude, with the owner's go-ahead for each

1. Push the schema: `supabase db push --db-url "$SUPABASE_PROD_DB_URL"`.
2. Announce a short freeze, then run `export.sql` on Lovable Cloud through its
   read access and save the result outside the repository. It holds password
   hashes.
3. `NEW_DB_URL=... bash scripts/platform-move/import.sh export.json`
4. Run `verify.sql` on both databases and compare. Continue only when the two
   are identical.
5. Deploy the functions (`deploy-functions.yml`, run by hand for all).
6. Point the app at the new project (`VITE_SUPABASE_URL`,
   `VITE_SUPABASE_PUBLISHABLE_KEY`), build, host it, and move
   `sight.basserh.com` to it.
7. Watch `/errors` for a day. Lovable Cloud stays readable for a month as the
   fallback.

## What stays on the old side

Passkeys are bound to the domain. If the app stays on `sight.basserh.com`, they
keep working; on a new domain, each person registers theirs again.
