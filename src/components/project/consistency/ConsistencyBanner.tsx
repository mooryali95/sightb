/** The warning with the gap and the unlinked spend, or the all-clear; and the three totals. */
import { formatCurrency } from '@/lib/finance';
import type { ConsistencyReport } from '@/lib/spend-consistency';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

export function ConsistencyBanner({ report }: { report: ConsistencyReport }) {
  return (
    <>
  {report.hasIssues ? (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>تم رصد اختلافات في أرقام الصرف</AlertTitle>
      <AlertDescription className="text-xs space-y-1">
        {Math.abs(report.totalGap) > 0.01 && (
          <div>فرق قبل/بعد الإصلاح: <span className="font-mono">{formatCurrency(report.totalGap)}</span></div>
        )}
        {report.totalUnlinked > 0.01 && (
          <div>
            مصروفات بلا دفعة أو عهدة: <span className="font-mono">{formatCurrency(report.totalUnlinked)}</span>
            {' '}({report.unlinkedCount} عملية) — {report.unlinked.slice(0, 3).map((u) => u.label).join('، ')}
          </div>
        )}
      </AlertDescription>
    </Alert>
  ) : (
    <Alert>
      <CheckCircle2 className="h-4 w-4" />
      <AlertTitle>الأرقام متسقة</AlertTitle>
      <AlertDescription className="text-xs">
        لا توجد فروق بين ما قبل وبعد الإصلاح، وكل مصروف مرتبط بمصدر واحد صحيح.
      </AlertDescription>
    </Alert>
  )}

  <div className="grid grid-cols-3 gap-3">
    <div className="p-3 rounded-lg border border-border bg-muted/30">
      <p className="text-xs text-muted-foreground">الإجمالي قبل</p>
      <p className="text-sm font-mono font-semibold mt-1">{formatCurrency(report.totalBefore)}</p>
    </div>
    <div className="p-3 rounded-lg border border-border bg-muted/30">
      <p className="text-xs text-muted-foreground">الإجمالي بعد</p>
      <p className="text-sm font-mono font-semibold mt-1">{formatCurrency(report.totalAfter)}</p>
    </div>
    <div className="p-3 rounded-lg border border-border bg-muted/30">
      <p className="text-xs text-muted-foreground">إجمالي الفجوة</p>
      <p className={`text-sm font-mono font-semibold mt-1 ${Math.abs(report.totalGap) > 0.01 ? 'text-destructive' : ''}`}>
        {formatCurrency(report.totalGap)}
      </p>
    </div>
  </div>
    </>
  );
}
