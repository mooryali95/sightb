/**
 * The commitments section: what active commitments bind of the budget,
 * what they have spent, and the table. The form and the inspector live
 * under commitments/; the form is remounted on open through a dialog
 * session.
 */
import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { useDialogSession } from '@/hooks/useDialogSession';
import { formatCurrency } from '@/lib/finance';
import { COMMITMENT_STATUS_LABELS, COMMITMENT_STATUS_COLORS, type Commitment } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Pencil, Eye } from 'lucide-react';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { TableDensityToggle } from '@/components/ui/table-density-toggle';
import { useTableDensity } from '@/hooks/useTableDensity';
import { useResponsiveTableLabels } from '@/hooks/useResponsiveTableLabels';
import { CommitmentFormDialog } from './commitments/CommitmentFormDialog';
import { CommitmentInspector } from './commitments/CommitmentInspector';

interface Props {
  projectId: string;
  commitments: Commitment[];
  totalPlanned: number;
  readOnly?: boolean;
}

export function CommitmentsSection({ projectId, commitments, totalPlanned, readOnly = false }: Props) {
  const deleteCommitment = useStore((s) => s.deleteCommitment);
  // Remounted on open so an edit starts from the row and an add starts blank; see useDialogSession.
  const form = useDialogSession<{ commitment?: Commitment }>();
  const [inspectorId, setInspectorId] = useState<string | null>(null);
  const [density] = useTableDensity();
  const mobileTableRef = useResponsiveTableLabels<HTMLTableElement>();

  const activeCommitments = commitments.filter(c => c.status === 'active');
  const totalCommitted = activeCommitments.reduce((s, c) => s + c.totalAmount, 0);
  const totalSpent = activeCommitments.reduce((s, c) => s + c.spentAmount, 0);
  const availableBudget = totalPlanned - totalCommitted;
  const inspected = inspectorId ? commitments.find(c => c.id === inspectorId) : undefined;

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold">الالتزامات التعاقدية</h3>
          <p className="text-xs text-muted-foreground">
            {commitments.length} التزام · نشط: {formatCurrency(totalCommitted)} · مصروف: {formatCurrency(totalSpent)}
          </p>
        </div>
        {!readOnly && (
          <CommitmentFormDialog
            key={form.session}
            open={form.value !== null}
            onOpenChange={(v) => { if (!v) form.close(); }}
            onRequestOpen={() => form.open({})}
            editing={form.value?.commitment}
            projectId={projectId}
            commitments={commitments}
            totalPlanned={totalPlanned}
          />
        )}
      </div>

      {/* Summary cards */}
      {commitments.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="p-3 rounded-lg border border-border bg-muted/30 text-center">
            <p className="text-xs text-muted-foreground">إجمالي الالتزامات</p>
            <p className="text-sm font-mono font-bold mt-1">{formatCurrency(totalCommitted)}</p>
          </div>
          <div className="p-3 rounded-lg border border-border bg-muted/30 text-center">
            <p className="text-xs text-muted-foreground">المصروف</p>
            <p className="text-sm font-mono font-bold mt-1">{formatCurrency(totalSpent)}</p>
          </div>
          <div className="p-3 rounded-lg border border-border bg-muted/30 text-center">
            <p className="text-xs text-muted-foreground">متبقي من الالتزامات</p>
            <p className="text-sm font-mono font-bold mt-1">{formatCurrency(totalCommitted - totalSpent)}</p>
          </div>
          <div className="p-3 rounded-lg border border-border bg-muted/30 text-center">
            <p className="text-xs text-muted-foreground">المتاح من الموازنة</p>
            <p className={`text-sm font-mono font-bold mt-1 ${availableBudget >= 0 ? 'health-good' : 'text-destructive'}`}>
              {formatCurrency(availableBudget)}
            </p>
          </div>
        </div>
      )}

      {commitments.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">لا توجد التزامات تعاقدية بعد</p>
        </div>
      ) : (
        <>
        <div className="flex justify-end mb-2"><TableDensityToggle /></div>
        <div className="data-table-wrapper data-table-wrapper--scroll">
          <table ref={mobileTableRef} className="data-table data-table--mobile-cards" data-density={density}>
            <thead>
              <tr>
                <th>الوصف</th>
                <th>المورّد</th>
                <th>العقد</th>
                <th>المبلغ</th>
                <th>المصروف</th>
                <th>المتبقي</th>
                <th>الحالة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {commitments.map((c) => {
                const remaining = c.totalAmount - c.spentAmount;
                return (
                  <tr key={c.id}>
                    <td className="font-medium">{c.description}</td>
                    <td className="text-xs text-muted-foreground">{c.vendorName || '—'}</td>
                    <td className="text-xs text-muted-foreground">{c.contractRef || '—'}</td>
                    <td className="font-mono text-sm">{formatCurrency(c.totalAmount)}</td>
                    <td className="font-mono text-sm">{formatCurrency(c.spentAmount)}</td>
                    <td><span className={remaining >= 0 ? 'badge-profit' : 'badge-loss'}>{formatCurrency(remaining)}</span></td>
                    <td>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${COMMITMENT_STATUS_COLORS[c.status]}`}>
                        {COMMITMENT_STATUS_LABELS[c.status]}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-0.5">
                        <Button variant="ghost" size="icon" aria-label="عرض التفاصيل" onClick={() => setInspectorId(c.id)}>
                          <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                        </Button>
                        {!readOnly && (
                          <>
                            <Button variant="ghost" size="icon" aria-label="تعديل" onClick={() => form.open({ commitment: c })}>
                              <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                            </Button>
                            <ConfirmDeleteDialog title="حذف الالتزام" description="هل أنت متأكد من حذف هذا الالتزام؟" onConfirm={() => deleteCommitment(c.id)} />
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}

      {inspected && (
        <CommitmentInspector
          commitment={inspected}
          readOnly={readOnly}
          onClose={() => setInspectorId(null)}
          onEdit={() => { form.open({ commitment: inspected }); setInspectorId(null); }}
        />
      )}
    </div>
  );
}
