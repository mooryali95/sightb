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
