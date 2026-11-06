import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/finance';
import type { SpendBreakdown } from './settlementFigures';

interface SettlementFiguresGridProps {
  received: number;
  spent: number;
  difference: number;
  breakdown: SpendBreakdown;
}

/** Received, documented spend and the difference, coloured by how far off it is, with the spend broken down. */
export function SettlementFiguresGrid({ received, spent, difference, breakdown }: SettlementFiguresGridProps) {
  const off = Math.abs(difference);
  const tone = off <= 1 ? 'ok' : off > 1000 ? 'bad' : 'warn';
  return (
    <div className="grid grid-cols-3 gap-3 text-sm">
      <div className="p-3 rounded-lg bg-muted/50">
        <p className="text-xs text-muted-foreground">المستلم</p>
        <p className="font-mono font-semibold">{formatCurrency(received)}</p>
      </div>
      <div className="p-3 rounded-lg bg-muted/50">
        <p className="text-xs text-muted-foreground">المصروف الموثق</p>
        <p className="font-mono font-semibold">{formatCurrency(spent)}</p>
      </div>
      <div className={cn(
        'p-3 rounded-lg border-2',
        tone === 'ok' ? 'bg-success/10 border-success/30'
          : tone === 'bad' ? 'bg-destructive/10 border-destructive/40 animate-pulse'
            : 'bg-warning/10 border-warning/30',
      )}>
        <p className="text-xs text-muted-foreground">الفرق</p>
        <p className={cn(
          'font-mono font-semibold',
          tone === 'ok' ? 'text-success' : tone === 'bad' ? 'text-destructive text-lg' : 'text-warning',
        )}>
          {formatCurrency(difference)}
        </p>
        {tone === 'bad' && (
          <p className="text-xs text-destructive font-semibold mt-1">⚠️ فرق كبير — يتطلب توضيحاً مفصّلاً</p>
        )}
      </div>

      <div className="text-xs text-muted-foreground bg-muted/30 rounded-md p-2 grid grid-cols-2 md:grid-cols-4 gap-2">
        <div>مصروف مباشر: <span className="font-mono text-foreground">{formatCurrency(breakdown.direct)}</span></div>
        <div>عهد مسحوبة: <span className="font-mono text-foreground">{formatCurrency(breakdown.custodyDraw)}</span></div>
        <div>سلف قائمة: <span className="font-mono text-foreground">{formatCurrency(breakdown.advances)}</span></div>
        <div>تحويلات نقدية: <span className="font-mono text-foreground">{formatCurrency(breakdown.transfersOut)}</span></div>
      </div>
    </div>
  );
}
