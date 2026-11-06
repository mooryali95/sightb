/** One slider card and one result card of the what-if analysis. */
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/finance';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface SliderCardProps {
  label: string;
  value: number;
  min: number;
  max: number;
  /** Shown under the slider: the figure the setting produces. */
  preview: string;
  /** Whether a rise is good news (contract, revenue) or bad (spend, duration). */
  upIsGood: boolean;
  suffix?: string;
  onChange: (v: number) => void;
}

export function SliderCard({ label, value, min, max, preview, upIsGood, suffix = '%', onChange }: SliderCardProps) {
  const good = upIsGood ? value > 0 : value < 0;
  const bad = upIsGood ? value < 0 : value > 0;
  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm">{label}</Label>
          <Badge variant={good ? 'default' : bad ? 'destructive' : 'secondary'} className="text-xs">
            {value > 0 ? '+' : ''}{value}{suffix}
          </Badge>
        </div>
        <Slider value={[value]} onValueChange={([v]) => onChange(v)} min={min} max={max} step={1} />
        <p className="text-xs text-muted-foreground">{preview}</p>
      </CardContent>
    </Card>
  );
}

export function ResultCard({ title, value, subtitle, trend, diff, currency }: {
  title: string; value: string; subtitle: string;
  trend: 'up' | 'down'; diff?: number; currency?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 space-y-1">
        <p className="text-xs text-muted-foreground">{title}</p>
        <div className="flex items-center gap-2">
          {trend === 'up' ? (
            <TrendingUp className="w-4 h-4 text-success" />
          ) : (
            <TrendingDown className="w-4 h-4 text-destructive" />
          )}
          <span className="text-lg font-bold">{value}</span>
        </div>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
        {diff !== undefined && diff !== 0 && (
          <p className={`text-xs font-medium ${diff > 0 ? 'text-success' : 'text-destructive'}`}>
            {diff > 0 ? '+' : ''}{formatCurrency(diff, currency)} عن الأصلي
          </p>
        )}
      </CardContent>
    </Card>
  );
}
