# Security

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's
**Report a vulnerability** button (Security tab → Advisories) so the report
stays private until it is fixed.

## What is public on purpose

- `.env` holds the Supabase project URL and its **publishable (anon) key**.
  Both ship to every browser that opens the app; the key carries the `anon`
  role only. What a visitor can read or write is decided by row-level
  security on every table, not by keeping this key secret.
- The database schema is in `supabase/migrations`. Every table has row-level
  security, every SECURITY DEFINER function a user may call starts with
  `public.require_second_factor()`, and `scripts/second-factor-coverage.sh`
  fails the build when a new table or function is missing either.

## What is never committed

- Service-role keys, database URLs, access tokens and API keys. They live in
  the hosting platform's secrets and in GitHub Actions secrets, which GitHub
  never hands to a pull request from a fork.
- Real business data: names of people paid, client or project records,
  amounts, or one-off data scripts. Tests and examples use invented names.
  `scripts/public-data-guard.sh`, a Quality step, fails the build on a real
  e-mail address or a data script under `docs/sql`.
