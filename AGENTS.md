
- The query cache persists to IndexedDB via `src/lib/query-cache.ts`, scoped to one account and wiped on sign-out/account change, busted per build — reloads show data instantly without leaking between users.
- Lazy pages are declared once in `src/lib/route-preload.ts` and shared by `React.lazy` and the idle/hover preloader — so a preloaded chunk is the one the router renders.
- Owner-only financial diagnostics live in `/control-center`; project pages expose business figures and explanations, not server/client reconciliation or repair tools — keeps operational internals out of daily workflows.
- Actual cost uses `getCountedExpenses()` everywhere — one exclusion rule prevents dashboard, company, portfolio, and project totals from drifting.
