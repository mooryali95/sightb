import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { useStore } from '@/store/useStore';
import { useShallow } from 'zustand/react/shallow';
import { describeRoles, strongestRole, ROLE_LABELS } from '@/lib/settings-access';
import { GeneralSettings } from './settings/GeneralSettings';
import { ToolsSection } from './settings/ToolsSection';
import { PermissionsSection } from './settings/PermissionsSection';
import { PoliciesSection } from './settings/PoliciesSection';

/**
 * Settings and administration. Everyone gets their display settings and a
 * read-out of their own access; the admin and owner tools appear only to
 * the roles their own pages already admit. Nothing here grants or changes a
 * role: roles are changed in user management, under its own checks.
 */
export default function Settings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { roles, isAdmin, isOwner, loading } = useRole();
  const { companies, projects } = useStore(useShallow((s) => ({ companies: s.companies, projects: s.projects })));

  const lines = useMemo(() => describeRoles(roles, {
    company: (id) => companies.find((c) => c.id === id)?.name,
    project: (id) => projects.find((p) => p.id === id)?.name,
  }), [roles, companies, projects]);
  const strongest = strongestRole(roles);
  const initial = (user?.email ?? '?').charAt(0).toUpperCase();

  return (
    <AppLayout>
      <PageHeader
        eyebrow="الإدارة"
        title="الإعدادات"
        subtitle="تفضيلاتك، وصلاحياتك، والأدوات المتاحة لدورك في مكان واحد"
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
        <div className="space-y-6 min-w-0 stagger-in">
          <GeneralSettings />
          <ToolsSection access={{ isAdmin, isOwner }} loading={loading} />
          <PermissionsSection lines={lines} strongest={strongest} loading={loading} />
          <PoliciesSection />
        </div>

        <aside className="lg:sticky lg:top-20 space-y-4 pop-in" aria-label="حسابك">
          <div className="rounded-xl border border-border/70 bg-card shadow-card overflow-hidden">
            <div className="h-16 gradient-gold-soft" aria-hidden="true" />
            <div className="px-5 pb-5 -mt-8">
              <div className="w-16 h-16 rounded-2xl bg-primary text-primary-foreground text-2xl font-bold flex items-center justify-center shadow-card ring-4 ring-card" aria-hidden="true">{initial}</div>
              <p className="mt-3 text-sm font-semibold text-foreground truncate" dir="ltr">{user?.email}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {loading ? 'جاري التحقق من الدور…' : strongest ? `الدور: ${ROLE_LABELS[strongest]}` : 'بلا دور بعد'}
              </p>
              <Button variant="outline" className="w-full mt-4 gap-2" onClick={() => navigate('/security')}>
                <KeyRound className="w-4 h-4" aria-hidden="true" /> الأمان ومفاتيح الدخول
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground px-1 leading-relaxed">
            هذه الصفحة لا تمنح أي صلاحية ولا تغيّرها. الأدوار تُدار من «إدارة المستخدمين»، وكل صفحة تتحقق من دورك بنفسها.
          </p>
        </aside>
      </div>
    </AppLayout>
  );
}
