import { useState, useEffect, useMemo } from 'react';
import { listSystemAuditEntries } from '@/services/auditService';
import { useRole } from '@/hooks/useRole';
import { AppLayout } from '@/components/AppLayout';
import { Navigate } from 'react-router-dom';
import { ScrollText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { NO_FILTER, filterEntries, groupByDay, isFiltered, toAuditEntry, type AuditEntry, type AuditFilter } from './audit/auditEntries';
import { AuditFilters } from './audit/AuditFilters';
import { AuditEntryCard } from './audit/AuditEntryCard';

export default function SystemAuditLog() {
  const { isOwner, loading: roleLoading } = useRole();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<AuditFilter>(NO_FILTER);

  useEffect(() => {
    if (!isOwner || roleLoading) return;
    let cancelled = false;
    setLoading(true);
    listSystemAuditEntries(500)
      .then((rows) => { if (!cancelled) setEntries(rows.map(toAuditEntry)); })
      .catch(() => { if (!cancelled) setEntries([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isOwner, roleLoading]);

  const filtered = useMemo(() => filterEntries(entries, filter), [entries, filter]);
  const groups = useMemo(() => groupByDay(filtered), [filtered]);

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
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <ScrollText className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">السجل الرئيسي</h1>
            <p className="text-sm text-muted-foreground">تتبع جميع التغييرات على الشركات والمحافظ والمشاريع والصلاحيات</p>
          </div>
        </div>

        <AuditFilters filter={filter} onChange={setFilter} count={filtered.length} />

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <ScrollText className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">لا توجد سجلات {isFiltered(filter) ? 'تطابق البحث' : 'بعد'}</p>
            </div>
          ) : (
            <div className="space-y-6">
              {groups.map(([date, dateEntries]) => (
                <div key={date}>
                  <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm py-2 mb-3">
                    <span className="text-xs font-semibold text-muted-foreground bg-muted px-3 py-1 rounded-full">{date}</span>
                  </div>
                  <div className="space-y-2">
                    <AnimatePresence>
                      {dateEntries.map((entry, idx) => <AuditEntryCard key={entry.id} entry={entry} index={idx} />)}
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
