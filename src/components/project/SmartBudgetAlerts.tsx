import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  generateSmartAlerts,
  type SmartAlert,
  type SmartAlertContext,
  type SmartAlertSeverity,
} from '@/lib/finance';
import { AlertTriangle, AlertCircle, Info, ChevronDown, ChevronUp, ShieldCheck, ArrowLeft } from 'lucide-react';

interface SmartBudgetAlertsProps extends SmartAlertContext {
  onNavigate?: (tabKey: string) => void;
}

const SEV_META: Record<SmartAlertSeverity, { label: string; icon: typeof AlertTriangle; bg: string; text: string; ring: string; dot: string }> = {
  critical: { label: 'حرج',     icon: AlertTriangle, bg: 'bg-destructive/10',       text: 'text-destructive',     ring: 'border-destructive/30',     dot: 'bg-destructive' },
  warning:  { label: 'تحذير',   icon: AlertCircle,   bg: 'bg-warning/10',   text: 'text-warning', ring: 'border-warning/30', dot: 'bg-warning' },
  info:     { label: 'تنبيه',   icon: Info,          bg: 'bg-info/10',     text: 'text-info',   ring: 'border-info/30',   dot: 'bg-info' },
};

export function SmartBudgetAlerts({ onNavigate, ...ctx }: SmartBudgetAlertsProps) {
  const alerts = useMemo(() => generateSmartAlerts(ctx), [ctx]);
  const [filter, setFilter] = useState<SmartAlertSeverity | 'all'>('all');
  const [collapsed, setCollapsed] = useState(false);

  const counts = useMemo(() => ({
    all: alerts.length,
    critical: alerts.filter(a => a.severity === 'critical').length,
    warning: alerts.filter(a => a.severity === 'warning').length,
    info: alerts.filter(a => a.severity === 'info').length,
  }), [alerts]);

  if (alerts.length === 0) {
    return (
      <div className="stat-card border-success/30 bg-success/10">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-5 h-5 text-success" />
          <div>
            <p className="text-sm font-semibold text-success">المشروع ضمن الحدود الصحية</p>
            <p className="text-xs text-muted-foreground">لا توجد تنبيهات مالية أو إدارية تستوجب الانتباه حالياً</p>
          </div>
        </div>
      </div>
    );
  }

  const filtered = filter === 'all' ? alerts : alerts.filter(a => a.severity === filter);

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-warning" />
          <h3 className="text-sm font-semibold">التنبيهات الذكية</h3>
          <Badge variant="secondary" className="text-xs h-5">{alerts.length}</Badge>
        </div>
        <div className="flex items-center gap-1">
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label="الكل" count={counts.all} />
          <FilterChip active={filter === 'critical'} onClick={() => setFilter('critical')} label="حرج" count={counts.critical} sev="critical" />
          <FilterChip active={filter === 'warning'} onClick={() => setFilter('warning')} label="تحذير" count={counts.warning} sev="warning" />
          <FilterChip active={filter === 'info'} onClick={() => setFilter('info')} label="تنبيه" count={counts.info} sev="info" />
          <Button variant="ghost" size="icon" title={collapsed ? 'إظهار التنبيهات' : 'إخفاء التنبيهات'} aria-expanded={!collapsed} className="h-7 w-7" onClick={() => setCollapsed(c => !c)}>
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {filtered.map((alert) => (
                <AlertItem key={alert.id} alert={alert} onNavigate={onNavigate} />
              ))}
            </div>
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-3">لا توجد تنبيهات في هذا التصنيف</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FilterChip({ active, onClick, label, count, sev }: {
  active: boolean; onClick: () => void; label: string; count: number; sev?: SmartAlertSeverity;
}) {
  if (count === 0 && sev) return null;
  const meta = sev ? SEV_META[sev] : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors',
        active ? 'bg-primary text-primary-foreground' : 'bg-muted/60 text-muted-foreground hover:bg-muted',
      )}
    >
      {meta && <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} />}
      {label}
      <span className={cn('text-xs', active ? 'opacity-90' : 'opacity-70')}>({count})</span>
    </button>
  );
}

function AlertItem({ alert, onNavigate }: { alert: SmartAlert; onNavigate?: (tab: string) => void }) {
  const meta = SEV_META[alert.severity];
  const Icon = meta.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('p-2.5 rounded-lg border flex items-start gap-2.5', meta.bg, meta.ring)}
    >
      <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', meta.text)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className={cn('text-xs font-bold', meta.text)}>{alert.title}</p>
          {alert.metric && (
            <span className={cn('text-xs font-mono font-bold px-1.5 py-0.5 rounded', meta.bg, meta.text)}>
              {alert.metric}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{alert.message}</p>
        {alert.targetTab && onNavigate && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 mt-1.5 text-xs gap-1"
            onClick={() => onNavigate(alert.targetTab!)}
          >
            {alert.actionLabel || 'انتقل'}
            <ArrowLeft className="w-3 h-3" />
          </Button>
        )}
      </div>
    </motion.div>
  );
}
