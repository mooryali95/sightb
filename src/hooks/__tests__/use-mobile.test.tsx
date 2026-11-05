import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

function fakeMatchMedia(initial: boolean) {
  let matches = initial; const listeners = new Set<() => void>();
  vi.stubGlobal('matchMedia', (q: string) => ({
    get matches() { return matches; }, media: q,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  }));
  return { set(v: boolean) { matches = v; listeners.forEach((l) => l()); } };
}

afterEach(() => vi.unstubAllGlobals());
// The hook keeps one query list per page load; each test is a fresh load.
const load = async () => { vi.resetModules(); return (await import('../use-mobile')).useIsMobile; };

describe('useIsMobile', () => {
  it('is true on the very first render on a phone, with no desktop pass', async () => {
    fakeMatchMedia(true);
    const useIsMobile = await load();
    const seen: boolean[] = [];
    renderHook(() => { const m = useIsMobile(); seen.push(m); return m; });
    expect(seen[0]).toBe(true);
    expect(seen).not.toContain(false);
  });

  it('follows the viewport when it crosses the breakpoint', async () => {
    const mq = fakeMatchMedia(false);
    const useIsMobile = await load();
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    act(() => mq.set(true));
    expect(result.current).toBe(true);
  });
});
