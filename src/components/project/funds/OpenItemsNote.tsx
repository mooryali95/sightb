import { formatCurrency } from '@/lib/finance';
import type { FundOpenItems } from '@/lib/funds';

/** Why the remaining cannot close at zero: the open custodies and outstanding advances of the fund, or the all-clear. */
export function OpenItemsNote({ open }: { open: FundOpenItems }) {
  const hasOpen = open.openCustodies.length > 0 || open.outstandingAdvances.length > 0;
  if (!hasOpen) {
    return (
      <div className="text-xs p-2 rounded-md bg-success/10 text-success border border-success/20">
        ✓ كل مكونات الدفعة موثّقة. لا توجد عهد مفتوحة أو سلف قائمة — المتبقي = 0 يعني الإقفال الكامل.
      </div>
    );
  }
  return (
    <div className="text-xs p-2 rounded-md bg-warning/10 border border-warning/20 space-y-1.5">
      <p className="font-semibold text-warning-foreground">بنود غير مسوّاة تمنع إقفال المتبقي عند 0:</p>
      {open.openCustodies.length > 0 && (
        <div>
          <p className="text-muted-foreground">عهد مفتوحة من هذه الدفعة:</p>
          <ul className="list-disc ps-4 mt-0.5">
            {open.openCustodies.map((c) => (
              <li key={c.id}>{c.resourceName} — متبقي فيها: <span className="font-mono">{formatCurrency(c.remaining)}</span></li>
            ))}
          </ul>
        </div>
      )}
      {open.outstandingAdvances.length > 0 && (
        <div>
          <p className="text-muted-foreground">سلف قائمة على موردين:</p>
          <ul className="list-disc ps-4 mt-0.5">
            {open.outstandingAdvances.map((a) => (
              <li key={a.id}>{a.description} — <span className="font-mono">{formatCurrency(a.remaining)}</span></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
