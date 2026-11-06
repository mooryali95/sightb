/** The two snapshots of an approved amendment side by side, item by item. */
import { formatCurrency } from '@/lib/finance';
import { EXPENSE_CATEGORY_LABELS, type BudgetAmendment, type ExpenseCategory } from '@/types/project';
import { compareSnapshots } from './compareSnapshots';

export function ComparisonView({ amendment }: { amendment: BudgetAmendment }) {
  const before = amendment.snapshotBefore;
  const after = amendment.snapshotAfter || [];
  const delta = (amendment.totalAfter ?? 0) - amendment.totalBefore;
  const rows = compareSnapshots(before, after);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-lg border border-border bg-muted/30 text-center">
          <p className="text-xs text-muted-foreground">قبل التعديل</p>
          <p className="text-sm font-mono font-bold mt-1">{formatCurrency(amendment.totalBefore)}</p>
          <p className="text-xs text-muted-foreground">{before.length} بند</p>
        </div>
        <div className="p-3 rounded-lg border border-border bg-muted/30 text-center">
          <p className="text-xs text-muted-foreground">بعد التعديل</p>
          <p className="text-sm font-mono font-bold mt-1">{formatCurrency(amendment.totalAfter ?? 0)}</p>
          <p className="text-xs text-muted-foreground">{after.length} بند</p>
        </div>
        <div className="p-3 rounded-lg border border-border bg-muted/30 text-center">
          <p className="text-xs text-muted-foreground">الفرق</p>
          <p className={`text-sm font-mono font-bold mt-1 ${delta >= 0 ? 'text-success' : 'text-destructive'}`}>
            {delta >= 0 ? '+' : ''}{formatCurrency(delta)}
          </p>
        </div>
      </div>

      <div className="space-y-1 text-xs">
        <p><span className="font-semibold">السبب:</span> {amendment.reason}</p>
        {amendment.approvedAt && (
          <p className="text-muted-foreground">
            اعتُمد في: {new Date(amendment.approvedAt).toLocaleString('ar-SA', {
              calendar: 'gregory', year: 'numeric', month: 'short', day: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </p>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>الحالة</th>
              <th>الفئة</th>
              <th>الوصف</th>
              <th>قبل</th>
              <th>بعد</th>
              <th>الفرق</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const beforeAmt = r.before?.plannedAmount ?? 0;
              const afterAmt = r.after?.plannedAmount ?? 0;
              const diff = afterAmt - beforeAmt;
              const item = r.after || r.before;
              const badgeClass =
                r.type === 'added' ? 'bg-success/10 text-success' :
                r.type === 'removed' ? 'bg-destructive/10 text-destructive' :
                r.type === 'modified' ? 'bg-warning/10 text-warning' :
                'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
              const label = r.type === 'added' ? 'مُضاف' : r.type === 'removed' ? 'محذوف' : r.type === 'modified' ? 'مُعدّل' : '—';
              return (
                <tr key={r.key} className={r.type === 'unchanged' ? 'opacity-60' : ''}>
                  <td><span className={`text-xs px-1.5 py-0.5 rounded-full ${badgeClass}`}>{label}</span></td>
                  <td className="text-xs">{EXPENSE_CATEGORY_LABELS[item?.category as ExpenseCategory] || item?.category}</td>
                  <td className="text-xs">{item?.description}</td>
                  <td className="font-mono text-xs">{r.before ? formatCurrency(beforeAmt) : '—'}</td>
                  <td className="font-mono text-xs">{r.after ? formatCurrency(afterAmt) : '—'}</td>
                  <td className={`font-mono text-xs ${diff > 0 ? 'text-success' : diff < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {diff !== 0 ? `${diff > 0 ? '+' : ''}${formatCurrency(diff)}` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
