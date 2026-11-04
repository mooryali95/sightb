/**
 * «تمويل من المنظومة» on the project's funds tab: what the company lent the
 * project (often from a loan it took), what came back, and what the project
 * still owes. When the project has collected since, it says how much can go
 * back now, and links to the company page where the repayment is recorded.
 */
import { Link } from 'react-router-dom';
import { ArrowLeft, HandCoins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/finance';
import { useCompanyLedger } from '@/hooks/useCompanyLedger';
import { fundingByProject, recoveryAlerts } from '@/lib/finance/loans';
import type { Revenue } from '@/types/project';

interface Props { projectId: string; companyId: string | undefined; revenues: Revenue[] }

export function CompanyFundingCard({ projectId, companyId, revenues }: Props) {
  const ledger = useCompanyLedger(companyId);
  if (!ledger.data || !companyId) return null;
  const funding = fundingByProject(ledger.data.entries).find((f) => f.projectId === projectId);
  if (!funding) return null;
  const collected = revenues.filter((r) => r.status === 'collected')
    .map((r) => ({ projectId, amount: r.amount, date: r.collectionDate || r.date }));
  const recovery = recoveryAlerts([funding], collected)[0];
  const pct = funding.funded > 0 ? Math.min(100, (funding.returned / funding.funded) * 100) : 0;

  return (
    <section className="stat-card" aria-label="تمويل من المنظومة">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2"><HandCoins className="w-4 h-4 text-primary" />تمويل من المنظومة</h3>
          <p className="text-xs text-muted-foreground mt-0.5">مال أقرضته المنظومة للمشروع. ليس مصروفاً ولا دخلاً: يُرد للمنظومة حين يحصّل المشروع.</p>
        </div>
        <Button asChild size="sm" variant="outline" className="gap-1">
          <Link to={`/company/${companyId}`}>صفحة المنظومة<ArrowLeft className="w-3.5 h-3.5" /></Link>
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center mt-3">
        <div><p className="text-xs text-muted-foreground">موَّلت</p><p className="font-mono text-sm font-semibold">{formatCurrency(funding.funded)}</p></div>
        <div><p className="text-xs text-muted-foreground">رُدّ</p><p className="font-mono text-sm font-semibold text-success">{formatCurrency(funding.returned)}</p></div>
        <div><p className="text-xs text-muted-foreground">باقٍ على المشروع</p><p className="font-mono text-sm font-semibold text-primary">{formatCurrency(funding.outstanding)}</p></div>
      </div>
      <div className="h-1.5 rounded-full bg-muted mt-3 overflow-hidden" aria-hidden><div className="h-full bg-success" style={{ width: `${pct}%` }} /></div>
      {recovery && (
        <p role="status" className="mt-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
          حصّل المشروع {formatCurrency(recovery.available)} منذ تمويله؛ يمكن رد {formatCurrency(recovery.suggested)} للمنظومة الآن. سجّله من صفحة المنظومة.
        </p>
      )}
      {funding.outstanding <= 0 && <p className="mt-3 text-xs text-success">رُدّ التمويل بالكامل.</p>}
    </section>
  );
}
