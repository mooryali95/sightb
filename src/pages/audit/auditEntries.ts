import type { ComponentType } from 'react';
import { Building2, FolderKanban, Briefcase, Shield, Mail, Plus, Pencil, Trash2 } from 'lucide-react';
import type { SystemAuditEntry } from '@/services/auditService';

/**
 * What the audit trigger records for an entry: a loose bag of fields, of
 * which the page names the ones it renders. Anything else stays unknown.
 */
export interface AuditDetails {
  target_email?: string; role?: string; old_role?: string; new_role?: string; scope_type?: string;
  invited_email?: string; old_status?: string; new_status?: string; name?: string;
  old?: Record<string, unknown>; new?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AuditEntry extends Omit<SystemAuditEntry, 'details'> {
  details: AuditDetails | null;
}

export interface KindConfig {
  label: string;
  icon: ComponentType<{ className?: string }>;
  color: string;
}

export const ENTITY_TYPES: Record<string, KindConfig> = {
  company: { label: 'شركة', icon: Building2, color: 'bg-primary/10 text-primary' },
  portfolio: { label: 'محفظة', icon: FolderKanban, color: 'bg-accent/15 text-accent-foreground' },
  project: { label: 'مشروع', icon: Briefcase, color: 'bg-success/10 health-good' },
  user_role: { label: 'صلاحية', icon: Shield, color: 'bg-warning/10 health-warning' },
  user_invite: { label: 'دعوة', icon: Mail, color: 'bg-muted text-muted-foreground' },
};

export const ACTIONS: Record<string, KindConfig> = {
  insert: { label: 'إضافة', icon: Plus, color: 'health-good' },
  update: { label: 'تعديل', icon: Pencil, color: 'health-warning' },
  delete: { label: 'حذف', icon: Trash2, color: 'text-destructive' },
};

const ROLE_LABELS: Record<string, string> = { owner: 'مالك', admin: 'أدمن', editor: 'محرر', viewer: 'مشاهد' };
const SCOPE_LABELS: Record<string, string> = { system: 'النظام', company: 'شركة', project: 'مشروع' };

/** The trigger writes a JSON bag; the page names the fields it renders. */
export function toAuditEntry(row: SystemAuditEntry): AuditEntry {
  return { ...row, details: (row.details ?? null) as AuditDetails | null };
}

export interface AuditFilter {
  entityType: string;
  action: string;
  query: string;
}

export const NO_FILTER: AuditFilter = { entityType: 'all', action: 'all', query: '' };

export function isFiltered(f: AuditFilter): boolean {
  return f.query.trim() !== '' || f.entityType !== 'all' || f.action !== 'all';
}

/** Entries narrowed by kind, by action, and by a query over the actor, the name and the details. */
export function filterEntries(entries: AuditEntry[], f: AuditFilter): AuditEntry[] {
  let result = entries;
  if (f.entityType !== 'all') result = result.filter((e) => e.entityType === f.entityType);
  if (f.action !== 'all') result = result.filter((e) => e.action === f.action);
  const q = f.query.trim().toLowerCase();
  if (q) {
    result = result.filter((e) =>
      (e.userEmail && e.userEmail.toLowerCase().includes(q)) ||
      (e.entityName && e.entityName.toLowerCase().includes(q)) ||
      JSON.stringify(e.details).toLowerCase().includes(q),
    );
  }
  return result;
}

export function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('ar-SA', { calendar: 'gregory', year: 'numeric', month: 'long', day: 'numeric' });
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
}

/** Entries grouped under their day label, in the order they arrive. */
export function groupByDay(entries: AuditEntry[]): [string, AuditEntry[]][] {
  const groups = new Map<string, AuditEntry[]>();
  for (const entry of entries) {
    const date = dayLabel(entry.createdAt);
    const list = groups.get(date);
    if (list) list.push(entry);
    else groups.set(date, [entry]);
  }
  return Array.from(groups.entries());
}

/** One line describing what the entry recorded, or null when there is nothing to say. */
export function describeDetails(entry: AuditEntry): string | null {
  const d = entry.details;
  if (!d || Object.keys(d).length === 0) return null;

  if (entry.entityType === 'user_role') {
    const parts: string[] = [];
    if (d.target_email) parts.push(d.target_email);
    if (d.role) parts.push(ROLE_LABELS[d.role] || d.role);
    if (d.old_role && d.new_role) parts.push(`${ROLE_LABELS[d.old_role] || d.old_role} → ${ROLE_LABELS[d.new_role] || d.new_role}`);
    if (d.scope_type) parts.push(SCOPE_LABELS[d.scope_type] || d.scope_type);
    return parts.join(' • ');
  }

  if (entry.entityType === 'user_invite') {
    const parts: string[] = [];
    if (d.invited_email) parts.push(d.invited_email);
    if (d.role) parts.push(ROLE_LABELS[d.role] || d.role);
    if (d.new_status) parts.push(d.old_status + ' → ' + d.new_status);
    return parts.join(' • ');
  }

  if (entry.action === 'update' && d.old && d.new) {
    const changes: string[] = [];
    for (const key of Object.keys(d.new)) {
      if (d.old[key] !== d.new[key]) changes.push(`${key}: ${d.old[key]} → ${d.new[key]}`);
    }
    if (changes.length > 0) return changes.join(' • ');
  }

  if (d.name) return d.name;
  return null;
}
