/** The label and colours of each month status in the monthly plan. */
import type { MonthStatus } from '@/lib/finance';

export const STATUS_META: Record<MonthStatus, { label: string; dot: string; ring: string; bg: string; text: string }> = {
  on_track:   { label: 'ضمن الخطة',   dot: 'bg-success', ring: 'ring-success', bg: 'bg-success/10', text: 'text-success' },
  near_limit: { label: 'قرب الحد',    dot: 'bg-warning',   ring: 'ring-warning',     bg: 'bg-warning/10',     text: 'text-warning' },
  over:       { label: 'تجاوز',       dot: 'bg-destructive',     ring: 'ring-destructive',         bg: 'bg-destructive/10',         text: 'text-destructive' },
  future:     { label: 'مستقبل',      dot: 'bg-muted-foreground/40', ring: 'ring-border', bg: 'bg-muted/30', text: 'text-muted-foreground' },
  inactive:   { label: 'بدون نشاط',   dot: 'bg-muted-foreground/30', ring: 'ring-border', bg: 'bg-muted/20', text: 'text-muted-foreground' },
};

