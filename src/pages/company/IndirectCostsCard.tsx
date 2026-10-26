/**
 * Indirect costs recorded the older way, before company expenses. New
 * company spend is recorded once, as a company expense («مصروف منظومة»),
 * so this card only lists what is left here, with its total, and lets it
 * be deleted once moved. With nothing left it does not show.
 */
import { useStore } from '@/store/useStore';
import { formatCurrency } from '@/lib/finance';
import { INDIRECT_COST_CATEGORY_LABELS, type IndirectCost } from '@/types/project';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { toast } from 'sonner';

interface Props {
  companyId: string;
  costs: IndirectCost[];
  canEdit: boolean;
}

export function IndirectCostsCard({ companyId, costs, canEdit }: Props) {
  const deleteIndirectCost = useStore((s) => s.deleteIndirectCost);
  if (costs.length === 0) return null;
  const totalIndirect = costs.reduce((s, ic) => s + ic.amount, 0);
  return (
    <div className="stat-card mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold">التكاليف غير المباشرة (سجل قديم)</h3>
          <p className="text-xs text-muted-foreground mt-0.5">تُطرح من صافي الشركة كما هي. أي مصروف جديد للشركة يُسجَّل من «مصروف منظومة» فقط، حتى لا يُسجَّل مرتين.</p>
        </div>
      </div>

      {costs.length > 0 ? (
        <>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>الفئة</th>
                  <th>الوصف</th>
                  <th>المبلغ</th>
                  <th>الشهر</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {costs.map(ic => (
                  <tr key={ic.id}>
                    <td className="text-xs">{INDIRECT_COST_CATEGORY_LABELS[ic.category]}</td>
                    <td className="font-medium">{ic.description}</td>
                    <td className="font-mono text-sm">{formatCurrency(ic.amount)}</td>
                    <td className="text-xs">شهر {ic.month}</td>
                    {canEdit && (
                      <td>
                        <ConfirmDeleteDialog onConfirm={async () => {
                          try { await deleteIndirectCost(ic.id); toast.success('تم الحذف'); } catch { toast.error('فشل الحذف'); }
                        }} title="حذف التكلفة" description={`هل أنت متأكد من حذف "${ic.description}"؟`} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 p-3 rounded-lg bg-muted/30 flex items-center justify-between">
            <span className="text-sm font-semibold">إجمالي التكاليف غير المباشرة</span>
            <span className="font-mono font-bold text-destructive">{formatCurrency(totalIndirect)}</span>
          </div>
        </>
      ) : (
        <div className="text-center py-6 text-muted-foreground text-sm">لا توجد تكاليف غير مباشرة</div>
      )}
    </div>
  );
}
