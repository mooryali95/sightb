# Handoff to Lovable — scope and protected areas

Owner's instruction (Omar): Lovable works only within the scope below and
**never modifies, reverts or deletes work done through GitHub pull requests**.
Between 11 and 14 October 2026, Lovable commits deleted merged, tested work
(`src/lib/resource-spend.ts`, the budget-overrun card, their tests) and
turned `main` red with 21 failing end-to-end tests. This file exists so that
does not happen again.

## 1. What Lovable may do

- Visual polish requested by the owner: spacing, colours, icons, layout,
  responsive fixes, Arabic copy and labels **that are not asserted by a test**.
- New pages or components the owner explicitly asks for, in new files.
- Publishing the project.
- Applying migrations **it authors itself** for features the owner asks for.

## 2. What Lovable must never do

1. **Never delete, rename or rewrite a test.** Not `e2e/**`, not any
   `__tests__/**`, not `*.test.ts(x)`. If a change makes a test fail, the
   change is wrong — stop and leave it for the owner.
2. **Never delete or rename a migration** in `supabase/migrations/`. An
   applied migration must stay in the repository forever.
3. **Never edit these files** — they are maintained through GitHub and
   covered by tests:
   - `src/lib/resource-spend.ts` — spend per resource (link → vendor → name
     in the description; never by المسؤول).
   - `src/components/project/ExpensesSection.tsx` — the «ملخص الصرف حسب
     المورد» card and the expense search.
   - `src/components/project/stats/BudgetRow.tsx` — over budget shows
     «تجاوز الموازنة» as a positive amount with its percentage, never a
     negative "remaining".
   - `src/pages/Login.tsx`, `src/pages/login/**`,
     `src/components/ProtectedRoute.tsx` — sign-in and the code step
     (`/login/code`), including the guard that stops the code being
     announced twice.
   - `src/lib/query-cache.ts`, `src/hooks/useAppData.ts` — the persisted
     cache; loaders must keep `meta.noPersist`.
   - `src/lib/finance/**`, `src/services/**` — financial figures and data
     access.
   - The company ledger and project moves: `src/lib/finance/company-ledger.ts`,
     `src/services/companyLedgerService.ts`, `src/pages/company/ledger/**`,
     `src/components/project/ledger/**`, `src/lib/project-placement.ts`,
     `src/pages/Organize.tsx`, and migration `20261016120000_company_ledger.sql`.
   - The dashboard's figures and filters: `src/pages/dashboard/**`,
     `src/hooks/useDashboardFilters.ts`. `src/pages/FinancialOverview.tsx` may
     be restyled, but its counts must keep using `needsAttention`.
   - The second factor on the server: `supabase/functions/_shared/sessionGate.ts`
     and its test `src/test/edge/session-gate.test.ts`, and migrations
     `20260924150000_second_factor_on_the_server.sql` and
     `20260926120000_second_factor_on_database_functions.sql`. In
     `send-invite`, `delete-user` and `admin-email-status` the call to
     `requireSecondFactor` stays where it is, right after the user is read
     from the token: a password-only session must not act through the service
     role. Any new SECURITY DEFINER function a user may call starts with
     `public.require_second_factor()`. `scripts/second-factor-coverage.sh`
     fails the build when either is missing.
   - The company's resource registry: `src/lib/registry/**`,
     `src/services/registryService.ts`, `src/pages/company/registry/**`,
     `src/pages/PartyDetail.tsx` and migration `20261027090000_resource_registry.sql`.
     The vendor on an expense and the name of a project resource are picked
     with `src/components/registry/RegistryNamePicker.tsx`; keep it there.
   - Loans through the company: `src/lib/finance/loans.ts` and
     `src/pages/company/ledger/LoanDialog.tsx`. A loan is lender → company,
     funding is company → project; never record a loan straight to a project.
   - The money loop (migration `20261028090000_close_the_money_loop.sql`):
     cash left at a settlement is carried to the next fund, never dropped;
     a project's repayment names the fund it left (`source_fund_id`) and is
     never booked as an expense; company funding links its fund
     (`ledger_entry_id`). Company overhead is recorded only as a company
     expense; the indirect-cost form is gone on purpose.
   - Data integrity (`src/lib/finance/integrity.ts`, «سلامة البيانات» on the
     company page): every amount has a source, nothing twice, every custody
     and fund balances, every gap has its reason. An expense beyond its
     source books the source's part and owes the rest to whoever paid it.
   - Role writes (`20261104090000_user_roles_policy_without_recursion.sql`,
     `supabase/tests/roles.sql`): a policy on `user_roles` must never query
     `user_roles` itself (42P17); ask `has_role()` instead. Its WITH CHECK
     must require an admin on its own, since INSERT applies only WITH CHECK.
     A name on an expense is linked to a registry entry, never retyped.
   - Access follows the current role (`20261105120000`): never add an
     `auth.uid() = user_id OR …` branch to a data policy, never let an admin
     write or change an owner row or invite, and leave
     `second_factor_settings.enforce` on. The AI functions go through
     `_shared/workingRole.ts`. Calendar dates come from `todayLocal()`, never
     `toISOString()` (`scripts/date-guard.sh`); a handler that awaits a store
     action goes through `runOrToast`.
   - «الكشف المالي الموحّد» (`src/lib/finance/unified-statement.ts`,
     `src/lib/export/unified-statement.ts`, the «الكشف الموحّد» button on the
     company page): the owner's monthly statement, built from the same money
     rules as the screens. Do not compute its figures any other way.
   - Accessibility and Arabic layout, held by `e2e/accessibility.spec.ts`
     (axe on 13 pages, phone and desktop, light and dark): `src/lib/a11y/**`,
     `src/components/charts/labelled-sector.tsx`, the label linking in
     `ui/input.tsx` and `ui/select.tsx`, the Arabic date reading in
     `ui/input.tsx`, the icon button name in `ui/button.tsx`, and in
     `App.tsx` the `DirectionProvider`, `MotionConfig reducedMotion="user"`
     and `useScrollRegions`. Write logical classes (`ms-`, `me-`, `ps-`,
     `pe-`, `start-`, `end-`, `text-start`), never `ml-`/`mr-`/`left-`/
     `right-`; give every icon button an `aria-label` or `title`; never
     put `letter-spacing` on Arabic text.
   - Mobile responsiveness: `src/hooks/use-mobile.tsx` reads the viewport
     with `useSyncExternalStore`, so a phone renders the phone layout from
     the first frame; do not restore the stock hook that starts at false.
     The dashboard's charts load through `DeferUntilVisible`
     (`src/components/ui/defer-until-visible.tsx`); keep them lazy.
   - The error log: `src/lib/error-reporting.ts`, `src/services/errorReportService.ts`,
     `src/pages/ErrorLog.tsx` (`/errors`, owner only), the `addSink` in
     `src/lib/logger.ts`, the `installErrorReporting()` call in `src/main.tsx`,
     and migration `20261106090000_client_errors.sql`. Nobody writes
     `client_errors` directly; everything goes through `report_client_error`.
   - `supabase/functions/admin-otp/index.ts` is retired and answers 410. Do not
     restore it and do not call it: the second factor goes through
     `second-factor` only, which records the session the database requires.
   - The morning digest: `supabase/functions/daily-digest/`,
     `supabase/functions/_shared/digest.ts`, its `verify_jwt = false` entry in
     `supabase/config.toml` (it checks its own token), and migration
     `20261106100000_daily_digest.sql` with the `daily-digest` cron job. The
     recipients come from `auth.users`, never `profiles.email`.
   - `.github/**`, `scripts/**`, `CLAUDE.md`, `docs/**`, `AGENTS.md`,
     `eslint.config.js`, `playwright.config.ts`, `vitest.config.ts`.
4. **Never point `bun.lock` at a private registry** (`*.pkg.dev`). Packages
   resolve from `registry.npmjs.org` only.
5. **Never revert a commit** whose message is not "Changes" (i.e. one that
   came through a GitHub pull request), and never restore a file a pull
   request deleted (for example `e2e/ssot-banner.spec.ts`).
6. Never reach the database from a component or page directly — only
   through `src/services`.

## 3. If the owner asks for something touching a protected file

Do not edit it. Reply that the file is protected by this handoff and that
the change goes through a GitHub pull request instead.

## 4. How to tell

`main` must stay green on the Quality workflow (unit tests, typecheck,
lint budget, build, end-to-end). A Lovable push that turns it red is
reverted.
