/**
 * The small parts every comparison row shares: the variance badge, the
 * layered bar (planned, actual, the planned-to-date marker) and a metric.
 */
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatCurrency, formatPercent } from '@/lib/finance';
import { cn } from '@/lib/utils';

export type Severity = 'good' | 'warning' | 'critical';

const severityBg: Record<Severity, string> = {
  good: 'bg-health-good',
  warning: 'bg-health-warning',
  critical: 'bg-health-critical',
};
const severityText: Record<Severity, string> = {
  good: 'health-good',
  warning: 'health-warning',
  critical: 'health-critical',
};
const severityFill: Record<Severity, string> = {
  good: 'bg-[hsl(var(--success))]',
  warning: 'bg-[hsl(var(--warning))]',
  critical: 'bg-[hsl(var(--destructive))]',
};

export function VarianceBadge({ variance, currency, severity }: { variance: number; currency: string; severity: Severity }) {
  const Icon = severity === 'good' ? Minus : variance > 0 ? TrendingUp : TrendingDown;
  const sign = variance > 0 ? '+' : variance < 0 ? '−' : '';
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold border', severityBg[severity], severityText[severity])}>
      <Icon className="w-3 h-3" />
      {sign}{formatCurrency(Math.abs(variance), currency)}
    </span>
  );
}

/** Layered bar: full = planned (BAC), fill = actual, marker = plannedToDate position. */
export function ComparisonBar({
  planned, actual, plannedToDate, severity,
}: { planned: number; actual: number; plannedToDate: number; severity: Severity }) {
  const actualPct = planned > 0 ? Math.min(100, (actual / planned) * 100) : 0;
  const pvPct = planned > 0 ? Math.min(100, (plannedToDate / planned) * 100) : 0;
  return (
    <div className="relative w-full h-2.5 rounded-full bg-muted overflow-visible">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${actualPct}%` }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className={cn('absolute inset-y-0 start-0 rounded-full', severityFill[severity])}
        style={{ width: `${actualPct}%` }}
      />
      {planned > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="absolute -top-1 h-4.5 w-0.5 bg-foreground/70 rounded-full"
              style={{ right: `calc(${pvPct}% - 1px)`, height: '18px', top: '-4px' }}
            />
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            موضع المخطط للفترة: {formatPercent(pvPct)}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-semibold text-foreground tabular-nums">{value}</span>
    </div>
  );
}
