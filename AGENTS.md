
- The query cache persists to IndexedDB via `src/lib/query-cache.ts`, scoped to one account and wiped on sign-out/account change, busted per build — reloads show data instantly without leaking between users.
- Lazy pages are declared once in `src/lib/route-preload.ts` and shared by `React.lazy` and the idle/hover preloader — so a preloaded chunk is the one the router renders.
