import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { getProjectSummary } from '@/lib/finance';
import { Bell, AlertTriangle, Clock, TrendingDown, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface Notification {
  id: string;
  type: 'budget' | 'milestone' | 'deadline' | 'risk';
  title: string;
  description: string;
  severity: 'warning' | 'critical';
  link: string;
}

export function SmartNotifications() {
  const { projects, budgetItems, expenses, revenues, changeOrders, milestones, risks } = useStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const notifications = useMemo<Notification[]>(() => {
    const items: Notification[] = [];

    // Budget overrun alerts
    for (const p of projects) {
      if (p.status === 'completed' || p.status === 'archived' || p.status === 'cancelled') continue;
      const pBud = budgetItems.filter(b => b.projectId === p.id);
      const pExp = expenses.filter(e => e.projectId === p.id);
      const pRev = revenues.filter(r => r.projectId === p.id);
      const pCO = changeOrders.filter(co => co.projectId === p.id);
      const s = getProjectSummary(p, pBud, pExp, pRev, pCO);

      if (s.totalPlanned > 0) {
        const utilization = (s.totalActual / s.totalPlanned) * 100;
        if (utilization >= 100) {
          items.push({
            id: `budget-100-${p.id}`, type: 'budget',
            title: `تجاوز الميزانية: ${p.name}`,
            description: `المصروفات تجاوزت الموازنة المخططة (${utilization.toFixed(0)}%)`,
            severity: 'critical', link: `/project/${p.id}`,
          });
        } else if (utilization >= 90) {
          items.push({
            id: `budget-90-${p.id}`, type: 'budget',
            title: `تحذير ميزانية: ${p.name}`,
            description: `المصروفات بلغت ${utilization.toFixed(0)}% من الموازنة`,
            severity: 'critical', link: `/project/${p.id}`,
          });
        } else if (utilization >= 80) {
          items.push({
            id: `budget-80-${p.id}`, type: 'budget',
            title: `ملاحظة ميزانية: ${p.name}`,
            description: `المصروفات بلغت ${utilization.toFixed(0)}% من الموازنة`,
            severity: 'warning', link: `/project/${p.id}`,
          });
        }
      }
    }

    // Delayed milestones
    const now = new Date();
    for (const m of milestones) {
      if (m.status === 'completed') continue;
      if (m.status === 'delayed') {
        items.push({
          id: `milestone-delayed-${m.id}`, type: 'milestone',
          title: `معلم متأخر: ${m.name}`,
          description: `المعلم في حالة تأخر`,
          severity: 'critical', link: `/project/${m.projectId}`,
        });
      } else if (m.plannedEnd) {
        const end = new Date(m.plannedEnd);
        if (end < now && m.percentComplete < 100) {
          items.push({
            id: `milestone-overdue-${m.id}`, type: 'milestone',
            title: `معلم تجاوز الموعد: ${m.name}`,
            description: `كان مخططاً للانتهاء في ${m.plannedEnd}`,
            severity: 'critical', link: `/project/${m.projectId}`,
          });
        }
      }
    }

    // Projects nearing deadline
    for (const p of projects) {
      if (p.status === 'completed' || p.status === 'archived' || p.status === 'cancelled') continue;
      if (p.endDate) {
        const end = new Date(p.endDate);
        const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysLeft <= 0) {
          items.push({
            id: `deadline-passed-${p.id}`, type: 'deadline',
            title: `تجاوز الموعد: ${p.name}`,
            description: `تجاوز تاريخ الانتهاء المخطط`,
            severity: 'critical', link: `/project/${p.id}`,
          });
        } else if (daysLeft <= 30) {
          items.push({
            id: `deadline-near-${p.id}`, type: 'deadline',
            title: `اقتراب الانتهاء: ${p.name}`,
            description: `متبقي ${daysLeft} يوم على الموعد النهائي`,
            severity: 'warning', link: `/project/${p.id}`,
          });
        }
      }
    }

    // High/Very-high open risks
    for (const r of risks) {
      if (r.status !== 'open' && r.status !== 'mitigating') continue;
      if (r.probability === 'high' || r.probability === 'very_high') {
        items.push({
          id: `risk-${r.id}`, type: 'risk',
          title: `خطر مرتفع: ${r.title}`,
          description: r.description?.slice(0, 80) || 'بدون وصف',
          severity: r.probability === 'very_high' ? 'critical' : 'warning',
          link: r.projectId ? `/project/${r.projectId}` : '/',
        });
      }
    }

    // Sort critical first
    return items.sort((a, b) => (a.severity === 'critical' ? -1 : 1) - (b.severity === 'critical' ? -1 : 1));
  }, [projects, budgetItems, expenses, revenues, changeOrders, milestones, risks]);

  const criticalCount = notifications.filter(n => n.severity === 'critical').length;

  const iconMap = {
    budget: TrendingDown,
    milestone: Clock,
    deadline: AlertTriangle,
    risk: ShieldAlert,
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8">
          <Bell className="w-4 h-4" />
          {notifications.length > 0 && (
            <span className={cn(
              'absolute -top-0.5 -left-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white',
              criticalCount > 0 ? 'bg-destructive' : 'bg-amber-500'
            )}>
              {notifications.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-3 border-b border-border">
          <h4 className="text-sm font-semibold">التنبيهات</h4>
          <p className="text-xs text-muted-foreground">
            {notifications.length === 0 ? 'لا توجد تنبيهات' : `${notifications.length} تنبيه${criticalCount > 0 ? ` · ${criticalCount} حرج` : ''}`}
          </p>
        </div>
        <ScrollArea className="max-h-[360px]">
          {notifications.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              ✓ لا توجد مشاكل حالياً
            </div>
          ) : (
            <div className="p-1">
              {notifications.map((n) => {
                const Icon = iconMap[n.type];
                return (
                  <button
                    key={n.id}
                    onClick={() => { setOpen(false); navigate(n.link); }}
                    className="w-full flex items-start gap-2.5 p-2.5 rounded-lg text-right hover:bg-muted/50 transition-colors"
                  >
                    <div className={cn(
                      'mt-0.5 p-1 rounded-md shrink-0',
                      n.severity === 'critical' ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/10 text-amber-600'
                    )}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium leading-tight">{n.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{n.description}</p>
                    </div>
                    <Badge variant={n.severity === 'critical' ? 'destructive' : 'secondary'} className="text-[9px] shrink-0">
                      {n.severity === 'critical' ? 'حرج' : 'تحذير'}
                    </Badge>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
