import { useEffect } from 'react';

const CANDIDATES = '.overflow-x-auto, .overflow-auto';
const MARK = 'data-scroll-region';

/**
 * A table wider than the screen scrolls inside its own box. Without focus a
 * keyboard user could not scroll it, and on a phone nothing said there was
 * more to see. Every such box, wherever a page puts it, becomes a named,
 * focusable region while it actually overflows and carries `data-scroll-region`,
 * which draws a soft shadow on the edge that hides content (see index.css).
 * A box that stops overflowing gives the tab stop back.
 */
export function markScrollRegions(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>(CANDIDATES).forEach((el) => {
    const overflows = el.scrollWidth > el.clientWidth + 1;
    const ours = el.hasAttribute(MARK);
    if (overflows && !ours && !el.hasAttribute('tabindex')) {
      el.setAttribute(MARK, '');
      el.tabIndex = 0;
      if (!el.getAttribute('role')) el.setAttribute('role', 'region');
      if (!el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby')) {
        const heading = el.closest('section, [class*="card"], [class*="rounded"]')?.querySelector('h1, h2, h3, h4');
        const name = heading?.textContent?.trim();
        el.setAttribute('aria-label', name ? `${name}، قابل للتمرير` : 'جدول قابل للتمرير');
      }
    } else if (!overflows && ours) {
      el.removeAttribute(MARK);
      el.removeAttribute('tabindex');
      if (el.getAttribute('role') === 'region') el.removeAttribute('role');
      el.removeAttribute('aria-label');
    }
  });
}

export function useScrollRegions(): void {
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => markScrollRegions(document.body));
    };
    schedule();
    const mutations = new MutationObserver(schedule);
    mutations.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      mutations.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, []);
}
