import { useEffect, type RefObject } from 'react';

/**
 * A page arrives with a short fade and a 6px rise (200ms, ease out), so a
 * change of page reads as a change rather than a flash. It runs through the
 * Web Animations API on the content box, so nothing remounts and no state is
 * lost; a tab or filter change (same path) does not animate; and with reduced
 * motion requested it does not run at all.
 */
export function usePageEnter(ref: RefObject<HTMLElement>, pathname: string): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== 'function') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const animation = el.animate(
      [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
      { duration: 200, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    );
    return () => animation.cancel();
  }, [ref, pathname]);
}
