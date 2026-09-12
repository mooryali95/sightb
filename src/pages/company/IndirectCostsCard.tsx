/**
 * The company's indirect costs: the list, its total, and the form to add
 * one. Adding and deleting go to the store from here; the page only says
 * whether this user may write.
 */
import { useStore } from '@/store/useStore';
import { useDialogSession } from '@/hooks/useDialogSession';
import { formatCurrency } from '@/lib/finance';
import { INDIRECT_COST_CATEGORY_LABELS, type IndirectCost } from '@/types/project';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { toast } from 'sonner';
import { IndirectCostFormDialog } from './IndirectCostFormDialog';

interface Props {
  companyId: string;
  costs: IndirectCost[];
  canEdit: boolean;
}

export function IndirectCostsCard({ companyId, costs, canEdit }: Props) {
  const deleteIndirectCost = useStore((s) => s.deleteIndirectCost);
  // Remounted on open so the form starts blank every time; see useDialogSession.
  const form = useDialogSession<true>();
  const totalIndirect = costs.reduce((s, ic) => s + ic.amount, 0);
  return (
    <div className="stat-card mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">التكاليف غير المباشرة</h3>
        {canEdit && (
          <IndirectCostFormDialog
            key={form.session}
            open={form.value !== null}
            onOpenChange={(v) => { if (!v) form.close(); }}
            onRequestOpen={() => form.open(true)}
            companyId={companyId}
          />
        )}
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
