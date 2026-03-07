import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { useStore } from '@/store/useStore';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { UserPlus, Trash2, Users, Shield, Eye, Pencil } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';

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

interface RoleEntry {
  id: string;
  userId: string;
  role: string;
  scopeType: string;
  scopeId: string | null;
}

const roleLabels: Record<string, string> = { admin: 'أدمن', editor: 'محرر', viewer: 'مشاهد' };
const roleIcons: Record<string, any> = { admin: Shield, editor: Pencil, viewer: Eye };
const scopeLabels: Record<string, string> = { system: 'النظام', company: 'شركة', project: 'مشروع' };

export default function UserManagement() {
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useRole();
  const { companies, projects } = useStore();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [allRoles, setAllRoles] = useState<RoleEntry[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);

  // Invite form
  const [invEmail, setInvEmail] = useState('');
  const [invRole, setInvRole] = useState('viewer');
  const [invScopeType, setInvScopeType] = useState('system');
  const [invScopeId, setInvScopeId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isAdmin || roleLoading) return;
    loadData();
  }, [isAdmin, roleLoading]);

  const loadData = async () => {
    setLoading(true);
    const [profilesRes, rolesRes, invitesRes] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('user_roles').select('*'),
      supabase.from('user_invites').select('*').order('created_at', { ascending: false }),
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
    setInvites(
      (invitesRes.data || []).map((i: any) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        scopeType: i.scope_type,
        scopeId: i.scope_id,
        status: i.status,
        createdAt: i.created_at,
      }))
    );
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
      const { error } = await supabase.from('user_invites').insert({
        email: invEmail.trim().toLowerCase(),
        role: invRole,
        scope_type: invScopeType,
        scope_id: invScopeType === 'system' ? null : invScopeId,
        invited_by: user!.id,
      });
      if (error) throw error;
      toast.success(`تمت دعوة ${invEmail} بنجاح`);
      setInvEmail('');
      setInvRole('viewer');
      setInvScopeType('system');
      setInvScopeId('');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'حدث خطأ');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteInvite = async (id: string) => {
    const { error } = await supabase.from('user_invites').delete().eq('id', id);
    if (error) toast.error('حدث خطأ');
    else loadData();
  };

  const deleteRole = async (id: string) => {
    const { error } = await supabase.from('user_roles').delete().eq('id', id);
    if (error) toast.error('حدث خطأ');
    else loadData();
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

        {/* Pending Invites */}
        {invites.filter((i) => i.status === 'pending').length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="stat-card"
          >
            <h2 className="text-lg font-semibold mb-4">الدعوات المعلقة</h2>
            <div className="space-y-3">
              {invites
                .filter((i) => i.status === 'pending')
                .map((invite) => (
                  <div key={invite.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium" dir="ltr">{invite.email}</span>
                      <Badge variant="outline">{roleLabels[invite.role]}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {scopeLabels[invite.scopeType]}: {getScopeName(invite.scopeType, invite.scopeId)}
                      </span>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => deleteInvite(invite.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))}
            </div>
          </motion.div>
        )}

        {/* Current Users */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="stat-card"
        >
          <h2 className="text-lg font-semibold mb-4">المستخدمون الحاليون</h2>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              {profiles.map((profile) => {
                const userRoles = allRoles.filter((r) => r.userId === profile.id);
                return (
                  <div key={profile.id} className="p-4 rounded-lg border border-border/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium text-sm" dir="ltr">{profile.email}</span>
                        {profile.fullName && (
                          <span className="text-xs text-muted-foreground mr-2">({profile.fullName})</span>
                        )}
                      </div>
                      <Badge variant={profile.status === 'active' ? 'default' : 'secondary'}>
                        {profile.status === 'active' ? 'نشط' : 'معلق'}
                      </Badge>
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
                            {!(role.role === 'admin' && role.userId === user?.id) && (
                              <button onClick={() => deleteRole(role.id)} className="text-destructive hover:text-destructive/80 mr-1">
                                <Trash2 className="w-3 h-3" />
                              </button>
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
            </div>
          )}
        </motion.div>
      </div>
    </AppLayout>
  );
}
