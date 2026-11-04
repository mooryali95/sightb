/**
 * «محمَّل من المنظومة» on the project's expenses tab: the share of company
 * expenses (salaries, owners' pay, rent…) the company charged to this
 * project. It is shown beside the project's own spend, never inside it:
 * the budget, its spend rate and the direct actual cost stay as they are,
 * and the full cost adds what the project has not already paid itself. A
 * share the project settled from its own spend (it repaid whoever paid the
 * company's bill) is listed, marked, and not counted twice.
 */
import { useQuery } from '@tanstack/react-query';
import { Landmark } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/finance';
import { COMPANY_EXPENSE_KIND_LABELS, chargedCostTotals } from '@/lib/finance/company-ledger';
import { LedgerNotReady, listProjectChargedCosts } from '@/services/companyLedgerService';

interface Props { projectId: string; directActual: number }

export function ChargedCostsCard({ projectId, directActual }: Props) {
  const charged = useQuery({
    queryKey: ['project-charged-costs', projectId],
    queryFn: () => listProjectChargedCosts(projectId),
    staleTime: 60_000,
    retry: (count, error) => !(error instanceof LedgerNotReady) && count < 2,
  });
  // Nothing to show until the ledger is live, or when nothing was charged.
  if (charged.error instanceof LedgerNotReady || !charged.data || charged.data.length === 0) return null;

  const totals = chargedCostTotals(charged.data, directActual);
  return (
    <section className="stat-card" aria-label="محمَّل من المنظومة">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2"><Landmark className="w-4 h-4 text-primary" />محمَّل من المنظومة</h3>
          <p className="text-xs text-muted-foreground mt-0.5">حصة المشروع من مصاريف الشركة. تُعرض منفصلة: لا تدخل المصروف المباشر ولا نسبة صرف الموازنة.</p>
          {totals.settledInProject > 0 && (
            <p className="text-xs text-muted-foreground mt-1">منها {formatCurrency(totals.settledInProject)} سدّدها المشروع من مصروفه، فهي ضمن المصروف المباشر ولا تُضاف مرة ثانية.</p>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Figure label="المصروف المباشر" value={directActual} />
          <Figure label="محمَّل من المنظومة" value={totals.charged} accent />
          <Figure label="التكلفة الشاملة" value={totals.fullCost} strong />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>التاريخ</th><th>النوع</th><th>البيان</th><th>المحمَّل على المشروع</th><th>من أصل</th></tr></thead>
          <tbody>
            {charged.data.map((r) => (
              <tr key={r.allocationId}>
                <td className="text-xs font-mono">{r.date}</td>
                <td><Badge variant="outline" className="text-xs">{COMPANY_EXPENSE_KIND_LABELS[r.kind] ?? r.kind}</Badge></td>
                <td className="text-sm">
                  {r.description || '—'}
                  {r.settledInProject && <Badge variant="secondary" className="ms-2 text-xs">مسدَّد ضمن مصروف المشروع</Badge>}
                </td>
                <td className="font-mono text-sm font-semibold">{formatCurrency(r.amount)}</td>
                <td className="font-mono text-xs text-muted-foreground">{formatCurrency(r.expenseAmount)} · {((r.amount / r.expenseAmount) * 100).toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Figure({ label, value, accent, strong }: { label: string; value: number; accent?: boolean; strong?: boolean }) {
  return (
    <div className={`rounded-md px-3 py-1.5 ${strong ? 'bg-primary/10' : accent ? 'bg-muted/50' : 'bg-muted/30'}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-mono text-sm ${strong ? 'font-bold text-primary' : 'font-semibold'}`}>{formatCurrency(value)}</p>
    </div>
  );
}
