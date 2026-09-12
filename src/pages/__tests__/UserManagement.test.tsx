/**
 * Component tests for the user-management page, written before it is split.
 *
 * This is the page that hands out access. What must hold: nobody but an
 * admin sees it; an invite carries the scope the admin picked and never an
 * empty one; a user cannot delete their own account; only an owner can
 * delete an owner; an owner role cannot be removed from the page and an
 * admin cannot strip their own admin role; an accepted invite cannot be
 * resent or deleted.
 *
 * The user service is mocked whole: the page must not reach the network,
 * and what it sends to the service is the thing under test.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { toast } from 'sonner';
import * as userService from '@/services/userService';
import { useStore, type AppState } from '@/store/useStore';
import UserManagement from '../UserManagement';

const roleState = { isAdmin: true, isOwner: false, loading: false };

vi.mock('@/hooks/useRole', () => ({
  useRole: () => ({
    roles: [], isAdmin: roleState.isAdmin, isOwner: roleState.isOwner, isScopedAdmin: roleState.isAdmin,
    isAdminFor: () => roleState.isAdmin, canEdit: () => true, hasAccess: () => true, loading: roleState.loading,
  }),
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'me' }, session: null, loading: false, signOut: vi.fn() }),
}));
vi.mock('@/components/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/security/PermissionMatrixInspector', () => ({ PermissionMatrixInspector: () => null }));
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));
vi.mock('@/services/userService', () => ({
  listProfiles: vi.fn(),
  listRoles: vi.fn(),
  listInvites: vi.fn(),
  fetchInviteEmailStatus: vi.fn(),
  sendInvite: vi.fn(),
  deleteInvite: vi.fn(),
  deleteRole: vi.fn(),
  deleteUser: vi.fn(),
}));

const svc = vi.mocked(userService);

const profiles: userService.ProfileRow[] = [
  { id: 'me', email: 'me@example.com', fullName: 'أنا', status: 'active' },
  { id: 'owner-1', email: 'owner@example.com', fullName: 'المالك', status: 'active' },
  { id: 'editor-1', email: 'editor@example.com', fullName: 'محرّر', status: 'active' },
];
const roles: userService.RoleRow[] = [
  { id: 'role-me-admin', userId: 'me', role: 'admin', scopeType: 'system', scopeId: null },
  { id: 'role-owner', userId: 'owner-1', role: 'owner', scopeType: 'system', scopeId: null },
  { id: 'role-editor', userId: 'editor-1', role: 'editor', scopeType: 'company', scopeId: 'co-1' },
];
const invites: userService.InviteRow[] = [
  { id: 'inv-sent', email: 'new@example.com', role: 'viewer', scopeType: 'system', scopeId: null, status: 'sent', createdAt: '2026-09-01T00:00:00Z' },
  { id: 'inv-failed', email: 'bounce@example.com', role: 'editor', scopeType: 'company', scopeId: 'co-1', status: 'failed', createdAt: '2026-09-02T00:00:00Z' },
  { id: 'inv-accepted', email: 'editor@example.com', role: 'editor', scopeType: 'company', scopeId: 'co-1', status: 'accepted', createdAt: '2026-08-20T00:00:00Z' },
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/users']}>
      <Routes>
        <Route path="/users" element={<UserManagement />} />
        <Route path="/" element={<p>الصفحة الرئيسية</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** The card for a listed user, by email, inside the users block: the invites log names the same emails. */
function userCard(email: string): HTMLElement {
  const block = screen.getByText(/المستخدمون الحاليون/).closest('div.stat-card') as HTMLElement;
  const card = within(block).getByText(email).closest('div.rounded-lg');
  if (!card) throw new Error(`no card for ${email}`);
  return card as HTMLElement;
}

/** The row for an invite, by its id-less position under an email group. */
function inviteRow(email: string): HTMLElement {
  const group = screen.getByText(email, { selector: 'span.text-sm.font-medium' }).closest('div.rounded-lg') as HTMLElement;
  return group;
}

