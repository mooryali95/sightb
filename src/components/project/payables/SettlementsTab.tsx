/**
 * The final-settlements tab.
 *
 * The cleanest of the three to lift out: it holds no state of its own, reads
 * two derived lists, and calls a single store action. Everything it shows is a
 * function of its props.
 */
import { useStore } from '@/store/useStore';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/utils';
import { formatCurrency } from '@/lib/finance';
import {
  RESOURCE_SETTLEMENT_STATUS_COLORS,
  RESOURCE_SETTLEMENT_STATUS_LABELS,
  type Resource,
  type ResourceSettlement,
} from '@/types/project';

interface Props {
  projSettles: ResourceSettlement[];
  projResources: Resource[];
  isAdmin: boolean;
}

export function SettlementsTab({ projSettles, projResources, isAdmin }: Props) {
  const { signResourceSettlement } = useStore();

  return (
    <div className="space-y-3">
    <h3 className="text-base font-semibold">المخالصات النهائية</h3>
    {projSettles.length === 0 ? (
      <p className="text-sm text-muted-foreground p-6 text-center">
        لا توجد مخالصات. أنشئ مخالصة من جدول أرصدة الموارد أعلاه.
      </p>
    ) : (
      <div className="space-y-3">
        {projSettles.map((s) => {
          const res = projResources.find((r) => r.id === s.resourceId);
          return (
            <Card key={s.id} className="p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="font-semibold">{res?.name || '—'}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.periodFrom || '—'} → {s.periodTo || '—'}
                  </div>
                </div>
                <Badge className={RESOURCE_SETTLEMENT_STATUS_COLORS[s.status]}>
                  {RESOURCE_SETTLEMENT_STATUS_LABELS[s.status]}
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm my-3">
                <div><span className="text-muted-foreground">المستحق:</span> <strong>{formatCurrency(s.totalOwed)}</strong></div>
                <div><span className="text-muted-foreground">المدفوع:</span> <strong className="text-emerald-600">{formatCurrency(s.totalPaid)}</strong></div>
                <div><span className="text-muted-foreground">الفرق:</span> <strong className={s.balance > 0 ? 'text-amber-600' : ''}>{formatCurrency(s.balance)}</strong></div>
              </div>
              {s.settlementTextAr && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">نص المخالصة</summary>
                  <pre className="mt-2 whitespace-pre-wrap font-sans bg-muted/30 p-3 rounded">{s.settlementTextAr}</pre>
                </details>
              )}
              {isAdmin && s.status === 'draft' && (
                <div className="mt-3">
                  <Button size="sm"
                    onClick={async () => {
                      try { await signResourceSettlement(s.id); toast.success('تم توقيع المخالصة'); }
                      catch (e) { toast.error(errorMessage(e)); }
                    }}>
                    توقيع وإقفال المخالصة
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    )}
  
    </div>
  );
}
