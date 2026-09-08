/**
 * The five figures at the head of the payables section.
 *
 * Every number arrives as a prop already scoped to one ledger. That is the
 * point: this component cannot accidentally sum across both, because it never
 * sees the rows — only the totals the section chose to hand it.
 */
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Clock, FileText, HandCoins, Wallet } from 'lucide-react';
import { formatCurrency } from '@/lib/finance';
import { cn } from '@/lib/utils';
import type { PayablesScope } from './usePayablesScope';

interface Props {
  scope: PayablesScope;
  totalApprovedAmount: number;
  totalPaidAmount: number;
  totalOutstandingAmount: number;
  pendingRequestsCount: number;
  outstandingAdvancesTotal: number;
  outstandingAdvancesCount: number;
  oldestAdvanceDays: number;
}

export function PayablesSummaryCards({
  scope,
  totalApprovedAmount,
  totalPaidAmount,
  totalOutstandingAmount,
  pendingRequestsCount,
  outstandingAdvancesTotal,
  outstandingAdvancesCount,
  oldestAdvanceDays,
}: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      <div className="col-span-2 md:col-span-5 text-xs text-muted-foreground">
        الأرقام أدناه تخص: <strong>{scope === 'resource' ? 'دفتر مستحقات الفريق' : 'دفتر مستحقات الموردين'}</strong> فقط.
      </div>
      <Card className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
          <HandCoins className="h-4 w-4" /> إجمالي المعتمد
        </div>
        <div className="text-2xl font-bold">{formatCurrency(totalApprovedAmount)}</div>
      </Card>
      <Card className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
          <CheckCircle2 className="h-4 w-4" /> إجمالي المدفوع
        </div>
        <div className="text-2xl font-bold text-emerald-600">{formatCurrency(totalPaidAmount)}</div>
      </Card>
      <Card className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
          <Wallet className="h-4 w-4" /> المستحق غير المدفوع
        </div>
        <div className="text-2xl font-bold text-amber-600">{formatCurrency(totalOutstandingAmount)}</div>
      </Card>
      <Card className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
          <Clock className="h-4 w-4" /> طلبات معلقة
        </div>
        <div className="text-2xl font-bold">{pendingRequestsCount}</div>
      </Card>
      <Card
        className="p-4 border-amber-300/60 bg-amber-50/40 dark:bg-amber-950/20"
        title="السلف المدفوعة لم تُسوَّ بعد — أصل قابل للاسترداد لا يدخل CPI"
      >
        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm mb-1">
          <FileText className="h-4 w-4" /> سلف قائمة (غير مسوّاة)
        </div>
        <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">
          {formatCurrency(outstandingAdvancesTotal)}
        </div>
        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
          <span>{outstandingAdvancesCount} سلفة</span>
          {oldestAdvanceDays > 0 && (
            <Badge
              variant="outline"
              className={cn(
                'text-xs',
                oldestAdvanceDays > 60 && 'border-destructive text-destructive',
                oldestAdvanceDays > 30 && oldestAdvanceDays <= 60 && 'border-amber-500 text-amber-700 dark:text-amber-400',
              )}
            >
              أقدمها: {oldestAdvanceDays} يوم
            </Badge>
          )}
        </div>
      </Card>
    </div>
  );
}
