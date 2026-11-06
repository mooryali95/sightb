import { ReactNode, Suspense, startTransition, useEffect, useRef, useState } from 'react';

/**
 * Renders its children once they come near the screen, or once the browser
 * is idle, whichever is first; until then it holds their space.
 *
 * For heavy sections below the fold (the charts), so the first screen is
 * answered before their library is fetched, evaluated and laid out. The idle
 * fallback means nothing waits on a scroll that never comes: a page left open
 * fills in by itself, and so does a screen reader's virtual cursor.
 */
export function DeferUntilVisible({ minHeight, children, rootMargin = '300px' }: { minHeight: number; children: ReactNode; rootMargin?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (show) return;
    // A transition, so React renders the section in short slices it can
    // interrupt, not as one long task; several sections revealed in the same
    // idle moment then share the main thread with input instead of blocking it.
    const reveal = () => startTransition(() => setShow(true));
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) reveal(); }, { rootMargin });
    if (ref.current) io.observe(ref.current);
    // Safari before 18 has no requestIdleCallback.
    const ric = (window as Partial<Window>).requestIdleCallback;
    const idle = ric ? ric.call(window, reveal, { timeout: 2500 }) : window.setTimeout(reveal, 1500);
    return () => {
      io.disconnect();
      if (ric) window.cancelIdleCallback(idle); else window.clearTimeout(idle);
    };
  }, [show, rootMargin]);

  const hold = <div ref={ref} style={{ minHeight }} aria-hidden="true" />;
  return show ? <Suspense fallback={<div style={{ minHeight }} aria-hidden="true" />}>{children}</Suspense> : hold;
}
