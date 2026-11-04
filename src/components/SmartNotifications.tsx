/**
 * The notification bell. What it says comes from notifications/
 * buildNotifications.ts; this file keeps the read state and the popover.
 */
import { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { Bell, AlertTriangle, Clock, TrendingDown, ShieldAlert, X, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import { buildNotifications, groupNotifications, TYPE_LABELS, type Notification } from './notifications/buildNotifications';

const STORAGE_KEY = 'sightb_read_notifications';

const ICONS: Record<string, typeof Bell> = {
  budget: TrendingDown, milestone: Clock, deadline: AlertTriangle,
  risk: ShieldAlert, approval: Receipt, advance: Clock,
};

const COLORS: Record<Notification['severity'], string> = {
  critical: 'text-destructive bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
  warning: 'text-warning bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
  info: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
};

function getRead(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')); }
  catch { return new Set(); }
}

function persistRead(s: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...s].slice(-200)));
}

export function SmartNotifications() {
  const { projects, budgetItems, expenses, revenues, changeOrders, milestones, risks, paymentRequests } = useStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(getRead());

  const all = useMemo(
    () => buildNotifications({ projects, budgetItems, expenses, revenues, changeOrders, milestones, risks, paymentRequests }),
    [projects, budgetItems, expenses, revenues, changeOrders, milestones, risks, paymentRequests],
  );

  const active = useMemo(() => all.filter(n => !readIds.has(n.id)), [all, readIds]);
  const critCount = active.filter(n => n.severity === 'critical').length;

  const grouped = useMemo(() => groupNotifications(active), [active]);

  const handleDismiss = useCallback((id: string) => {
    const s = getRead(); s.add(id); persistRead(s); setReadIds(new Set(s));
  }, []);

  const handleDismissAll = useCallback(() => {
    const s = getRead(); active.forEach(n => s.add(n.id)); persistRead(s); setReadIds(new Set(s));
  }, [active]);

  // Default-open the first (highest-priority) group
  const defaultOpenGroup = grouped[0]?.type;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="الإشعارات" className="relative h-8 w-8">
          <Bell className="w-4 h-4" />
          {active.length > 0 && (
            <span className={cn(
              'absolute -top-0.5 -end-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-xs font-bold text-white',
              critCount > 0 ? 'bg-destructive' : 'bg-amber-500'
            )}>{active.length}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <h4 className="text-sm font-semibold">
            الإشعارات {active.length > 0 && <span className="text-muted-foreground">· {active.length}</span>}
          </h4>
          {active.length > 0 && (
            <Button variant="ghost" size="sm" className="text-xs h-6 px-2" onClick={handleDismissAll}>
              قراءة الكل
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-[420px]">
          {active.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">لا توجد إشعارات جديدة ✓</p>
          ) : (
            <Accordion
              type="multiple"
              defaultValue={defaultOpenGroup ? [defaultOpenGroup] : []}
              className="px-2 py-1"
            >
              {grouped.map(({ type, items }) => {
                const Icon = ICONS[type] || Bell;
                const topSeverity = items[0].severity;
                return (
                  <AccordionItem key={type} value={type} className="border-none">
                    <AccordionTrigger className="px-2 py-2 hover:no-underline rounded-md hover:bg-muted/60">
                      <div className="flex items-center gap-2 flex-1 text-start">
                        <Icon className={cn(
                          'w-3.5 h-3.5 shrink-0',
                          topSeverity === 'critical' ? 'text-destructive'
                            : topSeverity === 'warning' ? 'text-warning' : 'text-blue-600'
                        )} />
                        <span className="text-xs font-medium">
                          {TYPE_LABELS[type] || type} ({items.length})
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-1">
                      <div className="space-y-1">
                        {items.map(n => (
                          <div key={n.id} className={cn('flex items-start gap-2 p-2 rounded-md border', COLORS[n.severity])}>
                            <button onClick={() => { setOpen(false); navigate(n.link); }} className="flex-1 text-start">
                              <p className="text-xs font-medium">{n.title}</p>
                              <p className="text-xs opacity-70">{n.description}</p>
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDismiss(n.id); }}
                              aria-label="تجاهل"
                              className="shrink-0 opacity-40 hover:opacity-100 transition-opacity"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
