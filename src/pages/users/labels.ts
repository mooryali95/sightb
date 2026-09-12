/**
 * The row shapes the user-management page works with, and the labels and
 * badges it renders them with.
 */
import { Shield, Eye, Pencil, Mail, CheckCircle2, Clock, AlertCircle, Crown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface Profile {
  id: string;
  email: string;
  fullName: string;
  status: string;
}

export interface Invite {
  id: string;
  email: string;
  role: string;
  scopeType: string;
  scopeId: string | null;
  status: string;
  createdAt: string;
}

export interface InviteDeliveryStatus {
  inviteId: string | null;
  email: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
}

export interface RoleEntry {
  id: string;
  userId: string;
  role: string;
  scopeType: string;
  scopeId: string | null;
}

export const roleLabels: Record<string, string> = { owner: 'مالك', admin: 'أدمن', editor: 'محرر', viewer: 'مشاهد' };
export const roleIcons: Record<string, LucideIcon> = { owner: Crown, admin: Shield, editor: Pencil, viewer: Eye };
export const scopeLabels: Record<string, string> = { system: 'النظام', company: 'شركة', project: 'مشروع' };

export const inviteStatusConfig: Record<string, { label: string; icon: LucideIcon; className: string }> = {
  pending: { label: 'قيد المعالجة', icon: Clock, className: 'bg-muted text-muted-foreground' },
  sent: { label: 'تم الإرسال', icon: Mail, className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  accepted: { label: 'مقبولة ومسجّل', icon: CheckCircle2, className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  failed: { label: 'فشل الإرسال', icon: AlertCircle, className: 'bg-destructive/10 text-destructive' },
};

export const deliveryStatusConfig: Record<string, { label: string; icon: LucideIcon; className: string }> = {
  pending: { label: 'البريد بانتظار الإرسال', icon: Clock, className: 'bg-muted text-muted-foreground' },
  sent: { label: 'البريد أُرسل', icon: Mail, className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  failed: { label: 'البريد فشل', icon: AlertCircle, className: 'bg-destructive/10 text-destructive' },
  dlq: { label: 'البريد فشل نهائياً', icon: AlertCircle, className: 'bg-destructive/10 text-destructive' },
};

export const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('ar-SA', { calendar: 'gregory', year: 'numeric', month: 'short', day: 'numeric' });
};
