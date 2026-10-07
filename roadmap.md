# Roadmap

## Done
- [x] 2026-10-07 — Revenue status (and every edit) did nothing. Root cause: the update policies on 14 tables (companies, portfolios, projects, budget_items, expenses, revenues, cost_baselines, resources, custodies, milestones, change_orders, risks, indirect_costs, periodic_snapshots) had a WITH CHECK that selected from its own table, which Postgres rejects with `42P17 infinite recursion detected in policy`. The published site swallowed the error, so the click looked like nothing happened. Fix: migration resets each WITH CHECK to the policy's USING scope. Owner immutability is still enforced by `trg_immutable_owner`. Verified as the owner via the REST API: revenue, expense, project and milestone updates now succeed, and anonymous updates still return no rows.
- [x] Revenue form shows the server's refusal reason (commit b6209667). Built, but not yet on the published site.

## Open
- [ ] Publish the latest frontend so the error messages and the saved cache reach sight.basserh.com. Waits on: the owner publishing.
- [ ] `user_roles` "Admins can manage all roles" also reads its own table inside its policy. Check whether role edits hit the same recursion before changing it. Waits on: a safe test (role changes are sensitive).
- [ ] Login code step: `/login?step=code` shows the password form instead of the code field. Waits on: approval to start.
- [ ] Second-factor enforcement stays off until the owner decides.
