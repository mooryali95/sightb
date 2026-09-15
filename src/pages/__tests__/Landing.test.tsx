/**
 * Component tests for the public landing page. What must hold: it waits
 * for the auth check, sends a signed-in visitor straight to the dashboard,
 * and shows a visitor the pitch with both sign-in buttons wired to the
 * login page and the external link opening safely in a new tab.
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import Landing from '../Landing';

const auth = vi.hoisted(() => ({ user: null as { id: string } | null, loading: false }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('@/assets/basserh-logo.webp', () => ({ default: 'logo.webp' }));
// The feature cards animate into view; jsdom has no observer for that.
vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });

function Probe() {
  return <p data-testid="path">{useLocation().pathname}</p>;
}
const renderLanding = () => render(
  <MemoryRouter initialEntries={['/welcome']}>
    <Routes>
      <Route path="/welcome" element={<Landing />} />
      <Route path="/login" element={<Probe />} />
      <Route path="/" element={<Probe />} />
    </Routes>
  </MemoryRouter>,
);

describe('Landing', () => {
  it('shows only a spinner while the session is being checked', () => {
    auth.loading = true;
    renderLanding();
    expect(screen.getByText('جاري التحميل...')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /تسجيل الدخول/ })).not.toBeInTheDocument();
    auth.loading = false;
  });

  it('sends a signed-in visitor to the dashboard', () => {
    auth.user = { id: 'u1' };
    renderLanding();
    expect(screen.getByTestId('path')).toHaveTextContent('/');
    auth.user = null;
  });

  it('pitches the four features to a visitor and takes either sign-in button to the login page', () => {
    renderLanding();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('رؤية');
    expect(screen.getByRole('img', { name: 'بصيرة' })).toHaveAttribute('src', 'logo.webp');
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'إدارة المحافظ والمشاريع', 'تتبع الربحية والمصروفات', 'تحليلات ورؤى مالية', 'أمان وصلاحيات متقدمة', 'هل لديك دعوة للانضمام؟',
    ]);
    expect(screen.getByText(`© ${new Date().getFullYear()} بصيرة — جميع الحقوق محفوظة`)).toBeInTheDocument();

    const buttons = screen.getAllByRole('button', { name: /تسجيل الدخول/ });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]);
    expect(screen.getByTestId('path')).toHaveTextContent('/login');
  });

  it('opens the company site in a new tab without handing it the opener', () => {
    renderLanding();
    const link = screen.getByRole('link', { name: /زيارة موقع بصيرة/ });
    expect(link).toHaveAttribute('href', 'https://basserh.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
