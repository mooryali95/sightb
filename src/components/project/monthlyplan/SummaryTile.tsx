/** One figure of the monthly plan's summary strip. */
import { cn } from '@/lib/utils';

export function SummaryTile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="p-3 rounded-lg border border-border bg-muted/30 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('text-sm font-mono font-bold mt-1', accent)}>{value}</p>
    </div>
  );
}

