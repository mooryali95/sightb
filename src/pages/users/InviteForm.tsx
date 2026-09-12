/**
 * The invite form: an email, a role and a scope. A scoped invite must name
 * its company or project before it can be sent; the email goes out
 * lowercased; a system-wide invite carries a null scope.
 */
import { useState } from 'react';
import * as userService from '@/services/userService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { UserPlus } from 'lucide-react';
import { logger } from '@/lib/logger';
import { motion } from 'framer-motion';
import type { Company, Project } from '@/types/project';

interface Props {
  companies: Company[];
  projects: Project[];
  /** Called after a successful send, so the page can reload its lists. */
  onInvited: () => void;
}

export function InviteForm({ companies, projects, onInvited }: Props) {
  const [invEmail, setInvEmail] = useState('');
  const [invRole, setInvRole] = useState('viewer');
  const [invScopeType, setInvScopeType] = useState('system');
  const [invScopeId, setInvScopeId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invEmail.trim()) return;
    if (invScopeType !== 'system' && !invScopeId) {
      toast.error('يرجى اختيار النطاق');
      return;
    }
    setSubmitting(true);
    try {
      const data = await userService.sendInvite({
        email: invEmail.trim().toLowerCase(),
        role: invRole,
        scopeType: invScopeType,
        scopeId: invScopeType === 'system' ? null : invScopeId,
      });

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
      onInvited();
    } catch (err) {
      logger.capture('user-management.invite', err);
      toast.error('حدث خطأ، يرجى المحاولة مرة أخرى');
    } finally {
      setSubmitting(false);
    }
  };

  return (
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
  );
}
