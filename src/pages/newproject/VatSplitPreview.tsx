/** Whether the entered contract includes VAT, and how it splits at the given rate. */
import { formatCurrency } from '@/lib/finance';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { contractFigures } from './contractFigures';

interface Props {
  entered: number;
  rate: number;
  rateText: string;
  inclusive: boolean;
  onInclusiveChange: (inclusive: boolean) => void;
}

export function VatSplitPreview({ entered, rate, rateText, inclusive, onInclusiveChange }: Props) {
  const figures = contractFigures(entered, rate, inclusive);
  return (
    <div className="space-y-3">
      <Label>القيمة المُدخلة</Label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onInclusiveChange(false)}
          className={cn(
            "flex-1 p-2 rounded-lg border text-xs text-center transition-colors",
            !inclusive ? "border-primary bg-primary/10 font-semibold" : "border-border hover:bg-muted/50"
          )}
        >
          بدون ضريبة
        </button>
        <button
          type="button"
          onClick={() => onInclusiveChange(true)}
          className={cn(
            "flex-1 p-2 rounded-lg border text-xs text-center transition-colors",
            inclusive ? "border-primary bg-primary/10 font-semibold" : "border-border hover:bg-muted/50"
          )}
        >
          شاملة الضريبة
        </button>
      </div>

      {entered > 0 && (
        <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">بدون ضريبة:</span>
            <span className="font-mono font-semibold">{formatCurrency(figures.excl)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">الضريبة ({rateText}%):</span>
            <span className="font-mono health-warning">{formatCurrency(figures.vat)}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-1.5">
            <span className="text-muted-foreground font-medium">شامل الضريبة:</span>
            <span className="font-mono font-bold">{formatCurrency(figures.incl)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
