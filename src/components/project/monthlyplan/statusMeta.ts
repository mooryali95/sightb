/** The label and colours of each month status in the monthly plan. */
import type { MonthStatus } from '@/lib/finance';

export const STATUS_META: Record<MonthStatus, { label: string; dot: string; ring: string; bg: string; text: string }> = {
  on_track:   { label: 'ضمن الخطة',   dot: 'bg-emerald-500', ring: 'ring-emerald-200 dark:ring-emerald-900/40', bg: 'bg-emerald-50/60 dark:bg-emerald-900/10', text: 'text-emerald-700 dark:text-emerald-300' },
  near_limit: { label: 'قرب الحد',    dot: 'bg-amber-500',   ring: 'ring-amber-200 dark:ring-amber-900/40',     bg: 'bg-amber-50/60 dark:bg-amber-900/10',     text: 'text-amber-700 dark:text-amber-300' },
  over:       { label: 'تجاوز',       dot: 'bg-red-500',     ring: 'ring-red-200 dark:ring-red-900/40',         bg: 'bg-red-50/60 dark:bg-red-900/10',         text: 'text-red-700 dark:text-red-300' },
  future:     { label: 'مستقبل',      dot: 'bg-muted-foreground/40', ring: 'ring-border', bg: 'bg-muted/30', text: 'text-muted-foreground' },
  inactive:   { label: 'بدون نشاط',   dot: 'bg-muted-foreground/30', ring: 'ring-border', bg: 'bg-muted/20', text: 'text-muted-foreground' },
};

