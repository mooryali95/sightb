/**
 * Unified permission gate.
 * ---------------------------------------------------------------
 * Replaces ad-hoc `readOnly` props scattered across sections. Roles
 * come from the server (`user_roles` via `useRole`), and actions are
 * hidden *before* render — never disabled-after-the-fact.
 *
 *   <Can action="expense.create" projectId={id}>
 *     <Button>إضافة مصروف</Button>
 *   </Can>
 */

import { ReactNode } from 'react';
import { useRole } from '@/hooks/useRole';

/** Least privilege required to perform an action. */
export type PermissionLevel = 'view' | 'edit' | 'admin';

/** Domain actions, mapped to the minimum role that may perform them. */
export const ACTION_LEVELS = {
  'project.view': 'view',
  'project.edit': 'edit',
  'project.archive': 'admin',
  'project.delete': 'admin',
  'budget.edit': 'edit',
  'budget.baseline': 'admin',
  'expense.create': 'edit',
  'expense.edit': 'edit',
  'expense.delete': 'edit',
  'expense.approve': 'admin',
  'fund.create': 'edit',
  'fund.settle': 'admin',
  'cash.transfer': 'edit',
  'custody.manage': 'edit',
  'payable.create': 'edit',
  'payable.settle': 'edit',
  'payable.approve': 'admin',
  'advance.settle': 'edit',
  'advance.writeoff': 'admin',
  'revenue.edit': 'edit',
  'export.run': 'view',
  'audit.view': 'admin',
  'users.manage': 'admin',
} as const satisfies Record<string, PermissionLevel>;

export type PermissionAction = keyof typeof ACTION_LEVELS;

export interface PermissionScope {
  projectId?: string | null;
  companyId?: string | null;
}

/**
 * Single source of truth for "may the current user do X here?".
 * Every gate in the UI must go through this hook.
 */
export function usePermissions(scope: PermissionScope = {}) {
  const { isAdmin, isAdminFor, canEdit, hasAccess, loading } = useRole();

  const scopeArgs = (): ['project' | 'company', string] | null => {
    if (scope.projectId) return ['project', scope.projectId];
    if (scope.companyId) return ['company', scope.companyId];
    return null;
  };

  const can = (action: PermissionAction, override?: PermissionScope): boolean => {
    if (loading) return false;
    if (isAdmin) return true;

    const level = ACTION_LEVELS[action] as PermissionLevel;
    const merged = { ...scope, ...override };
    const target: ['project' | 'company', string] | null = merged.projectId
      ? ['project', merged.projectId]
      : merged.companyId
        ? ['company', merged.companyId]
        : scopeArgs();

    if (!target) return level === 'view';

    if (level === 'view') return hasAccess(target[0], target[1]);
    if (level === 'edit') return canEdit(target[0], target[1]);
    return isAdminFor(target[0], target[1]);
  };

  return {
    can,
    loading,
    isAdmin,
    /** Convenience for section-level read-only rendering. */
    readOnly: !loading && !can('project.edit'),
  };
}

interface CanProps extends PermissionScope {
  action: PermissionAction;
  children: ReactNode;
  /** Rendered instead of children when the user lacks the permission. */
  fallback?: ReactNode;
  /** Extra client-side guard (e.g. record already settled). */
  when?: boolean;
}

export function Can({ action, children, fallback = null, when = true, ...scope }: CanProps) {
  const { can, loading } = usePermissions(scope);
  if (loading) return null;
  if (!when || !can(action)) return <>{fallback}</>;
  return <>{children}</>;
}
