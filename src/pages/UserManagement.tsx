import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRole, type AppRole } from '@/hooks/useRole';
import { useStore } from '@/store/useStore';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { UserPlus, Trash2, Users, Shield, Eye, Pencil, Mail, CheckCircle2, Clock, UserX, ChevronDown, ChevronUp, Filter, Search, Crown, RefreshCw, AlertCircle } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface Profile {
  id: string;
  email: string;
  fullName: string;
  status: string;
}

interface Invite {
  id: string;
  email: string;
  role: string;
  scopeType: string;
  scopeId: string | null;
  status: string;
  createdAt: string;
}

interface InviteDeliveryStatus {
  inviteId: string | null;
  email: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
}

interface RoleEntry {
  id: string;
  userId: string;
  role: string;
  scopeType: string;
  scopeId: string | null;
}

const roleLabels: Record<string, string> = { owner: 'مالك', admin: 'أدمن', editor: 'محرر', viewer: 'مشاهد' };
const roleIcons: Record<string, any> = { owner: Crown, admin: Shield, editor: Pencil, viewer: Eye };
const scopeLabels: Record<string, string> = { system: 'النظام', company: 'شركة', project: 'مشروع' };

const inviteStatusConfig: Record<string, { label: string; icon: any; className: string }> = {
  pending: { label: 'قيد المعالجة', icon: Clock, className: 'bg-muted text-muted-foreground' },
  sent: { label: 'تم الإرسال', icon: Mail, className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  accepted: { label: 'مقبولة ومسجّل', icon: CheckCircle2, className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  failed: { label: 'فشل الإرسال', icon: AlertCircle, className: 'bg-destructive/10 text-destructive' },
};

const deliveryStatusConfig: Record<string, { label: string; icon: any; className: string }> = {
  pending: { label: 'البريد بانتظار الإرسال', icon: Clock, className: 'bg-muted text-muted-foreground' },
  sent: { label: 'البريد أُرسل', icon: Mail, className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  failed: { label: 'البريد فشل', icon: AlertCircle, className: 'bg-destructive/10 text-destructive' },
  dlq: { label: 'البريد فشل نهائياً', icon: AlertCircle, className: 'bg-destructive/10 text-destructive' },
};

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

  // Invite form
  const [invEmail, setInvEmail] = useState('');
  const [invRole, setInvRole] = useState('viewer');
  const [invScopeType, setInvScopeType] = useState('system');
  const [invScopeId, setInvScopeId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resendingInviteId, setResendingInviteId] = useState<string | null>(null);

  // Invites log state
  const [invitesOpen, setInvitesOpen] = useState(true);
  const [inviteStatusFilter, setInviteStatusFilter] = useState<string>('all');
  const [inviteSearchQuery, setInviteSearchQuery] = useState('');

  // Users filter
  const [userSearchQuery, setUserSearchQuery] = useState('');

  useEffect(() => {
    if (!isAdmin || roleLoading) return;
    loadData();
  }, [isAdmin, roleLoading]);

  const loadData = async () => {
    setLoading(true);
    const [profilesRes, rolesRes, invitesRes] = await Promise.all([
      (supabase as any).from('profiles').select('*').order('created_at', { ascending: false }),
      (supabase as any).from('user_roles').select('*'),
      (supabase as any).from('user_invites').select('*').order('created_at', { ascending: false }),
    ]);

    setProfiles(
      (profilesRes.data || []).map((p: any) => ({
        id: p.id,
        email: p.email,
        fullName: p.full_name || '',
        status: p.status,
      }))
    );
    setAllRoles(
      (rolesRes.data || []).map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        role: r.role,
        scopeType: r.scope_type,
        scopeId: r.scope_id,
      }))
    );
    const mappedInvites = (invitesRes.data || []).map((i: any) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        scopeType: i.scope_type,
        scopeId: i.scope_id,
        status: i.status,
        createdAt: i.created_at,
      }));
    setInvites(mappedInvites);

    if (mappedInvites.length > 0) {
      try {
        const emails = Array.from(new Set(mappedInvites.map((invite) => invite.email.toLowerCase())));
        const { data, error } = await supabase.functions.invoke('admin-email-status', {
          body: { emails },
        });

        if (error) throw error;

        const deliveryMap: Record<string, InviteDeliveryStatus> = {};
        for (const item of data?.items || []) {
          const normalizedEmail = String(item.email || '').toLowerCase();
          const statusItem: InviteDeliveryStatus = {
            inviteId: item.inviteId ?? null,
            email: normalizedEmail,
            status: item.status,
            errorMessage: item.errorMessage ?? null,
            createdAt: item.createdAt,
          };

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

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invEmail.trim()) return;
    if (invScopeType !== 'system' && !invScopeId) {
      toast.error('يرجى اختيار النطاق');
      return;
    }
    setSubmitting(true);
    try {
      const res = await supabase.functions.invoke('send-invite', {
        body: {
          email: invEmail.trim().toLowerCase(),
          role: invRole,
          scope_type: invScopeType,
          scope_id: invScopeType === 'system' ? null : invScopeId,
        },
      });

      if (res.error) throw res.error;

      const data = res.data;
      if (data?.existingUser) {
        toast.success('المستخدم موجود بالفعل، تم منحه الصلاحيات مباشرة');
      } else if (data?.emailSent) {
        toast.success(`تم إرسال دعوة إلى ${invEmail} بنجاح`);
      } else {
        toast.success('تم حفظ الدعوة. يمكن للمستخدم التسجيل مباشرة.');
      }

      setInvEmail('');
      setInvRole('viewer');
      setInvScopeType('system');
      setInvScopeId('');
      loadData();
      window.setTimeout(() => {
        void loadData();
      }, 6000);
    } catch (err: any) {
      console.error('[invite]', err);
      toast.error('حدث خطأ، يرجى المحاولة مرة أخرى');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteInvite = async (id: string) => {
    const { error } = await (supabase as any).from('user_invites').delete().eq('id', id);
    if (error) toast.error('حدث خطأ');
    else loadData();
  };

  const resendInvite = async (invite: Invite) => {
    setResendingInviteId(invite.id);
    try {
      const res = await supabase.functions.invoke('send-invite', {
        body: {
          email: invite.email,
          role: invite.role,
          scope_type: invite.scopeType,
          scope_id: invite.scopeType === 'system' ? null : invite.scopeId,
          resend: true,
          invite_id: invite.id,
        },
      });

      if (res.error) throw res.error;

      if (res.data?.emailSent) {
        toast.success(`تمت إعادة إرسال الدعوة إلى ${invite.email}`);
      } else {
        toast.warning('تم حفظ محاولة إعادة الإرسال لكن البريد لم يُرسل بعد');
      }

      loadData();
      window.setTimeout(() => {
        void loadData();
      }, 6000);
    } catch (error) {
      console.error('[resend-invite]', error);
      toast.error('تعذر إعادة إرسال الدعوة');
    } finally {
      setResendingInviteId(null);
    }
  };

  const deleteRole = async (id: string) => {
    const { error } = await (supabase as any).from('user_roles').delete().eq('id', id);
    if (error) toast.error('حدث خطأ');
    else loadData();
  };

  const deleteUser = async (targetUserId: string) => {
    setDeletingUser(targetUserId);
    try {
      const res = await supabase.functions.invoke('delete-user', {
        body: { targetUserId },
      });
      if (res.error) throw res.error;
      if (res.data?.error) {
        toast.error(res.data.error);
        return;
      }
      toast.success('تم حذف الحساب بنجاح');
      loadData();
    } catch (err: any) {
      console.error('[delete-user]', err);
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

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ar-SA', { calendar: 'gregory', year: 'numeric', month: 'short', day: 'numeric' });
  };

  // Group invites by email, deduplicated
  const groupedInvites = useMemo(() => {
    let filtered = invites;
    if (inviteStatusFilter !== 'all') {
      filtered = filtered.filter(i => i.status === inviteStatusFilter);
    }
    if (inviteSearchQuery.trim()) {
      const q = inviteSearchQuery.toLowerCase();
      filtered = filtered.filter(i => i.email.toLowerCase().includes(q));
    }

    const groups: Record<string, Invite[]> = {};
    for (const inv of filtered) {
      if (!groups[inv.email]) groups[inv.email] = [];
      groups[inv.email].push(inv);
    }
    return groups;
  }, [invites, inviteStatusFilter, inviteSearchQuery]);

  const pendingInvitesCount = invites.filter(i => i.status === 'pending').length;
  const sentInvitesCount = invites.filter(i => i.status === 'sent').length;
  const failedInvitesCount = invites.filter(i => i.status === 'failed').length;
  const acceptedInvitesCount = invites.filter(i => i.status === 'accepted').length;

  // Filtered users
  const filteredProfiles = useMemo(() => {
    if (!userSearchQuery.trim()) return profiles;
    const q = userSearchQuery.toLowerCase();
    return profiles.filter(p => p.email.toLowerCase().includes(q) || (p.fullName && p.fullName.toLowerCase().includes(q)));
  }, [profiles, userSearchQuery]);

  if (roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
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

        {/* Invite Form */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="stat-card"
        >
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            دعوة مستخدم جديد
          </h2>
          <form onSubmit={handleInvite} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>البريد الإلكتروني</Label>
              <Input
                type="email"
                value={invEmail}
                onChange={(e) => setInvEmail(e.target.value)}
                placeholder="user@example.com"
                dir="ltr"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>الدور</Label>
              <Select value={invRole} onValueChange={setInvRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">مشاهد</SelectItem>
                  <SelectItem value="editor">محرر</SelectItem>
                  <SelectItem value="admin">أدمن</SelectItem>
                </SelectContent>
              </Select>
              {invRole && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  {invRole === 'admin' && 'تحكم كامل: إنشاء/تعديل/حذف كل شيء + إدارة المستخدمين + التقارير'}
                  {invRole === 'editor' && 'تعديل: إضافة/تعديل/حذف البيانات ضمن النطاق المحدد (بدون إدارة المستخدمين)'}
                  {invRole === 'viewer' && 'مشاهدة فقط: عرض البيانات والتقارير بدون أي تعديل'}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>نطاق الصلاحية</Label>
              <Select value={invScopeType} onValueChange={(v) => { setInvScopeType(v); setInvScopeId(''); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">النظام بالكامل</SelectItem>
                  <SelectItem value="company">شركة محددة</SelectItem>
                  <SelectItem value="project">مشروع محدد</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {invScopeType === 'company' && (
              <div className="space-y-2">
                <Label>اختر الشركة</Label>
                <Select value={invScopeId} onValueChange={setInvScopeId}>
                  <SelectTrigger><SelectValue placeholder="اختر شركة" /></SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {invScopeType === 'project' && (
              <div className="space-y-2">
                <Label>اختر المشروع</Label>
                <Select value={invScopeId} onValueChange={setInvScopeId}>
                  <SelectTrigger><SelectValue placeholder="اختر مشروع" /></SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="md:col-span-2">
              <Button type="submit" disabled={submitting} className="gap-2">
                <UserPlus className="w-4 h-4" />
                {submitting ? 'جاري الإرسال...' : 'إرسال الدعوة'}
              </Button>
            </div>
          </form>
          <p className="text-xs text-muted-foreground mt-3">
            سيتمكن المستخدم المدعو من تسجيل الدخول باستخدام بريده الإلكتروني وسيحصل تلقائياً على الصلاحيات المحددة.
          </p>
        </motion.div>

        {/* Invites Log - Collapsible */}
        {
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="stat-card"
          >
            <Collapsible open={invitesOpen} onOpenChange={setInvitesOpen}>
              <div className="flex items-start gap-3">
                <CollapsibleTrigger asChild>
                  <button className="flex-1 flex items-center justify-between text-right">
                    <div className="flex items-center gap-2">
                      <Mail className="w-5 h-5 text-primary" />
                      <h2 className="text-lg font-semibold">سجل الدعوات</h2>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {pendingInvitesCount > 0 && (
                          <Badge variant="outline" className="bg-warning/10 health-warning text-xs">
                            {pendingInvitesCount} معلّقة
                          </Badge>
                        )}
                        {sentInvitesCount > 0 && (
                          <Badge variant="outline" className="bg-primary/10 text-primary text-xs">
                            {sentInvitesCount} مرسلة
                          </Badge>
                        )}
                        {failedInvitesCount > 0 && (
                          <Badge variant="outline" className="bg-destructive/10 text-destructive text-xs">
                            {failedInvitesCount} فاشلة
                          </Badge>
                        )}
                        {acceptedInvitesCount > 0 && (
                          <Badge variant="outline" className="bg-success/10 health-good text-xs">
                            {acceptedInvitesCount} مقبولة
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs">
                          {invites.length} إجمالي
                        </Badge>
                      </div>
                    </div>
                    {invitesOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </button>
                </CollapsibleTrigger>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 text-xs shrink-0"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void loadData();
                  }}
                  disabled={loading}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  تحديث
                </Button>
              </div>
              <CollapsibleContent>
                <p className="text-xs text-muted-foreground mt-4 mb-3">
                  ستظهر هنا حالة كل دعوة بوضوح: قيد المعالجة، تم الإرسال، مقبولة، أو فشل الإرسال. يمكن إعادة إرسال أي دعوة غير مقبولة من الزر المخصص.
                </p>
                {/* Filters */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mt-4 mb-3">
                  <div className="relative flex-1 min-w-0">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="بحث بالإيميل..."
                      value={inviteSearchQuery}
                      onChange={(e) => setInviteSearchQuery(e.target.value)}
                      className="pr-9 h-8 text-sm"
                      dir="ltr"
                    />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => setInviteStatusFilter('all')}
                      className={`text-xs px-3 py-1.5 rounded-full transition-colors min-h-[32px] ${inviteStatusFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                    >
                      الكل ({invites.length})
                    </button>
                    <button
                      onClick={() => setInviteStatusFilter('pending')}
                      className={`text-xs px-3 py-1.5 rounded-full transition-colors min-h-[32px] ${inviteStatusFilter === 'pending' ? 'bg-warning text-warning-foreground' : 'bg-warning/10 health-warning hover:opacity-80'}`}
                    >
                      معلّقة ({pendingInvitesCount})
                    </button>
                    <button
                      onClick={() => setInviteStatusFilter('sent')}
                      className={`text-xs px-3 py-1.5 rounded-full transition-colors min-h-[32px] ${inviteStatusFilter === 'sent' ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary hover:opacity-80'}`}
                    >
                      مرسلة ({sentInvitesCount})
                    </button>
                    <button
                      onClick={() => setInviteStatusFilter('failed')}
                      className={`text-xs px-3 py-1.5 rounded-full transition-colors min-h-[32px] ${inviteStatusFilter === 'failed' ? 'bg-destructive text-destructive-foreground' : 'bg-destructive/10 text-destructive hover:bg-destructive/20'}`}
                    >
                      فاشلة ({failedInvitesCount})
                    </button>
                    <button
                      onClick={() => setInviteStatusFilter('accepted')}
                      className={`text-xs px-3 py-1.5 rounded-full transition-colors min-h-[32px] ${inviteStatusFilter === 'accepted' ? 'bg-success text-success-foreground' : 'bg-success/10 health-good hover:opacity-80'}`}
                    >
                      مقبولة ({acceptedInvitesCount})
                    </button>
                  </div>
                </div>

                {/* Grouped by email */}
                <div className="space-y-3">
                  {Object.entries(groupedInvites).map(([email, emailInvites]) => (
                    <div key={email} className="rounded-lg border border-border/50 overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-sm font-medium" dir="ltr">{email}</span>
                          <Badge variant="outline" className="text-xs">{emailInvites.length} دعوة</Badge>
                        </div>
                      </div>
                      <div className="divide-y divide-border/30">
                        {emailInvites.map((invite) => {
                          const statusConf = inviteStatusConfig[invite.status] || inviteStatusConfig.pending;
                          const StatusIcon = statusConf.icon;
                          const delivery = inviteDeliveryStatus[`invite:${invite.id}`] || inviteDeliveryStatus[`email:${invite.email.toLowerCase()}`];
                          const deliveryConf = delivery ? (deliveryStatusConfig[delivery.status] || deliveryStatusConfig.failed) : null;
                          const DeliveryIcon = deliveryConf?.icon;
                          return (
                            <div key={invite.id} className="flex items-center justify-between px-3 py-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge variant="outline" className="text-xs">{roleLabels[invite.role]}</Badge>
                                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${statusConf.className}`}>
                                    <StatusIcon className="w-3 h-3" />
                                    {statusConf.label}
                                  </span>
                                  {deliveryConf && DeliveryIcon && (
                                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${deliveryConf.className}`}>
                                      <DeliveryIcon className="w-3 h-3" />
                                      {deliveryConf.label}
                                    </span>
                                  )}
                                  <span className="text-xs text-muted-foreground">
                                    {scopeLabels[invite.scopeType]}: {getScopeName(invite.scopeType, invite.scopeId)}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {formatDate(invite.createdAt)}
                                  </span>
                                </div>
                                {delivery?.errorMessage && (
                                  <p className="text-[11px] text-destructive mt-1 truncate">
                                    سبب الفشل: {delivery.errorMessage}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {invite.status !== 'accepted' && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 gap-1 text-xs"
                                    disabled={resendingInviteId === invite.id}
                                    onClick={() => resendInvite(invite)}
                                  >
                                    <RefreshCw className={`w-3.5 h-3.5 ${resendingInviteId === invite.id ? 'animate-spin' : ''}`} />
                                    إعادة إرسال
                                  </Button>
                                )}
                                {invite.status !== 'accepted' && (
                                  <ConfirmDeleteDialog
                                    title="حذف الدعوة"
                                    description={`هل تريد حذف الدعوة المرسلة إلى ${invite.email}؟`}
                                    onConfirm={() => deleteInvite(invite.id)}
                                  />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {Object.keys(groupedInvites).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">لا توجد دعوات تطابق البحث</p>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </motion.div>
        }

        {/* Current Users */}
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
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="بحث بالإيميل أو الاسم..."
              value={userSearchQuery}
              onChange={(e) => setUserSearchQuery(e.target.value)}
              className="pr-9 h-9 text-sm"
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              {filteredProfiles.map((profile) => {
                const userRoles = allRoles.filter((r) => r.userId === profile.id);
                const isSelf = profile.id === user?.id;
                const targetIsOwner = userRoles.some(r => r.role === 'owner' && r.scopeType === 'system');
                const canDeleteUser = !isSelf && (!targetIsOwner || isOwner);
                return (
                  <div key={profile.id} className="p-4 rounded-lg border border-border/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium text-sm" dir="ltr">{profile.email}</span>
                        {profile.fullName && (
                          <span className="text-xs text-muted-foreground mr-2">({profile.fullName})</span>
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
                            onConfirm={() => deleteUser(profile.id)}
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
                              — {getScopeName(role.scopeType, role.scopeId)}
                            </span>
                            {!(role.role === 'owner') && !(role.role === 'admin' && role.userId === user?.id) && (
                              <ConfirmDeleteDialog
                                title="إزالة الصلاحية"
                                description="هل تريد إزالة هذه الصلاحية من المستخدم؟"
                                onConfirm={() => deleteRole(role.id)}
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
      </div>
    </AppLayout>
  );
}
