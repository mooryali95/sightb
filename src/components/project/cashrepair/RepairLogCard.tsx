import { formatCurrency } from '@/lib/finance';
import type { CashTransferRepair } from '@/services/cashRepairService';
import { History } from 'lucide-react';

interface RepairLogCardProps {
  repairs: CashTransferRepair[];
  loading: boolean;
  onOpen: (repair: CashTransferRepair) => void;
}

/** سجل تدقيق الإصلاحات المسجّلة للمشروع، كل سطر يفتح تفاصيله. */
export function RepairLogCard({ repairs, loading, onOpen }: RepairLogCardProps) {
  return (
    <div className="stat-card space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-1.5">
        <History className="w-4 h-4" />سجل إصلاح التحويلات بلا مصدر
      </h3>
      {loading ? (
        <p className="text-xs text-muted-foreground">جارٍ التحميل…</p>
      ) : repairs.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">لا توجد عمليات إصلاح مسجّلة لهذا المشروع</p>
      ) : (
        <div className="space-y-2">
          {repairs.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onOpen(r)}
              className="w-full text-start p-3 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium truncate">
                  {r.custodyName || r.custodyId || '—'} · {formatCurrency(r.amount)}
                </span>
                <span className="text-xs text-muted-foreground font-mono shrink-0">
                  {r.createdAt.split('T')[0]}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{r.reason}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{r.performedByEmail ?? r.performedBy}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
