/**
 * The resources section: the people on a project, each against the plan
 * behind them and the spend charged to them. The form, the inspector, the
 * budget-item prompt and the per-resource figures live under resources/.
 */
import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { useDialogSession } from '@/hooks/useDialogSession';
import { formatCurrency, getCountedExpenses } from '@/lib/finance';
import { type Resource, type BudgetItem, type Expense } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Pencil, Eye } from 'lucide-react';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { TableDensityToggle } from '@/components/ui/table-density-toggle';
import { useTableDensity } from '@/hooks/useTableDensity';
import { useResponsiveTableLabels } from '@/hooks/useResponsiveTableLabels';
import { ResourceFormDialog, type AddedResource } from './resources/ResourceFormDialog';
import { ResourceInspector } from './resources/ResourceInspector';
import { BudgetItemPrompt } from './resources/BudgetItemPrompt';
import { resourceFigures } from './resources/resourceFigures';

interface ResourcesSectionProps {
  projectId: string;
  resources: Resource[];
  budgetItems?: BudgetItem[];
  expenses?: Expense[];
  readOnly?: boolean;
  durationMonths?: number;
}

export function ResourcesSection({ projectId, resources, budgetItems = [], expenses: propExpenses, readOnly = false, durationMonths = 0 }: ResourcesSectionProps) {
  const { deleteResource, expenses: storeExpenses } = useStore();
  // Remounted on open so an edit starts from the row and an add starts blank; see useDialogSession.
  const form = useDialogSession<{ resource?: Resource }>();
  const [inspectorId, setInspectorId] = useState<string | null>(null);
  const [budgetPrompt, setBudgetPrompt] = useState<AddedResource | null>(null);
  const [density] = useTableDensity();
  const mobileTableRef = useResponsiveTableLabels<HTMLTableElement>();

  const pExpenses = propExpenses || storeExpenses.filter(e => e.projectId === projectId);
  // What a resource is charged with is what every summary counts as spend:
  // not a rejected expense, not an advance still outstanding.
  const countedExpenses = getCountedExpenses(pExpenses);
  const figuresFor = (r: Resource) => resourceFigures(r, budgetItems, countedExpenses, durationMonths);

  const totalMonthlyCost = resources.reduce((s, r) => s + r.monthlyCost, 0);
  // Any resource whose plan is the estimate gets the footnote under the table.
  const hasEstimated = resources.some(r => budgetItems.filter(b => b.resourceId === r.id).length === 0 && r.monthlyCost > 0);
  const inspected = resources.find(x => x.id === inspectorId);

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold">الموارد البشرية</h3>
          <p className="text-xs text-muted-foreground">{resources.length} مورد · التكلفة الشهرية: {formatCurrency(totalMonthlyCost)}</p>
        </div>
        {!readOnly && (
          <ResourceFormDialog
            key={form.session}
            open={form.value !== null}
            onOpenChange={(v) => { if (!v) form.close(); }}
            onRequestOpen={() => form.open({})}
            editing={form.value?.resource}
            projectId={projectId}
            onAdded={(added) => { if (added.monthlyCost > 0 && durationMonths > 0) setBudgetPrompt(added); }}
          />
        )}
      </div>

      {resources.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground mb-2">لا توجد موارد مسجلة بعد</p>
          <p className="text-xs text-muted-foreground">ابدأ بتسجيل الموارد البشرية ← ثم أضف بنود الموازنة</p>
        </div>
      ) : (
        <>
        <div className="flex justify-end mb-2"><TableDensityToggle /></div>
        <div className="data-table-wrapper data-table-wrapper--scroll">
          <table ref={mobileTableRef} className="data-table data-table--mobile-cards" data-density={density}>
            <thead>
              <tr>
                <th>الاسم</th>
                <th>الدور</th>
                <th>التكلفة الشهرية</th>
                <th>المخطط</th>
                <th>إجمالي الصرف</th>
                <th>الانحراف</th>
                <th>نسبة الصرف</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {resources.map((r) => {
                const { plannedForResource, isEstimated, totalSpent, variance, spentPct } = figuresFor(r);

                return (
                  <tr key={r.id}>
                    <td className="font-medium">{r.name}</td>
                    <td className="text-muted-foreground">{r.role || '—'}</td>
                    <td className="font-mono text-sm">{formatCurrency(r.monthlyCost)}</td>
                    <td className="font-mono text-sm">
                      {plannedForResource > 0 ? (
                        <span className="flex items-center gap-1">
                          {formatCurrency(plannedForResource)}
                          {isEstimated && <span className="text-amber-500 text-xs">*</span>}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="font-mono text-sm">{formatCurrency(totalSpent)}</td>
                    <td>
                      {plannedForResource > 0 ? (
                        <span className={variance >= 0 ? 'badge-profit' : 'badge-loss'}>{formatCurrency(variance)}</span>
                      ) : '—'}
                    </td>
                    <td className="text-xs">
                      {plannedForResource > 0 ? (
                        <span className={spentPct > 100 ? 'text-destructive font-bold' : spentPct > 90 ? 'text-amber-600' : 'text-muted-foreground'}>
                          {spentPct.toFixed(0)}%
                        </span>
                      ) : totalSpent > 0 ? (
                        <span className="text-amber-600">صرف بدون خطة</span>
                      ) : '—'}
                    </td>
                    <td>
                      <div className="flex items-center gap-0.5">
                        <Button variant="ghost" size="icon" onClick={() => setInspectorId(r.id)} title="عرض التفاصيل">
                          <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                        </Button>
                        {!readOnly && (
                          <>
                            <Button variant="ghost" size="icon" onClick={() => form.open({ resource: r })}>
                              <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                            </Button>
                            <ConfirmDeleteDialog title="حذف المورد" description="هل أنت متأكد من حذف هذا المورد؟" onConfirm={() => deleteResource(r.id)} />
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {hasEstimated && (
            <p className="text-xs text-muted-foreground mt-2">* تقديري = التكلفة الشهرية × مدة المشروع — لم يُربط ببند موازنة بعد</p>
          )}
        </div>
        </>
      )}

      {inspected && (
        <ResourceInspector
          resource={inspected}
          figures={figuresFor(inspected)}
          linkedExpenses={pExpenses.filter(e => e.resourceId === inspected.id)}
          durationMonths={durationMonths}
          readOnly={readOnly}
          onClose={() => setInspectorId(null)}
          onEdit={() => { setInspectorId(null); form.open({ resource: inspected }); }}
        />
      )}

      <BudgetItemPrompt prompt={budgetPrompt} projectId={projectId} durationMonths={durationMonths} onClose={() => setBudgetPrompt(null)} />
    </div>
  );
}
