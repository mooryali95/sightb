/**
 * The ledger's timeline tab: one line per money event, newest first.
 */
import { formatCurrency } from '@/lib/finance';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Wallet, HandCoins, Receipt, Send, FileCheck2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TimelineEvent } from './buildLedgerTimeline';

export function LedgerTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <Card className="p-3 rounded-xl">
      {events.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">لا توجد عمليات بعد</p>
      ) : (
        <ol className="relative border-r border-border pr-4 space-y-3">
          {events.map((ev) => {
            const Icon = ev.type === 'fund' ? Wallet
              : ev.type === 'custody' ? HandCoins
              : ev.type === 'expense' ? Receipt
              : ev.type === 'payment_request' ? Send
              : FileCheck2;
            const dirCls = ev.direction === 'in' ? 'text-emerald-600' : ev.direction === 'out' ? 'text-destructive' : 'text-muted-foreground';
            const sign = ev.direction === 'in' ? '+' : ev.direction === 'out' ? '−' : '';
            return (
              <li key={ev.id} className="relative">
                <span className="absolute -right-[22px] top-1.5 w-3 h-3 rounded-full bg-background border-2 border-border" />
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    <Icon className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">{ev.title}</p>
                        {ev.badge && (
                          <Badge variant="outline" className={cn('text-[10px] border-transparent', ev.badge.cls)}>
                            {ev.badge.label}
                          </Badge>
                        )}
                      </div>
                      {ev.subtitle && (
                        <p className="text-[11px] text-muted-foreground truncate">{ev.subtitle}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-0.5">{ev.date}</p>
                    </div>
                  </div>
                  <p className={cn('font-mono text-sm shrink-0', dirCls)}>
                    {sign}{formatCurrency(ev.amount)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
