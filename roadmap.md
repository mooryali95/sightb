# Roadmap

## Done
- [x] 2026-11-13 — Motion and polish layer: tiles rise in one after another, tap feedback on buttons, shimmering loading placeholders, animated tabs and side-menu marker, fading phone menu overlay, top-bar shadow on scroll, gold line on page change, soft page backdrop, branded loading screen. All honour reduced motion. Signed-in pages not yet seen in the browser.
- [x] Login HTTP-200 error responses and incomplete checks no longer count as successful verification. Browser confirmed the injected session's missing session identifier returns to login once, rather than repeatedly opening dashboard/code. Regression tests cover the refusal.
- [x] 2026-10-07 — Revenue status (and every edit) did nothing. Root cause: the update policies on 14 tables (companies, portfolios, projects, budget_items, expenses, revenues, cost_baselines, resources, custodies, milestones, change_orders, risks, indirect_costs, periodic_snapshots) had a WITH CHECK that selected from its own table, which Postgres rejects with `42P17 infinite recursion detected in policy`. The published site swallowed the error, so the click looked like nothing happened. Fix: migration resets each WITH CHECK to the policy's USING scope. Owner immutability is still enforced by `trg_immutable_owner`. Verified as the owner via the REST API: revenue, expense, project and milestone updates now succeed, and anonymous updates still return no rows.
- [x] Revenue form shows the server's refusal reason (commit b6209667). Built, but not yet on the published site.
- [x] 2026-10-10 — Login code moved to `/login/code` with session-restoration loading, resend, passkey, and «الدخول بحساب آخر»; stale sessions return cleanly to login.
- [x] 2026-10-10 — SSOT/server comparison, orphan-transfer repair, and spend-consistency diagnostics moved out of project finance into an owner-only Control Center.
- [x] 2026-10-10 — Financial labels standardized; project page now separates budget availability from manager cash, dashboard prioritizes liquidity/profitability, and company project contracts use effective values.

## Open
- [ ] 2026-11-01 — Confirmed QA finding `80df4e61-da79-5b5a-9888-63cdf427f69a`: company IntegrityCard can calculate without loading cash transfers. Approved handoff plan: `.lovable/plan/تصحيح-تنبيهات-سلامة-البيانات-على-صفحة-الشركة-2026-11-01.md`. Blocker: the card is protected under LOVABLE_HANDOFF and belongs to GitHub PR #150; Claude / the GitHub team must implement and verify the fix. Finding remains unresolved; no protected code changed.
- [ ] Publish the latest frontend so the error messages and the saved cache reach sight.basserh.com. Waits on: the owner publishing.
- [ ] `user_roles` "Admins can manage all roles" also reads its own table inside its policy. Check whether role edits hit the same recursion before changing it. Waits on: a safe test (role changes are sensitive).
- [ ] Second-factor enforcement stays off until the owner decides.
- [ ] Authenticated screenshot review of dashboard, project, portfolio, company, revenue update, advance settlement, and passkey registration. Blocker: injected review session is rejected by second-factor with “تعذّر التعرّف على الجلسة”; no verified session identifier. No bypass performed.
- [x] 2026-11-02 — Finance screen: CSV export of the shown tab (same filter/order) and budget-vs-actual bars.
- [ ] 2026-11-02 — Loading skeletons + persistent sidebar (plan item 6), and lighter mobile project header (item 7). Next Lovable task, visual only.
- [ ] 2026-11-02 — For Claude/GitHub: Integrity card fix (item 2) and `user_roles` policy check (item 4).
