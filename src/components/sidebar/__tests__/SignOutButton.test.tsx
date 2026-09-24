/**
 * Signing out ends the session, then loads the login page afresh.
 *
 * Two navigations used to follow a sign-out: the button's own to /login, and
 * ProtectedRoute's to /welcome once the session was gone. React Router 7 runs
 * both as transitions, so whichever landed last won, and "sign out" could end
 * on the landing page. A full load cannot be overtaken, and it drops the last
 * user's data held in the store. The load itself is observed through
 * reloadAt, since jsdom cannot navigate.
 */
import { describe, it, expect, vi } from 'vitest';
import { useSyncExternalStore } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { SignOutButton } from '../SidebarChrome';

const calls: string[] = [];
// A session that ends when signOut is called, the way the auth listener ends it.
const session = {
  user: { id: 'me', email: 'pm@example.com' } as { id: string; email: string } | null,
  listeners: new Set<() => void>(),
};
const signOut = vi.fn(async () => {
  calls.push('signOut');
  session.user = null;
  session.listeners.forEach((l) => l());
});
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => {
    const user = useSyncExternalStore(
      (l) => { session.listeners.add(l); return () => session.listeners.delete(l); },
      () => session.user,
    );
    return { user, session: null, loading: false, signOut };
  },
}));
vi.mock('@/hooks/useRole', () => ({ useRole: () => ({ roles: ['admin'], loading: false }) }));
const reloadAt = vi.fn((path: string) => { calls.push(`reload ${path}`); });
vi.mock('@/lib/reload-at', () => ({ reloadAt: (path: string) => reloadAt(path) }));

describe('SignOutButton', () => {
  it('ends the session first, then loads the login page afresh', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<ProtectedRoute><SignOutButton /></ProtectedRoute>} />
          <Route path="/welcome" element={<p>landing page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'تسجيل الخروج' }));

    await waitFor(() => expect(reloadAt).toHaveBeenCalledWith('/login'));
    expect(calls).toEqual(['signOut', 'reload /login']);
    expect(session.user).toBeNull();
  });
});
