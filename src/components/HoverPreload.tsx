import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { pageForPath, preloadMainPagesWhenIdle, preloadPage } from '@/lib/route-preload';

/**
 * Fetches page code before it is needed: the main pages once the browser is
 * idle after sign-in, and any page whose link the pointer rests on or a
 * finger touches (links, or elements carrying data-preload-path).
 */
export function HoverPreload() {
  const { user } = useAuth();

  useEffect(() => {
    if (user) preloadMainPagesWhenIdle();
  }, [user]);

  useEffect(() => {
    const onIntent = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.('a[href], [data-preload-path]');
      if (!el) return;
      const path = el.getAttribute('data-preload-path') ?? el.getAttribute('href') ?? '';
      if (!path.startsWith('/')) return;
      const page = pageForPath(path);
      if (page) preloadPage(page);
    };
    document.addEventListener('pointerover', onIntent, { passive: true });
    document.addEventListener('touchstart', onIntent, { passive: true });
    return () => {
      document.removeEventListener('pointerover', onIntent);
      document.removeEventListener('touchstart', onIntent);
    };
  }, []);

  return null;
}
