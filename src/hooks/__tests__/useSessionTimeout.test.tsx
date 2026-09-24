/**
 * The idle timeout keeps counting through auth events for the same person.
 *
 * Every auth event (a token refresh, a session re-check when the tab regains
 * focus) hands over a new user object for the same person. When the timers
 * were keyed on that object, each event restarted the 30-second check, and
 * events arriving more often than that starved it: the warning never came.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const auth = { user: { id: 'me', email: 'pm@example.com' } as { id: string; email: string } | null };
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: auth.user }) }));
vi.mock('@/services/db', () => ({ db: { signOut: vi.fn(async () => {}) } }));

import { useSessionTimeout } from '../useSessionTimeout';

const MINUTE = 60_000;

beforeEach(() => {
  vi.useFakeTimers();
  auth.user = { id: 'me', email: 'pm@example.com' };
});
afterEach(() => vi.useRealTimers());

describe('useSessionTimeout', () => {
  it('warns after twenty-eight idle minutes even while auth events keep arriving', () => {
    const { result, rerender } = renderHook(() => useSessionTimeout());
    // Twenty-eight and a half minutes, with a fresh user object for the same
    // person every twenty seconds, more often than the check runs.
    for (let t = 0; t < 28.5 * MINUTE; t += 20_000) {
      act(() => { vi.advanceTimersByTime(20_000); });
      auth.user = { id: 'me', email: 'pm@example.com' };
      rerender();
    }
    expect(result.current.showWarning).toBe(true);
    expect(result.current.remainingSeconds).toBeGreaterThan(0);
    expect(result.current.remainingSeconds).toBeLessThanOrEqual(120);
  });

  it('stays quiet for a signed-out visitor', () => {
    auth.user = null;
    const { result } = renderHook(() => useSessionTimeout());
    act(() => { vi.advanceTimersByTime(29 * MINUTE); });
    expect(result.current.showWarning).toBe(false);
  });
});
