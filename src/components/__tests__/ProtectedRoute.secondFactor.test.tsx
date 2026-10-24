/**
 * A session that signed in with the password but never gave the code is sent
 * to finish it, not left before pages the database will keep empty. What
 * must hold: owing the code sends the person to /login/code; a passed
 * session, a viewer, and an answer that cannot be had all stay; and the
 * server is asked once per user, not on every page.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { ProtectedRoute } from '../ProtectedRoute';
import { forgetSecondFactorPasses } from '@/hooks/useSecondFactorGate';

const status = vi.hoisted(() => vi.fn());
vi.mock('@/services/secondFactorService', () => ({ secondFactorStatus: () => status() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' }, session: null, loading: false, signOut: vi.fn() }) }));
vi.mock('@/hooks/useRole', () => ({ useRole: () => ({ roles: ['editor'], loading: false }) }));

function Where() {
  const { pathname, search } = useLocation();
  return <p data-testid="where">{pathname + search}</p>;
}
const renderAt = () => render(
  <MemoryRouter initialEntries={['/']}>
    <Routes>
      <Route path="/" element={<ProtectedRoute><p>البيت</p></ProtectedRoute>} />
      <Route path="/login" element={<Where />} />
      <Route path="/login/code" element={<Where />} />
    </Routes>
  </MemoryRouter>,
);

describe('ProtectedRoute and the second factor', () => {
  beforeEach(() => { status.mockReset(); forgetSecondFactorPasses(); });

  it('sends a session that owes its code to the code step', async () => {
    status.mockResolvedValue({ required: true, verified: false });
    renderAt();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/login/code'));
  });

  it('keeps a passed session, a viewer, and a session whose status cannot be had', async () => {
    for (const answer of [{ required: true, verified: true }, { required: false, verified: true }, null]) {
      forgetSecondFactorPasses();
      status.mockResolvedValueOnce(answer);
      const { unmount } = renderAt();
      await waitFor(() => expect(status).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 0));
      expect(screen.getByText('البيت')).toBeInTheDocument();
      expect(screen.queryByTestId('where')).not.toBeInTheDocument();
      unmount();
      status.mockClear();
    }
  });

  it('asks once per user, not on every page', async () => {
    status.mockResolvedValue({ required: true, verified: true });
    const first = renderAt();
    await waitFor(() => expect(status).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 0));
    first.unmount();
    renderAt();
    await new Promise((r) => setTimeout(r, 0));
    expect(status).toHaveBeenCalledTimes(1);
  });

  it('asks again on the next page when the answer could not be had', async () => {
    status.mockResolvedValueOnce(null).mockResolvedValueOnce({ required: true, verified: false });
    const first = renderAt();
    await waitFor(() => expect(status).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 0));
    first.unmount();
    renderAt();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/login/code'));
    expect(status).toHaveBeenCalledTimes(2);
  });
});
