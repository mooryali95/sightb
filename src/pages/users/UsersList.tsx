/**
 * The current users, each with their roles. The gates live here: the
 * signed-in admin's own account is never deletable, an owner is deletable
 * by an owner only, an owner role is never strippable from this page, and
 * an admin cannot strip their own admin role.
 */
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Eye, UserX, Search } from 'lucide-react';
import { motion } from 'framer-motion';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { roleLabels, roleIcons, type Profile, type RoleEntry } from './labels';

interface Props {
  profiles: Profile[];
  roles: RoleEntry[];
  loading: boolean;
  currentUserId: string | undefined;
  isOwner: boolean;
  deletingUser: string | null;
  onDeleteUser: (userId: string) => void;
  onDeleteRole: (roleId: string) => void;
  scopeName: (scopeType: string, scopeId: string | null) => string;
}

export function UsersList({
  profiles, roles, loading, currentUserId, isOwner, deletingUser, onDeleteUser, onDeleteRole, scopeName,
}: Props) {
  const [userSearchQuery, setUserSearchQuery] = useState('');

  const filteredProfiles = useMemo(() => {
    if (!userSearchQuery.trim()) return profiles;
    const q = userSearchQuery.toLowerCase();
    return profiles.filter(p => p.email.toLowerCase().includes(q) || (p.fullName && p.fullName.toLowerCase().includes(q)));
  }, [profiles, userSearchQuery]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="stat-card"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">المستخدمون الحاليون ({profiles.length})</h2>
      </div>

      {/* User search */}
      <div className="relative mb-4">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="بحث بالإيميل أو الاسم..."
          value={userSearchQuery}
          onChange={(e) => setUserSearchQuery(e.target.value)}
          className="ps-9 h-9 text-sm"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {filteredProfiles.map((profile) => {
            const userRoles = roles.filter((r) => r.userId === profile.id);
            const isSelf = profile.id === currentUserId;
            const targetIsOwner = userRoles.some(r => r.role === 'owner' && r.scopeType === 'system');
            const canDeleteUser = !isSelf && (!targetIsOwner || isOwner);
            return (
              <div key={profile.id} className="p-4 rounded-lg border border-border/50 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-sm" dir="ltr">{profile.email}</span>
                    {profile.fullName && (
                      <span className="text-xs text-muted-foreground ms-2">({profile.fullName})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={profile.status === 'active' ? 'default' : 'secondary'}>
                      {profile.status === 'active' ? 'نشط' : 'معلق'}
                    </Badge>
                    {canDeleteUser && (
                      <ConfirmDeleteDialog
                        title="حذف الحساب نهائياً"
                        description={`هل تريد حذف حساب ${profile.email} بالكامل؟ سيتم إزالة جميع صلاحياته وبياناته. لا يمكن التراجع عن هذا الإجراء.`}
                        onConfirm={() => onDeleteUser(profile.id)}
                        trigger={
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                            disabled={deletingUser === profile.id}
                          >
                            <UserX className="w-3.5 h-3.5" />
                            {deletingUser === profile.id ? 'جاري الحذف...' : 'حذف الحساب'}
                          </Button>
                        }
                      />
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {userRoles.map((role) => {
                    const Icon = roleIcons[role.role] || Eye;
                    return (
                      <div key={role.id} className="flex items-center gap-1.5 bg-muted/50 rounded-md px-2 py-1">
                        <Icon className="w-3 h-3" />
                        <span className="text-xs">{roleLabels[role.role]}</span>
                        <span className="text-xs text-muted-foreground">
                          — {scopeName(role.scopeType, role.scopeId)}
                        </span>
                        {!(role.role === 'owner') && !(role.role === 'admin' && role.userId === currentUserId) && (
                          <ConfirmDeleteDialog
                            title="إزالة الصلاحية"
                            description="هل تريد إزالة هذه الصلاحية من المستخدم؟"
                            onConfirm={() => onDeleteRole(role.id)}
                            variant="inline"
                          />
                        )}
                      </div>
                    );
                  })}
                  {userRoles.length === 0 && (
                    <span className="text-xs text-muted-foreground">لا توجد صلاحيات</span>
                  )}
                </div>
              </div>
            );
          })}
          {filteredProfiles.length === 0 && userSearchQuery && (
            <p className="text-sm text-muted-foreground text-center py-4">لا يوجد مستخدم يطابق البحث</p>
          )}
        </div>
      )}
    </motion.div>
  );
}