beforeEach(() => {
  roleState.isAdmin = true; roleState.isOwner = false; roleState.loading = false;
  vi.mocked(toast.error).mockClear();
  Object.values(svc).forEach((fn) => vi.isMockFunction(fn) && fn.mockReset());
  svc.listProfiles.mockResolvedValue(profiles);
  svc.listRoles.mockResolvedValue(roles);
  svc.listInvites.mockResolvedValue(invites);
  svc.fetchInviteEmailStatus.mockResolvedValue([
    { inviteId: 'inv-failed', email: 'bounce@example.com', status: 'failed', errorMessage: 'mailbox full', createdAt: '2026-09-02T00:00:00Z' },
  ]);
  svc.sendInvite.mockResolvedValue({ emailSent: true });
  svc.deleteInvite.mockResolvedValue(undefined);
  svc.deleteRole.mockResolvedValue(undefined);
  svc.deleteUser.mockResolvedValue(undefined);
  useStore.setState({
    companies: [{ id: 'co-1', name: 'شركة الاختبار', createdAt: '' }],
    projects: [],
  } as unknown as Partial<AppState>);
});

describe('who may see the page', () => {
  it('sends a non-admin back to the home page', async () => {
    roleState.isAdmin = false;
    renderPage();
    expect(await screen.findByText('الصفحة الرئيسية')).toBeInTheDocument();
    expect(svc.listProfiles).not.toHaveBeenCalled();
  });

  it('lists users with their roles for an admin', async () => {
    renderPage();
    await screen.findByText(/المستخدمون الحاليون \(3\)/);
    await waitFor(() => expect(userCard('owner@example.com')).toBeInTheDocument());
    expect(within(userCard('owner@example.com')).getByText('مالك')).toBeInTheDocument();
    const editorRole = within(userCard('editor@example.com')).getByText('محرر').closest('div.rounded-md') as HTMLElement;
    expect(editorRole).toHaveTextContent(/محرر\s*— شركة الاختبار/);
  });
});

