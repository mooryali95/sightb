import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { HelpCircle, ArrowRight } from 'lucide-react';

export type StatCardVariant = 'default' | 'hero' | 'compact';

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon?: ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  className?: string;
  tooltip?: string;
  details?: ReactNode;
  variant?: StatCardVariant;
}

export function StatCard({
  title, value, subtitle, icon, trend, className, tooltip, details,
  variant = 'default',
}: StatCardProps) {
  const isHero = variant === 'hero';
  const isCompact = variant === 'compact';

  // Resolve trend indicator color (kept neutral; consumer chooses the icon meaning)
  const trendColor =
    trend === 'up' ? 'profit-text' :
    trend === 'down' ? 'loss-text' :
    '';

  // Neutral indicator — used for total counters (no profit/loss connotation)
  const showNeutralArrow = trend === 'neutral';

  return (
    <div
      className={cn(
        'stat-card stat-tile',
        isHero && 'stat-card-hero',
        isCompact && 'p-3',
        className,
      )}
    >
      <div className={cn('flex items-start justify-between', isCompact ? 'mb-2' : 'mb-3')}>
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={cn(
              'font-medium text-muted-foreground line-clamp-2 leading-snug',
              isHero ? 'text-sm' : 'text-xs',
            )}
          >
            {title}
          </span>
          {(tooltip || details) && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="مزيد من المعلومات"
                  className="hit text-muted-foreground/80 hover:text-muted-foreground transition-colors shrink-0"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="text-xs max-w-xs" side="top">
                {tooltip && <p>{tooltip}</p>}
                {details && <div>{details}</div>}
              </PopoverContent>
            </Popover>
          )}
        </div>
        {icon && (
          <div className={cn('text-muted-foreground shrink-0', isHero && 'gold-text')}>
            {icon}
          </div>
        )}
      </div>

      <div className={cn(isHero ? 'stat-value-hero' : 'stat-value', !isHero && trendColor)}>
        {value}
        {showNeutralArrow && (
          <ArrowRight className="inline-block w-4 h-4 ms-1 text-muted-foreground/60" aria-hidden />
        )}
      </div>

      {!isCompact && subtitle && (
        <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{subtitle}</p>
      )}
    </div>
  );
}
