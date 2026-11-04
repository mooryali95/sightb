import { useState, useEffect } from 'react';
import * as userService from '@/services/userService';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { useStore } from '@/store/useStore';
import { AppLayout } from '@/components/AppLayout';
import { toast } from 'sonner';
import { Users } from 'lucide-react';
import { logger } from '@/lib/logger';
import { Navigate } from 'react-router-dom';
import { PermissionMatrixInspector } from '@/components/security/PermissionMatrixInspector';
import { InviteForm } from './users/InviteForm';
import { InvitesLog } from './users/InvitesLog';
import { UsersList } from './users/UsersList';
import type { Invite, InviteDeliveryStatus, Profile, RoleEntry } from './users/labels';

export default function UserManagement() {
  const { user } = useAuth();
  const { isAdmin, isOwner, loading: roleLoading } = useRole();
  const { companies, projects } = useStore();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [allRoles, setAllRoles] = useState<RoleEntry[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteDeliveryStatus, setInviteDeliveryStatus] = useState<Record<string, InviteDeliveryStatus>>({});
  const [loading, setLoading] = useState(true);
  const [deletingUser, setDeletingUser] = useState<string | null>(null);

  const [resendingInviteId, setResendingInviteId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin || roleLoading) return;
    loadData();
  }, [isAdmin, roleLoading]);

  const loadData = async () => {
    setLoading(true);
    const [profileRows, roleRows, inviteRows] = await Promise.all([
      userService.listProfiles().catch(() => []),
      userService.listRoles().catch(() => []),
      userService.listInvites().catch(() => []),
    ]);

    setProfiles(profileRows);
    setAllRoles(roleRows);
    const mappedInvites = inviteRows;
    setInvites(mappedInvites);

    if (mappedInvites.length > 0) {
      try {
        const emails = Array.from(new Set(mappedInvites.map((invite) => invite.email.toLowerCase())));
        const items = await userService.fetchInviteEmailStatus(emails);

        const deliveryMap: Record<string, InviteDeliveryStatus> = {};
        for (const statusItem of items as InviteDeliveryStatus[]) {
          const normalizedEmail = statusItem.email;

          if (statusItem.inviteId) {
            deliveryMap[`invite:${statusItem.inviteId}`] = statusItem;
          }

          if (normalizedEmail && !deliveryMap[`email:${normalizedEmail}`]) {
            deliveryMap[`email:${normalizedEmail}`] = statusItem;
          }
        }

        setInviteDeliveryStatus(deliveryMap);
      } catch (error) {
        console.error('[admin-email-status]', error);
        setInviteDeliveryStatus({});
      }
    } else {
      setInviteDeliveryStatus({});
    }

    setLoading(false);
  };

  const deleteInvite = async (id: string) => {
    try {
      await userService.deleteInvite(id);
      loadData();
    } catch {
      toast.error('حدث خطأ');
    }
  };

  /** Reload now, and again once the mail queue has had a moment to move. */
  const reloadTwice = () => {
    loadData();
    window.setTimeout(() => { void loadData(); }, 6000);
  };

  const resendInvite = async (invite: Invite) => {
    setResendingInviteId(invite.id);
    try {
      const res = await userService.sendInvite({
        email: invite.email,
        role: invite.role,
        scopeType: invite.scopeType,
        scopeId: invite.scopeId,
        resend: true,
        inviteId: invite.id,
      });

      if (res?.emailSent) {
        toast.success(`تمت إعادة إرسال الدعوة إلى ${invite.email}`);
      } else {
        toast.warning('تم حفظ محاولة إعادة الإرسال لكن البريد لم يُرسل بعد');
      }

      reloadTwice();
    } catch (error) {
      console.error('[resend-invite]', error);
      toast.error('تعذر إعادة إرسال الدعوة');
    } finally {
      setResendingInviteId(null);
    }
  };

  const deleteRole = async (id: string) => {
    try {
      await userService.deleteRole(id);
      loadData();
    } catch {
      toast.error('حدث خطأ');
    }
  };

  const deleteUser = async (targetUserId: string) => {
    setDeletingUser(targetUserId);
    try {
      await userService.deleteUser(targetUserId);
      toast.success('تم حذف الحساب بنجاح');
      loadData();
    } catch (err) {
      logger.capture('user-management.delete-user', err);
      toast.error('حدث خطأ في حذف الحساب');
    } finally {
      setDeletingUser(null);
    }
  };

  const getScopeName = (scopeType: string, scopeId: string | null) => {
    if (scopeType === 'system' || !scopeId) return 'النظام بالكامل';
    if (scopeType === 'company') {
      return companies.find((c) => c.id === scopeId)?.name || scopeId;
    }
    return projects.find((p) => p.id === scopeId)?.name || scopeId;
  };

  if (roleLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">إدارة المستخدمين</h1>
        </div>

        <InviteForm companies={companies} projects={projects} onInvited={reloadTwice} />

        <InvitesLog
          invites={invites}
          deliveryStatus={inviteDeliveryStatus}
          loading={loading}
          resendingInviteId={resendingInviteId}
          onRefresh={() => { void loadData(); }}
          onResend={resendInvite}
          onDelete={deleteInvite}
          scopeName={getScopeName}
        />

        <UsersList
          profiles={profiles}
          roles={allRoles}
          loading={loading}
          currentUserId={user?.id}
          isOwner={isOwner}
          deletingUser={deletingUser}
          onDeleteUser={deleteUser}
          onDeleteRole={deleteRole}
          scopeName={getScopeName}
        />

        <PermissionMatrixInspector />
      </div>
    </AppLayout>
  );
}

