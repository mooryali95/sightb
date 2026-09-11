/**
 * The read-only fund inspector: every figure the row shows, broken down, plus
 * the settlement on file and whatever is still open against the fund.
 */
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  InspectorPanel, InspectorSection, InspectorField, InspectorKpiStrip,
} from '@/components/ui/inspector-panel';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/finance';
import {
  getFundSpent,
  getFundDirectSpent,
  getFundCustodyDraw,
  getFundOutstandingAdvances,
  getFundCashTransfersOut,
  getFundRemaining,
  daysBetween,
  getFundOpenItems,
} from '@/lib/funds';
import {
  FUND_STATUS_LABELS,
  FUND_STATUS_COLORS,
  SETTLEMENT_STATUS_LABELS,
  SETTLEMENT_STATUS_COLORS,
  type CashTransfer,
  type Custody,
  type Expense,
  type FundSettlement,
  type PaymentRequest,
  type ProjectFund,
} from '@/types/project';

interface Props {
  /** The fund being inspected; the panel is closed when absent. */
  fund: ProjectFund | undefined;
  settlement: FundSettlement | undefined;
  projectExpenses: Expense[];
  projectCustodies: Custody[];
  projPRs: PaymentRequest[];
  projTransfers: CashTransfer[];
  onClose: () => void;
}

export function FundInspector({
  fund, settlement, projectExpenses, projectCustodies, projPRs, projTransfers, onClose,
}: Props) {
  return (
    <InspectorPanel
      open={!!fund}
      onOpenChange={(v) => { if (!v) onClose(); }}
      title={(() => {
        const f = fund;
        return f ? `الدفعة #${f.fundNumber}` : 'تفاصيل الدفعة';
      })()}
      meta={(() => {
        const f = fund;
        if (!f) return null;
        return (
          <Badge className={cn('text-xs', FUND_STATUS_COLORS[f.status])}>
            {FUND_STATUS_LABELS[f.status]}
          </Badge>
        );
      })()}
      width="lg"
    >
      {(() => {
        const f = fund;
        if (!f) return null;
        const spent = getFundSpent(f.id, projectExpenses, projectCustodies, projPRs, projTransfers);
        const calcRemaining = getFundRemaining(f, projectExpenses, projectCustodies, projPRs, projTransfers);
        const isClosed = f.status === 'settled' || (settlement && settlement.status === 'approved');
        const remaining = isClosed ? 0 : calcRemaining;
        const ratio = f.amount > 0 ? Math.min(100, (spent / f.amount) * 100) : 0;
        const direct = getFundDirectSpent(f.id, projectExpenses, projectCustodies);
        const custDraw = getFundCustodyDraw(f.id, projectCustodies);
        const advances = getFundOutstandingAdvances(f.id, projPRs);
        const transOut = getFundCashTransfersOut(f.id, projTransfers);
        const open = getFundOpenItems(f.id, projectCustodies, projPRs, projTransfers, projectExpenses);
        const days = daysBetween(f.acknowledgedAt || f.transferDate);
        return (
          <>
            <InspectorKpiStrip
              items={[
                { label: 'المبلغ', value: formatCurrency(f.amount) },
                { label: 'المصروف', value: formatCurrency(spent) },
                { label: 'المتبقي', value: formatCurrency(remaining), tone: remaining < 0 ? 'destructive' : 'default' },
                { label: 'العمر', value: `${days} يوم` },
              ]}
            />
            <div className="px-5 py-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                <span>نسبة الصرف</span>
                <span className="tabular-nums">{ratio.toFixed(1)}%</span>
              </div>
              <Progress value={ratio} className="h-2" />
            </div>

            <InspectorSection title="تفصيل المصروف">
              <InspectorField label="مصروف مباشر" value={formatCurrency(direct)} mono />
              <InspectorField label="عهد مسحوبة" value={formatCurrency(custDraw)} mono />
              <InspectorField label="سلف قائمة" value={formatCurrency(advances)} mono />
              <InspectorField label="تحويلات نقدية" value={formatCurrency(transOut)} mono />
            </InspectorSection>

            <InspectorSection title="بيانات الدفعة">
              <InspectorField label="تاريخ التحويل" value={f.transferDate} />
              {f.acknowledgedAt && (
                <InspectorField label="تاريخ الاستلام" value={f.acknowledgedAt.split('T')[0]} />
              )}
              {f.notes && <InspectorField label="ملاحظات" value={f.notes} />}
            </InspectorSection>

            {settlement && (
              <InspectorSection title="التسوية">
                <InspectorField
                  label="الحالة"
                  value={
                    <Badge className={cn('text-xs', SETTLEMENT_STATUS_COLORS[settlement.status])}>
                      {SETTLEMENT_STATUS_LABELS[settlement.status]}
                    </Badge>
                  }
                />
                <InspectorField label="المتبقي النقدي المُعاد" value={formatCurrency(settlement.remainingCash)} mono />
                {settlement.differenceReason && (
                  <InspectorField label="سبب الفرق" value={settlement.differenceReason} />
                )}
                {settlement.rejectionReason && (
                  <InspectorField label="سبب الرفض" value={settlement.rejectionReason} />
                )}
                {settlement.approvalDate && (
                  <InspectorField label="تاريخ الاعتماد" value={settlement.approvalDate.split('T')[0]} />
                )}
              </InspectorSection>
            )}

            {(open.openCustodies.length > 0 || open.outstandingAdvances.length > 0) && (
              <InspectorSection title="بنود غير مسوّاة">
                {open.openCustodies.map((c) => (
                  <InspectorField
                    key={c.id}
                    label={`عهدة — ${c.resourceName}`}
                    value={formatCurrency(c.remaining)}
                    mono
                  />
                ))}
                {open.outstandingAdvances.map((a) => (
                  <InspectorField
                    key={a.id}
                    label={`سلفة — ${a.description}`}
                    value={formatCurrency(a.remaining)}
                    mono
                  />
                ))}
              </InspectorSection>
            )}
          </>
        );
      })()}
    </InspectorPanel>
  );
}
