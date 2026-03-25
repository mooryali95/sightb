import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { HelpCircle } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon?: ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  className?: string;
  tooltip?: string;
  details?: ReactNode;
}

export function StatCard({ title, value, subtitle, icon, trend, className, tooltip, details }: StatCardProps) {
  return (
    <div className={cn('stat-card', className)}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">{title}</span>
          {(tooltip || details) && (
            <Popover>
              <PopoverTrigger asChild>
                <button className="text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                  <HelpCircle className="w-3 h-3" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="text-xs max-w-xs" side="top">
                {tooltip && <p>{tooltip}</p>}
                {details && <div>{details}</div>}
              </PopoverContent>
            </Popover>
          )}
        </div>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </div>
      <div
        className={cn(
          'stat-value',
          trend === 'up' && 'profit-text',
          trend === 'down' && 'loss-text'
        )}
      >
        {value}
      </div>
      {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
    </div>
  );
}
