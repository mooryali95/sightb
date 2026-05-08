import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
      const { data } = await (supabase as any)
        .from('user_roles')
        .select('*')
        .eq('user_id', user.id);

      setRoles(
        (data || []).map((r: any) => ({
          id: r.id,
          role: r.role as AppRole,
          scopeType: r.scope_type as ScopeType,
          scopeId: r.scope_id,
        }))
      );
      setLoading(false);
    };

    fetchRoles();
  }, [user, authLoading]);

  const isOwner = roles.some((r) => r.role === 'owner' && r.scopeType === 'system');
  const isAdmin = isOwner || roles.some((r) => r.role === 'admin' && r.scopeType === 'system');
  // True for any admin/owner regardless of scope (system, company, or project)
  const isScopedAdmin = isAdmin || roles.some((r) => r.role === 'admin' || r.role === 'owner');

  /**
   * Returns true when the user holds an admin/owner role applicable to the given scope.
   * - System admins/owners → always true.
   * - Company admins → true for that company AND for any project under it.
   * - Project admins → true for that project (and read-only inferred for parent company elsewhere).
   */
  const isAdminFor = (scopeType: ScopeType, scopeId: string | null | undefined) => {
    if (isAdmin) return true;
    if (!scopeId) return false;
    // Direct match
    if (roles.some((r) => r.role === 'admin' && r.scopeType === scopeType && r.scopeId === scopeId)) {
      return true;
    }
    // Project scope inherits from company-admin via canEdit cascading logic
    if (scopeType === 'project') {
      // Defer to canEdit which already handles the company→project cascade for admins
      return canEdit('project', scopeId);
    }
    return false;
  };

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

  return { roles, isOwner, isAdmin, canEdit, hasAccess, loading };
}
