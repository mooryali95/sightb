import { useEffect, useState } from 'react';
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
  const { user } = useAuth();
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRoles([]);
      setLoading(false);
      return;
    }

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
  }, [user]);

  const isOwner = roles.some((r) => r.role === 'owner' && r.scopeType === 'system');
  const isAdmin = isOwner || roles.some((r) => r.role === 'admin' && r.scopeType === 'system');

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

  return { roles, isAdmin, canEdit, hasAccess, loading };
}
