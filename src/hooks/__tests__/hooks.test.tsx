/**
 * Unit tests for the three hooks that still had none: the role hook that
 * every permission check in the UI reads, the idle timeout that signs a
 * forgotten session out, and the table labeller that lets a table render
 * as cards on a phone. The auth context and the user service are stood
 * in; time is faked where the hook counts it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { useRole } from '../useRole';
import { useSessionTimeout } from '../useSessionTimeout';
import { useResponsiveTableLabels } from '../useResponsiveTableLabels';

const auth = vi.hoisted(() => ({ user: null as { id: string } | null, loading: false }));
vi.mock('../useAuth', () => ({ useAuth: () => ({ user: auth.user, loading: auth.loading }) }));
const listRolesForUser = vi.hoisted(() => vi.fn());
vi.mock('@/services/userService', () => ({ listRolesForUser }));
const signOut = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/services/db', () => ({ db: { signOut } }));

const role = (role: string, scopeType: string, scopeId: string | null = null, id = `${role}-${scopeType}-${scopeId}`) => ({ id, userId: 'u1', role, scopeType, scopeId });

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = { id: 'u1' };
  auth.loading = false;
  listRolesForUser.mockResolvedValue([]);
});
afterEach(() => { vi.useRealTimers(); });

describe('useRole', () => {
  it('stays loading while auth loads, and answers no roles without a user without asking the server', async () => {
    auth.loading = true;
    const { result, rerender } = renderHook(() => useRole());
    expect(result.current.loading).toBe(true);
    expect(listRolesForUser).not.toHaveBeenCalled();

    auth.loading = false;
    auth.user = null;
    rerender();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.roles).toEqual([]);
    expect(listRolesForUser).not.toHaveBeenCalled();
  });

  it('fetches the user\'s roles once and keeps them across re-renders', async () => {
    listRolesForUser.mockResolvedValue([role('editor', 'project', 'p1')]);
    const { result, rerender } = renderHook(() => useRole());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.roles).toEqual([{ id: 'editor-project-p1', role: 'editor', scopeType: 'project', scopeId: 'p1' }]);
    rerender();
    rerender();
    expect(listRolesForUser).toHaveBeenCalledTimes(1);
    expect(listRolesForUser).toHaveBeenCalledWith('u1');
  });

  it('falls back to no roles when the server refuses, and stops loading', async () => {
    listRolesForUser.mockRejectedValue(new Error('denied'));
    const { result } = renderHook(() => useRole());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.roles).toEqual([]);
    expect(result.current.isAdmin).toBe(false);
  });

  it('grants a system owner or admin everything, everywhere', async () => {
    listRolesForUser.mockResolvedValue([role('owner', 'system')]);
    const { result } = renderHook(() => useRole());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ isOwner: true, isAdmin: true, isScopedAdmin: true });
    expect(result.current.canEdit('project', 'any')).toBe(true);
    expect(result.current.hasAccess('company', 'any')).toBe(true);
    expect(result.current.isAdminFor('company', 'any')).toBe(true);

    listRolesForUser.mockResolvedValue([role('admin', 'system')]);
    auth.user = { id: 'u2' };
    const second = renderHook(() => useRole());
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(second.result.current).toMatchObject({ isOwner: false, isAdmin: true });
  });

  it('scopes an editor to exactly the thing they were given', async () => {
    listRolesForUser.mockResolvedValue([role('editor', 'project', 'p1'), role('viewer', 'company', 'c1')]);
    const { result } = renderHook(() => useRole());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ isOwner: false, isAdmin: false, isScopedAdmin: false });
    expect(result.current.canEdit('project', 'p1')).toBe(true);
    expect(result.current.canEdit('project', 'p2')).toBe(false);
    expect(result.current.canEdit('company', 'c1')).toBe(false); // a viewer reads only
    expect(result.current.hasAccess('company', 'c1')).toBe(true);
    expect(result.current.hasAccess('company', 'c2')).toBe(false);
    // Recorded, not changed: a project editor counts as the project's admin, by design of the cascade.
    expect(result.current.isAdminFor('project', 'p1')).toBe(true);
    expect(result.current.isAdminFor('company', 'c1')).toBe(false);
    expect(result.current.isAdminFor('company', null)).toBe(false);
  });

  it('treats a company admin as a scoped admin of that company only', async () => {
    listRolesForUser.mockResolvedValue([role('admin', 'company', 'c1')]);
    const { result } = renderHook(() => useRole());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ isAdmin: false, isScopedAdmin: true });
    expect(result.current.isAdminFor('company', 'c1')).toBe(true);
    expect(result.current.isAdminFor('company', 'c2')).toBe(false);
    expect(result.current.canEdit('company', 'c1')).toBe(true);
    expect(result.current.canEdit('project', 'p1')).toBe(false);
  });
});

describe('useSessionTimeout', () => {
  const MIN = 60 * 1000;

  it('does nothing without a user', () => {
    vi.useFakeTimers();
    auth.user = null;
    const { result } = renderHook(() => useSessionTimeout());
    act(() => { vi.advanceTimersByTime(31 * MIN); });
    expect(result.current.showWarning).toBe(false);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('warns two minutes before the half hour with the seconds left, then signs out and goes to the login page', async () => {
    vi.useFakeTimers();
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, set href(v: string) { assign(v); } } });
    try {
      const { result } = renderHook(() => useSessionTimeout());
      act(() => { vi.advanceTimersByTime(27 * MIN + 30 * 1000); });
      expect(result.current.showWarning).toBe(false);
      act(() => { vi.advanceTimersByTime(30 * 1000); });
      expect(result.current.showWarning).toBe(true);
      expect(result.current.remainingSeconds).toBe(120);
      act(() => { vi.advanceTimersByTime(60 * 1000); });
      expect(result.current.remainingSeconds).toBe(60);

      act(() => { vi.advanceTimersByTime(60 * 1000); });
      await act(async () => { await Promise.resolve(); });
      expect(signOut).toHaveBeenCalledTimes(1);
      expect(assign).toHaveBeenCalledWith('/login');
      expect(result.current.showWarning).toBe(false);
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });

  it('starts the clock again on any activity, including the explicit reset from the warning', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSessionTimeout());
    act(() => { vi.advanceTimersByTime(20 * MIN); });
    act(() => { window.dispatchEvent(new Event('keydown')); });
    act(() => { vi.advanceTimersByTime(20 * MIN); });
    expect(result.current.showWarning).toBe(false); // 20 minutes since the key press
    expect(signOut).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(8 * MIN); });
    expect(result.current.showWarning).toBe(true);
    act(() => { result.current.resetActivity(); });
    expect(result.current.showWarning).toBe(false);
    act(() => { vi.advanceTimersByTime(5 * MIN); });
    expect(result.current.showWarning).toBe(false);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('stops listening and counting when it unmounts', () => {
    vi.useFakeTimers();
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useSessionTimeout());
    unmount();
    expect(remove.mock.calls.map((c) => c[0]).filter((e) => ['mousedown', 'keydown', 'touchstart', 'scroll'].includes(e as string))).toHaveLength(4);
    act(() => { vi.advanceTimersByTime(31 * MIN); });
    expect(signOut).not.toHaveBeenCalled();
  });
});

describe('useResponsiveTableLabels', () => {
  function Table({ rows }: { rows: string[][] }) {
    const ref = useResponsiveTableLabels<HTMLTableElement>([rows]);
    return (
      <table ref={ref}>
        <thead><tr><th>البند</th><th>المبلغ</th><th></th></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} data-label={j === 0 && c === 'keep' ? 'ثابت' : undefined}>{c}</td>)}</tr>)}</tbody>
      </table>
    );
  }

  it('labels every cell from its header, marks the unlabeled last column as actions, and keeps a label already set', () => {
    const { container, rerender } = render(<Table rows={[['رواتب', '100', 'x'], ['keep', '5', 'y']]} />);
    const cells = (row: number) => Array.from(container.querySelectorAll('tbody tr')[row].children);
    expect(cells(0).map((c) => c.getAttribute('data-label'))).toEqual(['البند', 'المبلغ', '']);
    expect(cells(0)[2].getAttribute('data-cell')).toBe('actions');
    expect(cells(0)[1].getAttribute('data-cell')).toBeNull();
    expect(cells(1)[0].getAttribute('data-label')).toBe('ثابت');

    rerender(<Table rows={[['رواتب', '100', 'x'], ['keep', '5', 'y'], ['جديد', '7', 'z']]} />);
    expect(cells(2).map((c) => c.getAttribute('data-label'))).toEqual(['البند', 'المبلغ', '']);
  });

  it('leaves a table without headers alone, and a named last column is not an action bar', () => {
    function Bare() {
      const ref = useResponsiveTableLabels<HTMLTableElement>();
      return <table ref={ref}><tbody><tr><td>x</td></tr></tbody></table>;
    }
    const bare = render(<Bare />);
    expect(bare.container.querySelector('td')?.getAttribute('data-label')).toBeNull();

    function Named() {
      const ref = useResponsiveTableLabels<HTMLTableElement>();
      return <table ref={ref}><thead><tr><th>البند</th><th>الحالة</th></tr></thead><tbody><tr><td>x</td><td>y</td></tr></tbody></table>;
    }
    const named = render(<Named />);
    const last = named.container.querySelectorAll('td')[1];
    expect(last.getAttribute('data-label')).toBe('الحالة');
    expect(last.getAttribute('data-cell')).toBeNull();
  });
});
