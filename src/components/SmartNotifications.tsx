import { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { getProjectSummary } from '@/lib/finance';
import { Bell, AlertTriangle, Clock, TrendingDown, ShieldAlert, X, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface Notification {
  id: string;
  type: string;
  title: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
  link: string;
}

const STORAGE_KEY = 'sightb_read_notifications';

function getRead(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')); }
  catch { return new Set(); }
}

function persistRead(s: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...s].slice(-200)));
}

export function SmartNotifications() {
  const { projects, budgetItems, expenses, revenues, changeOrders, milestones, risks } = useStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(getRead());

  const all = useMemo(() => {
    const items: Notification[] = [];
    for (const p of projects) {
      if (['completed', 'archived', 'cancelled'].includes(p.status)) continue;
      const pB = budgetItems.filter(b => b.projectId === p.id);
      const pE = expenses.filter(e => e.projectId === p.id);
      const pR = revenues.filter(r => r.projectId === p.id);
      const pC = changeOrders.filter(c => c.projectId === p.id);
      const s = getProjectSummary(p, pB, pE, pR, pC);
      const util = s.totalPlanned > 0 ? (s.totalActual / s.totalPlanned) * 100 : 0;

      if (util > 100)
        items.push({ id: `bo-${p.id}`, type: 'budget', severity: 'critical', title: `تجاوز الميزانية: ${p.name}`, description: `${util.toFixed(0)}% من الموازنة`, link: `/project/${p.id}` });
      else if (util > 90)
        items.push({ id: `bw-${p.id}`, type: 'budget', severity: 'warning', title: `قارب الميزانية: ${p.name}`, description: `${util.toFixed(0)}%`, link: `/project/${p.id}` });

      const pending = pE.filter(e => (e as any).approvalStatus === 'pending').length;
      if (pending > 0)
        items.push({ id: `pe-${p.id}`, type: 'approval', severity: 'warning', title: `${pending} مصروف بانتظار الاعتماد`, description: p.name, link: `/project/${p.id}` });

      const pendingCO = pC.filter(c => c.status === 'proposed').length;
      if (pendingCO > 0)
        items.push({ id: `pc-${p.id}`, type: 'approval', severity: 'info', title: `${pendingCO} أمر تغيير مقترح`, description: p.name, link: `/project/${p.id}` });

      const delayed = milestones.filter(m => m.projectId === p.id && m.status === 'delayed').length;
      if (delayed > 0)
        items.push({ id: `dm-${p.id}`, type: 'milestone', severity: 'warning', title: `${delayed} مرحلة متأخرة`, description: p.name, link: `/project/${p.id}` });

      if (p.endDate && new Date(p.endDate) < new Date() && p.percentComplete < 100)
        items.push({ id: `od-${p.id}`, type: 'deadline', severity: 'critical', title: `تجاوز الموعد: ${p.name}`, description: 'تجاوز تاريخ الانتهاء', link: `/project/${p.id}` });

      const hr = risks.filter(r => r.projectId === p.id && r.status === 'open' && (r.impact === 'high' || r.impact === 'very_high')).length;
      if (hr > 0)
        items.push({ id: `hr-${p.id}`, type: 'risk', severity: 'warning', title: `${hr} خطر عالي`, description: p.name, link: `/project/${p.id}` });
    }
    return items.sort((a, b) =>
      ({ critical: 0, warning: 1, info: 2 }[a.severity]) - ({ critical: 0, warning: 1, info: 2 }[b.severity])
    );
  }, [projects, budgetItems, expenses, revenues, changeOrders, milestones, risks]);

  const active = all.filter(n => !readIds.has(n.id));
  const critCount = active.filter(n => n.severity === 'critical').length;

  const handleDismiss = useCallback((id: string) => {
    const s = getRead(); s.add(id); persistRead(s); setReadIds(new Set(s));
  }, []);

  const handleDismissAll = useCallback(() => {
    const s = getRead(); active.forEach(n => s.add(n.id)); persistRead(s); setReadIds(new Set(s));
  }, [active]);

  const icons: Record<string, typeof Bell> = {
    budget: TrendingDown, milestone: Clock, deadline: AlertTriangle,
    risk: ShieldAlert, approval: Receipt,
  };
  const colors: Record<string, string> = {
    critical: 'text-destructive bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    warning: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
    info: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8">
          <Bell className="w-4 h-4" />
          {active.length > 0 && (
            <span className={cn(
              'absolute -top-0.5 -left-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white',
              critCount > 0 ? 'bg-destructive' : 'bg-amber-500'
            )}>{active.length}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold">الإشعارات {active.length > 0 && <span className="text-muted-foreground">· {active.length}</span>}</h4>
          </div>
          {active.length > 0 && (
            <Button variant="ghost" size="sm" className="text-[10px] h-6 px-2" onClick={handleDismissAll}>
              قراءة الكل
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-[360px]">
          {active.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">لا توجد إشعارات جديدة ✓</p>
          ) : (
            <div className="p-1">
              {active.map(n => {
                const Icon = icons[n.type] || Bell;
                return (
                  <div key={n.id} className={cn('flex items-start gap-2 p-2 rounded-lg border mb-1', colors[n.severity])}>
                    <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <button onClick={() => { setOpen(false); navigate(n.link); }} className="flex-1 text-right">
                      <p className="text-xs font-medium">{n.title}</p>
                      <p className="text-[10px] opacity-70">{n.description}</p>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleDismiss(n.id); }}
                      className="shrink-0 opacity-40 hover:opacity-100 transition-opacity">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
