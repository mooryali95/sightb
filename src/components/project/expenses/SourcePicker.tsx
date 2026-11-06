import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Wallet } from 'lucide-react';
import { formatCurrency } from '@/lib/finance';
import type { CustodyBreakdown } from '@/lib/funds';
import type { Custody, ProjectFund } from '@/types/project';

export type SourceMode = 'fund' | 'custody';

interface SourcePickerProps {
  mode: SourceMode;
  onModeChange: (mode: SourceMode) => void;
  activeFund: ProjectFund | null | undefined;
  activeFundRemaining: number;
  fundId: string;
  onFundChange: (fundId: string) => void;
  /** Custodies still open, the only ones a row can draw from. */
  custodies: Custody[];
  custodyId: string;
  onCustodyChange: (custodyId: string) => void;
  breakdownOf: (custodyId: string) => CustodyBreakdown | undefined;
  amount: number;
  isAdmin: boolean;
  onAcknowledge: () => void;
}

/** The source of a new expense: the active fund or one open custody, with what each still holds. */
export function SourcePicker({
  mode, onModeChange, activeFund, activeFundRemaining, fundId, onFundChange,
  custodies, custodyId, onCustodyChange, breakdownOf, amount, isAdmin, onAcknowledge,
}: SourcePickerProps) {
  const breakdown = custodyId && custodyId !== 'none' ? breakdownOf(custodyId) : undefined;
  return (
    <div className="space-y-3 p-3 rounded-lg border border-warning/30 bg-warning/10">
      <Label className="flex items-center gap-1.5">
        <Wallet className="w-3.5 h-3.5" />
        مصدر الصرف
        <span className="text-destructive text-xs">*</span>
      </Label>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" size="sm" variant={mode === 'fund' ? 'default' : 'outline'} disabled={!activeFund} onClick={() => onModeChange('fund')}>
          من الدفعة
        </Button>
        <Button type="button" size="sm" variant={mode === 'custody' ? 'default' : 'outline'} disabled={custodies.length === 0} onClick={() => onModeChange('custody')}>
          من العهدة
        </Button>
      </div>

      {mode === 'fund' && activeFund && (
        <div className="space-y-2">
          {activeFund.status === 'transferred' && (
            <div className="flex items-start justify-between gap-2 p-2 rounded bg-background border border-border">
              <div className="text-xs">
                <p className="font-semibold">الدفعة #{activeFund.fundNumber} — قيد التحويل</p>
                <p className="text-muted-foreground mt-0.5">يجب إقرار الاستلام قبل الصرف منها.</p>
              </div>
              {isAdmin && (
                <Button type="button" size="sm" variant="outline" onClick={onAcknowledge}>إقرار الاستلام</Button>
              )}
            </div>
          )}
          <Select value={fundId || activeFund.id} onValueChange={onFundChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={activeFund.id}>
                الدفعة #{activeFund.fundNumber} — متبقي: {formatCurrency(activeFundRemaining)}
              </SelectItem>
            </SelectContent>
          </Select>
          {amount > 0 && amount > activeFundRemaining && (
            <p className="text-xs text-destructive">⚠️ المبلغ يتجاوز رصيد الدفعة المتبقي — سيُرفض من النظام</p>
          )}
        </div>
      )}

      {mode === 'custody' && (
        <div className="space-y-2">
          <Select value={custodyId} onValueChange={onCustodyChange}>
            <SelectTrigger><SelectValue placeholder="اختر العهدة" /></SelectTrigger>
            <SelectContent>
              {custodies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.resourceName} — متبقي: {formatCurrency(breakdownOf(c.id)?.remaining ?? 0)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {breakdown && (
            <div className="space-y-1 text-xs">
              <p className="text-muted-foreground">
                العهدة: {formatCurrency(breakdown.baseAmount)}
                {breakdown.transfersIn > 0 && ` + تحويلات واردة: ${formatCurrency(breakdown.transfersIn)}`}
                {' '}− مصروف: {formatCurrency(breakdown.spent)}
                {breakdown.outstandingAdvances > 0 && ` − سلف قائمة: ${formatCurrency(breakdown.outstandingAdvances)}`}
              </p>
              <p className={breakdown.remaining > 0 ? 'font-semibold' : 'text-destructive font-semibold'}>
                المتبقي: {formatCurrency(breakdown.remaining)}
                {breakdown.remaining <= 0 && ' ⚠️ العهدة مستنفدة'}
              </p>
              {amount > 0 && amount > breakdown.remaining && (
                <p className="text-destructive">
                  ⚠️ المبلغ ({formatCurrency(amount)}) يتجاوز المتبقي ({formatCurrency(breakdown.remaining)}).
                  قسّم المصروف: {formatCurrency(breakdown.remaining)} من هذه العهدة، والباقي من عهدة/دفعة أخرى.
                </p>
              )}
              <p className="text-muted-foreground">
                سيُخصم من العهدة فقط ولن يُخصم من الدفعة مرة أخرى (مبلغ العهدة محجوز مسبقاً).
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
