import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/finance';
import {
  listConsistencyAlerts, dismissConsistencyAlert, clearConsistencyAlerts,
  type ConsistencyAlert,
} from '@/lib/consistency-alerts';
import { BellRing, CheckCircle2, AlertTriangle, Search, Trash2 } from 'lucide-react';

const DIM_LABELS: Record<ConsistencyAlert['dimension'], string> = {
  resource: 'حسب المورد',
  category: 'حسب الفئة',
};

const fmtDate = (iso: string) => new Date(iso).toLocaleString('en-GB', { hour12: false });

/** مركز التنبيهات: سجل اختلافات اتساق الصرف (قبل/بعد) لكل مشروع مع تاريخ الاكتشاف. */
export default function AlertsCenter() {
  const [alerts, setAlerts] = useState<ConsistencyAlert[]>([]);
  const [query, setQuery] = useState('');
  const [showResolved, setShowResolved] = useState(false);

  const reload = () => setAlerts(listConsistencyAlerts());
  useEffect(() => { reload(); }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return alerts.filter((a) => {
      if (!showResolved && a.resolvedAt) return false;
      if (!q) return true;
      return `${a.projectName} ${a.topGroups.map((g) => g.label).join(' ')}`.toLowerCase().includes(q);
    });
  }, [alerts, query, showResolved]);

  const openCount = alerts.filter((a) => !a.resolvedAt).length;

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <BellRing className="w-5 h-5 text-primary" />مركز التنبيهات
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              اختلافات اتساق الصرف (قبل/بعد الإصلاح) المرصودة تلقائياً لكل مشروع مع تاريخ الاكتشاف.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={openCount > 0 ? 'destructive' : 'outline'}>
              {openCount > 0 ? `${openCount} تنبيه مفتوح` : 'لا توجد تنبيهات مفتوحة'}
            </Badge>
            <Button size="sm" variant="outline" onClick={() => setShowResolved((v) => !v)}>
              {showResolved ? 'إخفاء المغلقة' : 'إظهار المغلقة'}
            </Button>
            {alerts.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="gap-1 text-destructive"
                onClick={() => { clearConsistencyAlerts(); reload(); }}
              >
                <Trash2 className="w-3.5 h-3.5" />مسح السجل
              </Button>
            )}
          </div>
        </div>

        <div className="relative max-w-sm">
          <Search className="w-3.5 h-3.5 absolute top-1/2 -translate-y-1/2 start-2 text-muted-foreground" />
          <Input className="ps-7" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="بحث باسم المشروع أو المورد…" />
        </div>

        {rows.length === 0 ? (
          <div className="stat-card text-center py-10 space-y-2">
            <CheckCircle2 className="w-8 h-8 mx-auto text-success" />
            <p className="text-sm text-muted-foreground">لا توجد تنبيهات اتساق مسجّلة.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((a) => (
              <div
                key={a.id}
                className={`stat-card space-y-2 ${a.resolvedAt ? 'opacity-60' : ''}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {a.resolvedAt
                      ? <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                      : <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />}
                    <Link to={`/project/${a.projectId}`} className="text-sm font-semibold hover:underline truncate">
                      {a.projectName || 'مشروع'}
                    </Link>
                    <Badge variant="outline" className="text-xs">{DIM_LABELS[a.dimension]}</Badge>
                  </div>
                  {!a.resolvedAt && (
                    <Button size="sm" variant="ghost" onClick={() => { dismissConsistencyAlert(a.id); reload(); }}>
                      تعليم كمُعالَج
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">فرق قبل/بعد</p>
                    <p className="font-mono font-semibold">{formatCurrency(a.totalGap)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">مصروفات بلا مصدر</p>
                    <p className="font-mono font-semibold">{formatCurrency(a.totalUnlinked)} ({a.unlinkedCount})</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">تاريخ الاكتشاف</p>
                    <p className="font-mono">{fmtDate(a.detectedAt)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">آخر رصد</p>
                    <p className="font-mono">{fmtDate(a.lastSeenAt)} · {a.seenCount}×</p>
                  </div>
                </div>

                {a.topGroups.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {a.topGroups.map((g) => (
                      <Badge key={g.key} variant="outline" className="text-xs font-mono">
                        {g.label}: {formatCurrency(g.gap)}
                      </Badge>
                    ))}
                  </div>
                )}

                {a.resolvedAt && (
                  <p className="text-xs text-muted-foreground">أُغلق في {fmtDate(a.resolvedAt)}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
