import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useStore, type AppState } from '@/store/useStore';
import Settings from '../Settings';

const roleState = { isAdmin: false, isOwner: false, loading: false, roles: [] as { id: string; role: string; scopeType: string; scopeId: string | null }[] };
vi.mock('@/hooks/useRole', () => ({ useRole: () => roleState }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'me', email: 'pm@example.com' } }) }));
vi.mock('@/components/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

const tool = (name: string) => screen.queryByRole('button', { name: new RegExp(name) });

function renderPage() {
  return render(<MemoryRouter><Settings /></MemoryRouter>);
}

describe('Settings', () => {
  beforeEach(() => {
    Object.assign(roleState, { isAdmin: false, isOwner: false, loading: false, roles: [] });
    useStore.setState({ companies: [], projects: [] } satisfies Partial<AppState>);
  });

  it('shows a viewer the general settings but no admin or owner tools', () => {
    roleState.roles = [{ id: 'r', role: 'viewer', scopeType: 'system', scopeId: null }];
    renderPage();
    expect(screen.getByText('الإعدادات العامة')).toBeInTheDocument();
    expect(tool('الشاشة المالية')).toBeInTheDocument();
    expect(tool('إدارة المستخدمين')).toBeNull();
    expect(tool('مركز الرقابة')).toBeNull();
    expect(tool('السجل الرئيسي')).toBeNull();
  });

  it('shows an admin user management but not the owner’s tools', () => {
    Object.assign(roleState, { isAdmin: true, roles: [{ id: 'r', role: 'admin', scopeType: 'system', scopeId: null }] });
    renderPage();
    expect(tool('إدارة المستخدمين')).toBeInTheDocument();
    expect(tool('مركز الرقابة')).toBeNull();
    expect(tool('سجل الأعطال')).toBeNull();
  });

  it('shows the owner every tool', () => {
    Object.assign(roleState, { isAdmin: true, isOwner: true, roles: [{ id: 'r', role: 'owner', scopeType: 'system', scopeId: null }] });
    renderPage();
    expect(tool('إدارة المستخدمين')).toBeInTheDocument();
    expect(tool('مركز الرقابة')).toBeInTheDocument();
    expect(tool('السجل الرئيسي')).toBeInTheDocument();
    expect(tool('سجل الأعطال')).toBeInTheDocument();
  });

  it('offers no tool at all while the role is still being checked', () => {
    Object.assign(roleState, { isAdmin: true, isOwner: true, loading: true });
    renderPage();
    expect(tool('إدارة المستخدمين')).toBeNull();
    expect(tool('الشاشة المالية')).toBeNull();
  });
});
