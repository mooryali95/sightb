# Speed up page switching and loading

## Where things stand
- Each page's code already loads separately, the first time someone opens that page.
- Data is cached for 5 minutes and kept in memory for 15. Coming back to a project inside that window doesn't fetch it again.
- What makes it feel slow:
  1. Opening a page for the first time replaces the whole screen, menu included, with a spinner while that page's code downloads.
  2. Nothing is fetched ahead of time: a page's code and data only start loading on click.
  3. A full reload or reopening the browser drops everything cached, so all data is fetched from scratch.

## What we'll change

1. **Keep the frame on screen while switching pages.** The menu and header stay put, and only the content area shows a light placeholder shaped like the page. On a quick switch, the old page stays visible until the new one is ready, so there's no white flash.
2. **Load code ahead of time.**
   - After sign-in, once the browser is idle, the code for the main pages (dashboard, project, portfolio, company) downloads quietly.
   - When the pointer rests on a link in the menu, or a finger touches one, that page's code loads before the click.
3. **Load data ahead of time.** Hovering over a project, portfolio or company link starts fetching its data, so it's often ready when the page opens.
4. **Keep the cache across reloads.** The cached data is saved in the browser and shown right away on the next visit, then refreshed in the background.
   - It's saved per account and wiped completely on sign-out and on the 30-minute session timeout.
   - It's dropped after 24 hours or whenever the app is updated.
   - Anything that changes money is never served from this saved copy. Saving an expense or a transfer still refreshes from the server, as it does today.
5. **Measure before and after.** We time the first load and four page switches (dashboard, project, portfolio, back to project) and report the numbers, so the gain is shown rather than assumed.

## What we're deliberately not doing
- No offline "install as an app" mode. It caches old versions and breaks the editor preview.
- No looser freshness rules for financial figures. The 5-minute rule and the live updates for transfers stay as they are.

## Technical details
- `App.tsx`: move `Suspense` inside a persistent layout route (`<Outlet/>`) with route-specific skeletons. Wrap navigation in `startTransition` (or `useTransition` on links) so the previous route stays mounted.
- Add `src/lib/route-preload.ts`: a map from route to `import()` factory, shared with `lazy()`. Call `preloadAll()` via `requestIdleCallback` after roles load. Call `preload(path)` on `onPointerEnter` and `onTouchStart` in sidebar and card links.
- Data prefetch: `queryClient.prefetchQuery` through the existing `src/services` functions only, which keeps the data-access guard happy. Project data goes through the existing `loadProjectData` / `ensureProjectCashData` cache check.
- Persistence: `@tanstack/react-query-persist-client` with an IndexedDB persister (`idb-keyval`). Key = `user.id` + build hash. `maxAge` 24h, `buster` = build id. `dehydrateOptions` excludes mutations and any query flagged `meta.noPersist`. `removeClient()` runs in `signOut` and in the session-timeout handler.
- Keep `scripts/initial-load-guard.sh` green: the new packages are small, and the idle preloading happens after sign-in, so the first-load budget (280 KB gzipped) shouldn't grow. Lower the budget if the first load shrinks.
- Verification: a Playwright timing script under `/tmp/browser`. Unit tests for the sign-out wipe and the build-id buster. The existing e2e session-timeout and login specs must still pass.
