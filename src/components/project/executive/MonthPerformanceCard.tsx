/**
 * The month's planned against spent, with a selector for an earlier month
 * or the elapsed months together.
 */
import { useMemo, useState } from 'react';
import { Calendar } from 'lucide-react';
import { formatCurrency } from '@/lib/finance';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SectionCard, SectionTitle } from './SectionCard';
import { monthPerformance } from './executiveFigures';

interface Props {
  currentMonth: number;
  durationMonths: number;
  plannedMonthly: number[];
  actualMonthly: number[];
}

export function MonthPerformanceCard({ currentMonth, durationMonths, plannedMonthly, actualMonthly }: Props) {
  // Month selector state: 'current' | 'all' | specific month number
  const [selectedMonth, setSelectedMonth] = useState<string>('current');

  const performance = useMemo(
    () => monthPerformance(selectedMonth, currentMonth, durationMonths, plannedMonthly, actualMonthly),
    [selectedMonth, currentMonth, plannedMonthly, actualMonthly, durationMonths],
  );

  // Build month options
  const monthOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [
      { value: 'current', label: `الشهر الحالي (${currentMonth})` },
      { value: 'all', label: 'إجمالي الأشهر' },
    ];
    const elapsed = Math.min(durationMonths, currentMonth);
    for (let i = 1; i <= elapsed; i++) {
      if (i !== currentMonth) {
        opts.push({ value: String(i), label: `شهر ${i}` });
      }
    }
    return opts;
  }, [currentMonth, durationMonths]);

  return (
    <SectionCard>
      <SectionTitle
        icon={Calendar}
        actions={
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      >
        الأداء المالي — {performance.label}
      </SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="text-center p-3 rounded-lg bg-muted/40">
          <p className="text-xs text-muted-foreground">المخطط</p>
          <p className="text-sm font-mono font-bold mt-1">{formatCurrency(performance.planned)}</p>
        </div>
        <div className="text-center p-3 rounded-lg bg-muted/40">
          <p className="text-xs text-muted-foreground">المصروف</p>
          <p className="text-sm font-mono font-bold mt-1">{formatCurrency(performance.actual)}</p>
        </div>
        <div className="text-center p-3 rounded-lg bg-muted/40">
          <p className="text-xs text-muted-foreground">{performance.diff >= 0 ? 'وفر' : 'تجاوز'}</p>
          <p className={`text-sm font-mono font-bold mt-1 ${performance.diff >= 0 ? 'text-success' : 'text-destructive'}`}>
            {formatCurrency(Math.abs(performance.diff))}
          </p>
        </div>
        <div className="text-center p-3 rounded-lg bg-muted/40">
          <p className="text-xs text-muted-foreground">الحكم</p>
          <p className={`text-sm font-bold mt-1 ${performance.diff >= 0 ? 'text-success' : 'text-destructive'}`}>
            {performance.actual === 0 ? 'لا صرف بعد' : performance.diff > 0 ? 'وفر 👍' : performance.diff < 0 ? 'تجاوز ⚠️' : 'مطابق ✓'}
          </p>
        </div>
      </div>
      {/* Spending progress bar */}
      {performance.planned > 0 && (
        <div className="mt-3">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>نسبة الصرف</span>
            <span>{((performance.actual / performance.planned) * 100).toFixed(0)}%</span>
          </div>
          <Progress value={Math.min(150, (performance.actual / performance.planned) * 100)} aria-label="أداء الشهر مقابل المخطط" className="h-1.5" />
        </div>
      )}
    </SectionCard>
  );
}
