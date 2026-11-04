/**
 * The change-orders section: the contract line (original, effective, and
 * the approved impact between them) and the list. The form lives under
 * changeorders/ and is remounted on open through a dialog session.
 */
import { useStore } from '@/store/useStore';
import { useDialogSession } from '@/hooks/useDialogSession';
import { formatCurrency } from '@/lib/finance';
import {
  CHANGE_ORDER_TYPE_LABELS, CHANGE_ORDER_STATUS_LABELS, CHANGE_ORDER_STATUS_COLORS, type ChangeOrder,
} from '@/types/project';
import { Button } from '@/components/ui/button';
import { Pencil } from 'lucide-react';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { ChangeOrderFormDialog } from './changeorders/ChangeOrderFormDialog';

interface ChangeOrdersSectionProps {
  projectId: string;
  changeOrders: ChangeOrder[];
  contractValue: number;
  readOnly?: boolean;
}

export function ChangeOrdersSection({ projectId, changeOrders, contractValue, readOnly = false }: ChangeOrdersSectionProps) {
  const deleteChangeOrder = useStore((s) => s.deleteChangeOrder);
  // Remounted on open so an edit starts from the row and an add starts blank; see useDialogSession.
  const form = useDialogSession<{ order?: ChangeOrder }>();

  const approvedImpact = changeOrders.filter(co => co.status === 'approved').reduce((s, co) => s + co.amountImpact, 0);
  const effectiveValue = contractValue + approvedImpact;

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold">أوامر التغيير</h3>
          <p className="text-xs text-muted-foreground">
            الأصلية: {formatCurrency(contractValue)} · المعدّلة: {formatCurrency(effectiveValue)}
            {approvedImpact !== 0 && ` · الأثر: ${approvedImpact > 0 ? '+' : ''}${formatCurrency(approvedImpact)}`}
          </p>
        </div>
        {!readOnly && (
          <ChangeOrderFormDialog
            key={form.session}
            open={form.value !== null}
            onOpenChange={(v) => { if (!v) form.close(); }}
            onRequestOpen={() => form.open({})}
            editing={form.value?.order}
            projectId={projectId}
          />
        )}
      </div>

      {changeOrders.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">لا توجد أوامر تغيير</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>الوصف</th>
                <th>النوع</th>
                <th>الأثر المالي</th>
                <th>أثر المدة</th>
                <th>بنود</th>
                <th>الحالة</th>
                {!readOnly && <th></th>}
              </tr>
            </thead>
            <tbody>
              {changeOrders.map((co) => (
                <tr key={co.id}>
                  <td>{co.description}</td>
                  <td className="text-xs">{CHANGE_ORDER_TYPE_LABELS[co.changeType]}</td>
                  <td className={`font-mono text-sm ${co.amountImpact >= 0 ? 'health-good' : 'text-destructive'}`}>
                    {co.amountImpact > 0 ? '+' : ''}{formatCurrency(co.amountImpact)}
                  </td>
                  <td className="text-xs">{co.durationImpact !== 0 ? `${co.durationImpact > 0 ? '+' : ''}${co.durationImpact} شهر` : '—'}</td>
                  <td className="text-xs">
                    {(co.budgetItems || []).length > 0 ? (
                      <span className="text-primary font-medium">{co.budgetItems!.length} بند</span>
                    ) : '—'}
                  </td>
                  <td>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${CHANGE_ORDER_STATUS_COLORS[co.status]}`}>
                      {CHANGE_ORDER_STATUS_LABELS[co.status]}
                    </span>
                  </td>
                  {!readOnly && (
                  <td>
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="icon" title="تعديل أمر التغيير" onClick={() => form.open({ order: co })}>
                        <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                      <ConfirmDeleteDialog title="حذف أمر التغيير" description="هل أنت متأكد من حذف أمر التغيير هذا؟" onConfirm={() => deleteChangeOrder(co.id)} />
                    </div>
                  </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