describe('sending an invite', () => {
  it('sends the email lowercased with a system-wide scope', async () => {
    renderPage();
    await screen.findByText(/المستخدمون الحاليون \(3\)/);
    await waitFor(() => expect(svc.listRoles).toHaveBeenCalled());
    await waitFor(() => userCard('owner@example.com'));

    fireEvent.change(screen.getByPlaceholderText('user@example.com'), { target: { value: 'New.Person@Example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /إرسال الدعوة/ }));

    await waitFor(() => expect(svc.sendInvite).toHaveBeenCalledTimes(1));
    expect(svc.sendInvite).toHaveBeenCalledWith({ email: 'new.person@example.com', role: 'viewer', scopeType: 'system', scopeId: null });
  });

  it('refuses a scoped invite with no scope chosen', async () => {
    renderPage();
    await screen.findByText(/المستخدمون الحاليون \(3\)/);
    await waitFor(() => expect(svc.listRoles).toHaveBeenCalled());
    await waitFor(() => userCard('owner@example.com'));

    fireEvent.change(screen.getByPlaceholderText('user@example.com'), { target: { value: 'x@example.com' } });
    const scope = screen.getByText('النظام بالكامل', { selector: 'span' }).closest('button') as HTMLElement;
    fireEvent.keyDown(scope, { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('option', { name: 'شركة محددة' }), { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: /إرسال الدعوة/ }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('يرجى اختيار النطاق'));
    expect(svc.sendInvite).not.toHaveBeenCalled();
  });
});

describe('the invites log', () => {
  it('counts invites by status and shows why a delivery failed', async () => {
    renderPage();
    await screen.findByText('bounce@example.com', { selector: 'span.text-sm.font-medium' });
    expect(screen.getByRole('button', { name: /مرسلة \(1\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /فاشلة \(1\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /مقبولة \(1\)/ })).toBeInTheDocument();
    expect(within(inviteRow('bounce@example.com')).getByText(/سبب الفشل: mailbox full/)).toBeInTheDocument();
  });

  it('resends an unaccepted invite as a resend of that invite, and offers nothing on an accepted one', async () => {
    renderPage();
    await screen.findByText('new@example.com', { selector: 'span.text-sm.font-medium' });

    fireEvent.click(within(inviteRow('new@example.com')).getByRole('button', { name: /إعادة إرسال/ }));
    await waitFor(() => expect(svc.sendInvite).toHaveBeenCalledWith(expect.objectContaining({ email: 'new@example.com', resend: true, inviteId: 'inv-sent' })));

    // The accepted invite's group shares its email with a listed user; scope
    // to the invites log so the user card's buttons do not leak in.
    const acceptedGroup = screen.getAllByText('editor@example.com').map((el) => el.closest('div.rounded-lg') as HTMLElement).find((el) => el.textContent?.includes('مقبولة ومسجّل')) as HTMLElement;
    expect(within(acceptedGroup).queryByRole('button', { name: /إعادة إرسال/ })).not.toBeInTheDocument();
    expect(within(acceptedGroup).queryAllByRole('button')).toHaveLength(0);
  });
});

describe('deleting accounts and roles', () => {
  it('never offers to delete the signed-in admin\'s own account', async () => {
    renderPage();
    await screen.findByText(/المستخدمون الحاليون \(3\)/);
    await waitFor(() => userCard('me@example.com'));
    expect(within(userCard('me@example.com')).queryByRole('button', { name: /حذف الحساب/ })).not.toBeInTheDocument();
  });

  it('lets an admin delete an editor but not an owner, and lets an owner delete an owner', async () => {
    renderPage();
    await screen.findByText(/المستخدمون الحاليون \(3\)/);
    await waitFor(() => expect(svc.listRoles).toHaveBeenCalled());
    await waitFor(() => userCard('owner@example.com'));
    expect(within(userCard('editor@example.com')).getByRole('button', { name: /حذف الحساب/ })).toBeInTheDocument();
    expect(within(userCard('owner@example.com')).queryByRole('button', { name: /حذف الحساب/ })).not.toBeInTheDocument();

    fireEvent.click(within(userCard('editor@example.com')).getByRole('button', { name: /حذف الحساب/ }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'حذف' }));
    await waitFor(() => expect(svc.deleteUser).toHaveBeenCalledWith('editor-1'));
  });

  it('lets an owner delete an owner', async () => {
    roleState.isOwner = true;
    renderPage();
    await screen.findByText(/المستخدمون الحاليون \(3\)/);
    await waitFor(() => expect(svc.listRoles).toHaveBeenCalled());
    await waitFor(() => userCard('owner@example.com'));
    expect(within(userCard('owner@example.com')).getByRole('button', { name: /حذف الحساب/ })).toBeInTheDocument();
  });

  it('never offers to strip an owner role or the admin\'s own admin role, but strips another user\'s role', async () => {
    renderPage();
    await screen.findByText(/المستخدمون الحاليون \(3\)/);
    await waitFor(() => expect(svc.listRoles).toHaveBeenCalled());
    await waitFor(() => userCard('owner@example.com'));

    const ownerRole = within(userCard('owner@example.com')).getByText('مالك').closest('div.rounded-md') as HTMLElement;
    expect(within(ownerRole).queryAllByRole('button')).toHaveLength(0);
    const myRole = within(userCard('me@example.com')).getByText('أدمن').closest('div.rounded-md') as HTMLElement;
    expect(within(myRole).queryAllByRole('button')).toHaveLength(0);

    const editorRole = within(userCard('editor@example.com')).getByText('محرر').closest('div.rounded-md') as HTMLElement;
    fireEvent.click(within(editorRole).getByRole('button'));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'حذف' }));
    await waitFor(() => expect(svc.deleteRole).toHaveBeenCalledWith('role-editor'));
  });
});
