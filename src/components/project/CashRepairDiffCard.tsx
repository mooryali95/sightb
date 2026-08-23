import { useCashRepairStatus, diffSnapshot, type CashRepairBalanceSnapshot } from '@/lib/cash-repair-events';
import { formatCurrency } from '@/lib/finance';
import { Badge } from '@/components/ui/badge';
import { ArrowLeftRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const ROWS: Array<{ key: keyof CashRepairBalanceSnapshot; label: string; hint: string }> = [
  { key: 'activeFundRemaining', label: 'متبقي الدفعة النشطة', hint: 'المبلغ − (مصروف مباشر + عهد + سلف + تحويلات صادرة)' },
  { key: 'managerRemaining', label: 'المتبقي بيد المدير', hint: 'إجمالي الدفعات − كل ما استُنزف منها' },
  { key: 'custodyAvailable', label: 'متاح العهدة', hint: 'المبلغ الأساسي + التحويلات الواردة' },
  { key: 'custodySpent', label: 'مصروف العهدة', hint: 'مصروفات العهدة غير المرفوضة' },
  { key: 'custodyRemaining', label: 'متبقي العهدة', hint: 'المتاح − المصروف − السلف القائمة' },
];

/**
 * يعرض فرق الأرصدة قبل/بعد آخر إصلاح لتحويل يتيم داخل FundsSection.
 */
export function CashRepairDiffCard({ projectId }: { projectId: string }) {
  const { last } = useCashRepairStatus(projectId);
  if (!last) return null;
  const delta = diffSnapshot(last.before, last.after);

  return (
    <div className="stat-card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <ArrowLeftRight className="w-4 h-4" />أثر آخر إصلاح على الأرصدة
        </h3>
        <Badge variant="outline" className="text-[11px] font-mono">
          {last.custodyName} · {formatCurrency(last.amount)}
        </Badge>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground border-b border-border">
              <th className="text-start font-medium py-1.5">البند</th>
              <th className="text-end font-medium py-1.5">قبل</th>
              <th className="text-end font-medium py-1.5">بعد</th>
              <th className="text-end font-medium py-1.5">الفرق</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => {
              const d = delta[r.key];
              return (
                <tr key={r.key} className="border-b border-border/50 last:border-0">
                  <td className="py-1.5">
                    <span className="font-medium">{r.label}</span>
                    <span className="block text-[11px] text-muted-foreground">{r.hint}</span>
                  </td>
                  <td className="py-1.5 text-end font-mono">{formatCurrency(last.before[r.key])}</td>
                  <td className="py-1.5 text-end font-mono">{formatCurrency(last.after[r.key])}</td>
                  <td className={cn(
                    'py-1.5 text-end font-mono font-semibold',
                    d === 0 ? 'text-muted-foreground' : d > 0 ? 'text-success' : 'text-destructive',
                  )}>
                    {d > 0 ? '+' : ''}{formatCurrency(d)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted-foreground">
        حذف التحويل بلا دفعة أصل يخفض متاح العهدة ومتبقيها بمقدار المبلغ المحذوف، بينما يبقى متبقي الدفعة النشطة والمتبقي بيد المدير كما هما ما لم يكن التحويل مخصوماً من دفعة قائمة.
      </p>
    </div>
  );
}
