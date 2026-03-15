import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRole } from '@/hooks/useRole';
import { AppLayout } from '@/components/AppLayout';
import { Navigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ScrollText, Search, Building2, FolderKanban, Briefcase, Shield, 
  Mail, Plus, Pencil, Trash2, ArrowDownUp, Filter, Crown
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface AuditEntry {
  id: string;
  userId: string;
  userEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  entityName: string | null;
  details: any;
  createdAt: string;
}

const entityTypeConfig: Record<string, { label: string; icon: any; color: string }> = {
  company: { label: 'شركة', icon: Building2, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  portfolio: { label: 'محفظة', icon: FolderKanban, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  project: { label: 'مشروع', icon: Briefcase, color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  user_role: { label: 'صلاحية', icon: Shield, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  user_invite: { label: 'دعوة', icon: Mail, color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400' },
};

const actionConfig: Record<string, { label: string; icon: any; color: string }> = {
  insert: { label: 'إضافة', icon: Plus, color: 'text-emerald-600 dark:text-emerald-400' },
  update: { label: 'تعديل', icon: Pencil, color: 'text-amber-600 dark:text-amber-400' },
  delete: { label: 'حذف', icon: Trash2, color: 'text-destructive' },
};

const roleLabels: Record<string, string> = { owner: 'مالك', admin: 'أدمن', editor: 'محرر', viewer: 'مشاهد' };
const scopeLabels: Record<string, string> = { system: 'النظام', company: 'شركة', project: 'مشروع' };

export default function SystemAuditLog() {
  const { isOwner, loading: roleLoading } = useRole();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');

  useEffect(() => {
    if (!isOwner || roleLoading) return;
    loadEntries();
  }, [isOwner, roleLoading]);

  const loadEntries = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from('system_audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    setEntries(
      (data || []).map((e: any) => ({
        id: e.id,
        userId: e.user_id,
        userEmail: e.user_email,
        action: e.action,
        entityType: e.entity_type,
        entityId: e.entity_id,
        entityName: e.entity_name,
        details: e.details,
        createdAt: e.created_at,
      }))
    );
    setLoading(false);
  };

  const filtered = useMemo(() => {
    let result = entries;
    if (entityFilter !== 'all') {
      result = result.filter(e => e.entityType === entityFilter);
    }
    if (actionFilter !== 'all') {
      result = result.filter(e => e.action === actionFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(e =>
        (e.userEmail && e.userEmail.toLowerCase().includes(q)) ||
        (e.entityName && e.entityName.toLowerCase().includes(q)) ||
        JSON.stringify(e.details).toLowerCase().includes(q)
      );
    }
    return result;
  }, [entries, entityFilter, actionFilter, searchQuery]);

  // Group by date
  const groupedByDate = useMemo(() => {
    const groups: Record<string, AuditEntry[]> = {};
    for (const entry of filtered) {
      const date = new Date(entry.createdAt).toLocaleDateString('ar-SA', {
        calendar: 'gregory', year: 'numeric', month: 'long', day: 'numeric',
      });
      if (!groups[date]) groups[date] = [];
      groups[date].push(entry);
    }
    return groups;
  }, [filtered]);

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('ar-SA', {
      hour: '2-digit', minute: '2-digit',
    });
  };

  const renderDetails = (entry: AuditEntry) => {
    const d = entry.details;
    if (!d || Object.keys(d).length === 0) return null;

    if (entry.entityType === 'user_role') {
      const parts: string[] = [];
      if (d.target_email) parts.push(d.target_email);
      if (d.role) parts.push(roleLabels[d.role] || d.role);
      if (d.old_role && d.new_role) parts.push(`${roleLabels[d.old_role] || d.old_role} → ${roleLabels[d.new_role] || d.new_role}`);
      if (d.scope_type) parts.push(scopeLabels[d.scope_type] || d.scope_type);
      return <span className="text-xs text-muted-foreground">{parts.join(' • ')}</span>;
    }

    if (entry.entityType === 'user_invite') {
      const parts: string[] = [];
      if (d.invited_email) parts.push(d.invited_email);
      if (d.role) parts.push(roleLabels[d.role] || d.role);
      if (d.new_status) parts.push(d.old_status + ' → ' + d.new_status);
      return <span className="text-xs text-muted-foreground">{parts.join(' • ')}</span>;
    }

    if (entry.action === 'update' && d.old && d.new) {
      const changes: string[] = [];
      for (const key of Object.keys(d.new)) {
        if (d.old[key] !== d.new[key]) {
          changes.push(`${key}: ${d.old[key]} → ${d.new[key]}`);
        }
      }
      if (changes.length > 0) {
        return <span className="text-xs text-muted-foreground">{changes.join(' • ')}</span>;
      }
    }

    if (d.name) {
      return <span className="text-xs text-muted-foreground">{d.name}</span>;
    }

    return null;
  };

  if (roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isOwner) return <Navigate to="/" replace />;

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <ScrollText className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">السجل الرئيسي</h1>
            <p className="text-sm text-muted-foreground">تتبع جميع التغييرات على الشركات والمحافظ والمشاريع والصلاحيات</p>
          </div>
        </div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="stat-card space-y-3"
        >
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="بحث بالإيميل أو الاسم أو التفاصيل..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-9 h-9 text-sm"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {/* Entity type filter */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              <button
                onClick={() => setEntityFilter('all')}
                className={`text-xs px-3 py-1 rounded-full transition-colors ${entityFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
              >
                الكل
              </button>
              {Object.entries(entityTypeConfig).map(([key, conf]) => {
                const Icon = conf.icon;
                return (
                  <button
                    key={key}
                    onClick={() => setEntityFilter(key)}
                    className={`text-xs px-3 py-1 rounded-full transition-colors inline-flex items-center gap-1 ${entityFilter === key ? conf.color + ' font-medium' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                  >
                    <Icon className="w-3 h-3" />
                    {conf.label}
                  </button>
                );
              })}
            </div>

            {/* Action filter */}
            <div className="flex items-center gap-1.5 mr-4 flex-wrap">
              <ArrowDownUp className="w-3.5 h-3.5 text-muted-foreground" />
              <button
                onClick={() => setActionFilter('all')}
                className={`text-xs px-3 py-1 rounded-full transition-colors ${actionFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
              >
                الكل
              </button>
              {Object.entries(actionConfig).map(([key, conf]) => {
                const Icon = conf.icon;
                return (
                  <button
                    key={key}
                    onClick={() => setActionFilter(key)}
                    className={`text-xs px-3 py-1 rounded-full transition-colors inline-flex items-center gap-1 ${actionFilter === key ? 'bg-foreground text-background font-medium' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                  >
                    <Icon className="w-3 h-3" />
                    {conf.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Badge variant="outline" className="text-[10px]">
              {filtered.length} سجل
            </Badge>
          </div>
        </motion.div>

        {/* Timeline */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <ScrollText className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">لا توجد سجلات {searchQuery || entityFilter !== 'all' || actionFilter !== 'all' ? 'تطابق البحث' : 'بعد'}</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedByDate).map(([date, dateEntries]) => (
                <div key={date}>
                  <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm py-2 mb-3">
                    <span className="text-xs font-semibold text-muted-foreground bg-muted px-3 py-1 rounded-full">
                      {date}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <AnimatePresence>
                      {dateEntries.map((entry, idx) => {
                        const entityConf = entityTypeConfig[entry.entityType] || entityTypeConfig.company;
                        const actConf = actionConfig[entry.action] || actionConfig.insert;
                        const EntityIcon = entityConf.icon;
                        const ActIcon = actConf.icon;

                        return (
                          <motion.div
                            key={entry.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.02 }}
                            className="flex gap-3 p-3 rounded-lg border border-border/50 hover:border-border transition-colors bg-card"
                          >
                            {/* Timeline dot */}
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${entityConf.color}`}>
                              <EntityIcon className="w-4 h-4" />
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`inline-flex items-center gap-1 text-xs font-medium ${actConf.color}`}>
                                  <ActIcon className="w-3 h-3" />
                                  {actConf.label}
                                </span>
                                <Badge variant="outline" className={`text-[10px] ${entityConf.color}`}>
                                  {entityConf.label}
                                </Badge>
                                {entry.entityName && (
                                  <span className="text-sm font-medium truncate">{entry.entityName}</span>
                                )}
                              </div>
                              {renderDetails(entry)}
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                <span dir="ltr">{entry.userEmail || 'نظام'}</span>
                                <span>•</span>
                                <span>{formatTime(entry.createdAt)}</span>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </AppLayout>
  );
}
