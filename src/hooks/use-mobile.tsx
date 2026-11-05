import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

// One query list for the page: React reads the snapshot on every render of
// every caller, and building a MediaQueryList each time is not free.
let mql: MediaQueryList | undefined;
const query = () => (mql ??= window.matchMedia(QUERY));

function subscribe(onChange: () => void) {
  const list = query();
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

const getSnapshot = () => query().matches;
const getServerSnapshot = () => false;

/**
 * Whether the viewport is phone width, correct from the first render.
 *
 * The stock version started at false and corrected itself in an effect, so
 * every phone first rendered the desktop layout (the full sidebar, open
 * filters) and then threw it away and rendered again: two commits and a
 * forced style pass before the first tap could be answered.
 */
export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
