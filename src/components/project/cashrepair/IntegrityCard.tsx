import { formatCurrency } from '@/lib/finance';
import type { CashIntegrityReport, OrphanTransfer } from '@/lib/cash-integrity';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, Loader2, Wrench } from 'lucide-react';

interface IntegrityCardProps {
  integrity: CashIntegrityReport;
  custodyName: (id: string) => string;
  readOnly?: boolean;
  /** A repair is running: every repair button waits. */
  saving: boolean;
  /** The transfer whose repair is running, if any, shown with a spinner. */
  repairingId: string | null;
  onRepair: (orphan: OrphanTransfer) => void;
}

/** الحالة الحيّة للترابط النقدي: إما كل شيء مرتبط، أو قائمة التحويلات اليتيمة مع زر إصلاح لكل منها. */
export function IntegrityCard({ integrity, custodyName, readOnly, saving, repairingId, onRepair }: IntegrityCardProps) {
  return (
    <div className="stat-card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Wrench className="w-4 h-4" />سلامة الترابط النقدي
        </h3>
        {integrity.clean ? (
          <Badge className="gap-1 bg-success/10 text-success border-success/20">
            <CheckCircle2 className="w-3 h-3" />لا توجد تحويلات بلا مصدر
          </Badge>
        ) : (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="w-3 h-3" />{integrity.orphanTransfers.length} تحويل بلا مصدر
          </Badge>
        )}
      </div>

      {integrity.clean ? (
        <p className="text-xs text-muted-foreground">
          كل تحويل وارد مرتبط بدفعة أصل، وأرقام العهد (المتاح/المصروف/المتبقي) مطابقة لقواعد الربط.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            هذه التحويلات ترفع رصيد العهدة بمقدار {formatCurrency(integrity.inflatedAmount)} دون دفعة أصل.
          </p>
          {integrity.orphanTransfers.map((o) => (
            <div key={o.transferId} className="flex items-center justify-between gap-2 p-2 rounded border border-destructive/30 bg-destructive/5">
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">
                  {custodyName(o.custodyId)} · {formatCurrency(o.amount)}
                </p>
                <p className="text-xs text-muted-foreground font-mono">{o.transferDate}</p>
              </div>
              {!readOnly && (
                <Button size="sm" variant="outline" disabled={saving} onClick={() => { if (!saving) onRepair(o); }}>
                  {repairingId === o.transferId ? (
                    <><Loader2 className="w-3 h-3 ms-1 animate-spin" />جارٍ الإصلاح…</>
                  ) : 'إصلاح'}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
