import { formatCurrency, calcVAT, addVAT, removeVAT } from '@/lib/finance';

interface VatControlsProps {
  amount: number;
  taxPercent: number;
  isVatExempt: boolean;
  onExemptChange: (exempt: boolean) => void;
  inputInclusive: boolean;
  onInclusiveChange: (inclusive: boolean) => void;
}

/** The exemption and the inclusive switch, with the VAT the amount typed implies either way. */
export function VatControls({ amount, taxPercent, isVatExempt, onExemptChange, inputInclusive, onInclusiveChange }: VatControlsProps) {
  return (
    <>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={isVatExempt} onChange={(e) => onExemptChange(e.target.checked)} className="rounded" />
          معفى من الضريبة
        </label>
        {!isVatExempt && (
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={inputInclusive} onChange={(e) => onInclusiveChange(e.target.checked)} className="rounded" />
            المبلغ شامل الضريبة
          </label>
        )}
      </div>
      {amount > 0 && !isVatExempt && taxPercent > 0 && (
        <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
          {inputInclusive
            ? `بدون ضريبة: ${formatCurrency(removeVAT(amount, taxPercent))} · الضريبة: ${formatCurrency(amount - removeVAT(amount, taxPercent))}`
            : `شامل الضريبة: ${formatCurrency(addVAT(amount, taxPercent))} · الضريبة: ${formatCurrency(calcVAT(amount, taxPercent))}`}
        </p>
      )}
    </>
  );
}
