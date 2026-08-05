import { useEffect, useState, useRef } from 'react';
import { listRolesForUser } from '@/services/userService';
import { useAuth } from './useAuth';

export type AppRole = 'owner' | 'admin' | 'editor' | 'viewer';
export type ScopeType = 'system' | 'company' | 'project';

interface UserRole {
  id: string;
  role: AppRole;
  scopeType: ScopeType;
  scopeId: string | null;
}

export function useRole() {
  const { user, loading: authLoading } = useAuth();
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const prevUserId = useRef<string | null>(null);

  useEffect(() => {
    // Still waiting for auth — keep loading true
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!user) {
      setRoles([]);
      setLoading(false);
      prevUserId.current = null;
      return;
    }

    // User hasn't changed and we already have roles — skip
    if (prevUserId.current === user.id && roles.length > 0) {
      setLoading(false);
      return;
    }

    // Set loading before fetch to prevent flash
    setLoading(true);
    prevUserId.current = user.id;

    const fetchRoles = async () => {
      try {
        const rows = await listRolesForUser(user.id);
        setRoles(
          rows.map((r) => ({
            id: r.id,
            role: r.role as AppRole,
            scopeType: r.scopeType as ScopeType,
            scopeId: r.scopeId,
          }))
        );
      } catch {
        setRoles([]);
      }
      setLoading(false);
    };

    fetchRoles();
  }, [user, authLoading]);

  const isOwner = roles.some((r) => r.role === 'owner' && r.scopeType === 'system');
  const isAdmin = isOwner || roles.some((r) => r.role === 'admin' && r.scopeType === 'system');
  const isScopedAdmin = isAdmin || roles.some((r) => r.role === 'admin' || r.role === 'owner');

  const canEdit = (scopeType: ScopeType, scopeId: string) => {
    if (isAdmin) return true;
    return roles.some(
      (r) =>
        (r.role === 'editor' || r.role === 'admin') &&
        r.scopeType === scopeType &&
        r.scopeId === scopeId
    );
  };

  const hasAccess = (scopeType: ScopeType, scopeId: string) => {
    if (isAdmin) return true;
    return roles.some(
      (r) => r.scopeType === scopeType && r.scopeId === scopeId
    );
  };

  /**
   * True if the user is admin/owner for the given scope.
   * - System admins → always true everywhere.
   * - Direct admin on the scope → true.
   * - Project scope inherits company-admin via canEdit cascade in RLS/UI.
   */
  const isAdminFor = (scopeType: ScopeType, scopeId: string | null | undefined) => {
    if (isAdmin) return true;
    if (!scopeId) return false;
    if (roles.some((r) => r.role === 'admin' && r.scopeType === scopeType && r.scopeId === scopeId)) {
      return true;
    }
    if (scopeType === 'project') {
      return canEdit('project', scopeId);
    }
    return false;
  };

  return { roles, isOwner, isAdmin, isScopedAdmin, isAdminFor, canEdit, hasAccess, loading };
}
