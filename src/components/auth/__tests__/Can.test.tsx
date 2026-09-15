/**
 * Unit tests for the permission gate every write action in the UI goes
 * through. What must hold: nothing renders while roles load, a system
 * admin may do anything, each action resolves to its level against the
 * scope given (a project first, then a company, then none), an override
 * beats the hook's scope, an unscoped action is allowed only at view
 * level, the `when` guard hides regardless of role, and the fallback
 * takes the children's place. The role hook is stood in.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, renderHook, screen } from '@testing-library/react';
import { ACTION_LEVELS, Can, usePermissions } from '../Can';

const roles = vi.hoisted(() => ({
  loading: false, isAdmin: false,
  isAdminFor: vi.fn((_t: string, id: string) => id === 'admin-here'),
  canEdit: vi.fn((_t: string, id: string) => id === 'admin-here' || id === 'edit-here'),
  hasAccess: vi.fn((_t: string, id: string) => id !== 'nowhere'),
}));
vi.mock('@/hooks/useRole', () => ({ useRole: () => roles }));

beforeEach(() => { vi.clearAllMocks(); roles.loading = false; roles.isAdmin = false; });

describe('the action table', () => {
  it('keeps the destructive and approval actions at admin level', () => {
    const admin = Object.entries(ACTION_LEVELS).filter(([, l]) => l === 'admin').map(([a]) => a).sort();
    expect(admin).toEqual(['advance.writeoff', 'audit.view', 'budget.baseline', 'expense.approve', 'fund.settle', 'payable.approve', 'project.archive', 'project.delete', 'users.manage']);
    expect(Object.entries(ACTION_LEVELS).filter(([, l]) => l === 'view').map(([a]) => a).sort()).toEqual(['export.run', 'project.view']);
  });
});

describe('usePermissions', () => {
  it('denies everything while the roles load, and marks the section read only once they have', () => {
    roles.loading = true;
    const { result } = renderHook(() => usePermissions({ projectId: 'edit-here' }));
    expect(result.current.can('project.view')).toBe(false);
    expect(result.current.readOnly).toBe(false);
    roles.loading = false;
    const loaded = renderHook(() => usePermissions({ projectId: 'nowhere' }));
    expect(loaded.result.current.readOnly).toBe(true);
  });

  it('lets a system admin do anything without consulting the scope', () => {
    roles.isAdmin = true;
    const { result } = renderHook(() => usePermissions({ projectId: 'nowhere' }));
    expect(result.current.can('users.manage')).toBe(true);
    expect(result.current.readOnly).toBe(false);
    expect(roles.isAdminFor).not.toHaveBeenCalled();
  });

  it('resolves each level against the project in scope', () => {
    const edit = renderHook(() => usePermissions({ projectId: 'edit-here' })).result.current;
    expect(edit.can('project.view')).toBe(true);
    expect(edit.can('expense.create')).toBe(true);
    expect(edit.can('expense.approve')).toBe(false);
    expect(roles.canEdit).toHaveBeenCalledWith('project', 'edit-here');
    expect(roles.isAdminFor).toHaveBeenCalledWith('project', 'edit-here');

    const admin = renderHook(() => usePermissions({ projectId: 'admin-here' })).result.current;
    expect(admin.can('expense.approve')).toBe(true);
    const none = renderHook(() => usePermissions({ projectId: 'nowhere' })).result.current;
    expect(none.can('project.view')).toBe(false);
    expect(none.can('export.run')).toBe(false);
  });

  it('falls back to the company when there is no project, and prefers the project when both are given', () => {
    const company = renderHook(() => usePermissions({ companyId: 'edit-here' })).result.current;
    expect(company.can('budget.edit')).toBe(true);
    expect(roles.canEdit).toHaveBeenLastCalledWith('company', 'edit-here');

    const both = renderHook(() => usePermissions({ projectId: 'nowhere', companyId: 'edit-here' })).result.current;
    expect(both.can('budget.edit')).toBe(false);
    expect(roles.canEdit).toHaveBeenLastCalledWith('project', 'nowhere');
  });

  it('lets a call override the hook\'s scope, and allows only view-level actions with no scope at all', () => {
    const { result } = renderHook(() => usePermissions({ projectId: 'nowhere' }));
    expect(result.current.can('expense.create', { projectId: 'edit-here' })).toBe(true);
    expect(result.current.can('expense.create', { companyId: 'edit-here' })).toBe(false); // the project in scope still wins
    const unscoped = renderHook(() => usePermissions()).result.current;
    expect(unscoped.can('export.run')).toBe(true);
    expect(unscoped.can('expense.create')).toBe(false);
    expect(unscoped.can('users.manage')).toBe(false);
  });
});

describe('<Can>', () => {
  it('renders the children when allowed, the fallback when not, and nothing while loading', () => {
    render(<Can action="expense.create" projectId="edit-here"><button>إضافة</button></Can>);
    expect(screen.getByRole('button', { name: 'إضافة' })).toBeInTheDocument();

    render(<Can action="expense.approve" projectId="edit-here" fallback={<p>للقراءة فقط</p>}><button>اعتماد</button></Can>);
    expect(screen.queryByRole('button', { name: 'اعتماد' })).not.toBeInTheDocument();
    expect(screen.getByText('للقراءة فقط')).toBeInTheDocument();

    roles.loading = true;
    const { container } = render(<Can action="expense.create" projectId="edit-here" fallback={<p>x</p>}><button>y</button></Can>);
    expect(container).toBeEmptyDOMElement();
  });

  it('hides the children when the extra guard is false, whatever the role', () => {
    roles.isAdmin = true;
    render(<Can action="payable.settle" projectId="edit-here" when={false} fallback={<p>مسوّاة</p>}><button>تسوية</button></Can>);
    expect(screen.queryByRole('button', { name: 'تسوية' })).not.toBeInTheDocument();
    expect(screen.getByText('مسوّاة')).toBeInTheDocument();
  });
});
