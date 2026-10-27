/**
 * «سلامة البيانات» on the company page: the integrity rules run over every
 * project of the company, every time the page opens. All clear, it says so
 * in one line; otherwise each problem in plain words, with its project and
 * amount, and a link straight to it.
 */
import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Info, ShieldCheck, XCircle } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { formatCurrency, getEffectiveContractValue } from '@/lib/finance';
import { checkIntegrity, type IntegritySeverity } from '@/lib/finance/integrity';
import type { Project } from '@/types/project';

const ICON: Record<IntegritySeverity, JSX.Element> = {
  error: <XCircle className="w-4 h-4 text-destructive shrink-0" />,
  warning: <AlertTriangle className="w-4 h-4 text-warning shrink-0" />,
  info: <Info className="w-4 h-4 text-muted-foreground shrink-0" />,
};

export function IntegrityCard({ projects }: { projects: Project[] }) {
  const s = useStore();
  const { loadFundsForProject, loadResourcePayablesForProject } = s;
  // Funds and payables load per project; bring the company's in once.
  const ids = projects.map((p) => p.id).join(',');
  useEffect(() => {
    for (const id of ids.split(',').filter(Boolean)) {
      loadFundsForProject(id).catch(() => undefined);
      loadResourcePayablesForProject(id).catch(() => undefined);
    }
  }, [ids, loadFundsForProject, loadResourcePayablesForProject]);

  const issues = useMemo(() => checkIntegrity({
    projects, expenses: s.expenses, custodies: s.custodies, funds: s.projectFunds, settlements: s.fundSettlements,
    revenues: s.revenues, reimbursements: s.reimbursements, paymentRequests: s.paymentRequests, cashTransfers: s.cashTransfers,
    contractOf: (pid) => {
      const p = projects.find((x) => x.id === pid);
      return p ? getEffectiveContractValue(p.contractValue, s.changeOrders.filter((c) => c.projectId === pid)) : 0;
    },
  }), [projects, s.expenses, s.custodies, s.projectFunds, s.fundSettlements, s.revenues, s.reimbursements, s.paymentRequests, s.cashTransfers, s.changeOrders]);

  const problems = issues.filter((i) => i.severity !== 'info');
  const name = (pid: string) => projects.find((p) => p.id === pid)?.name ?? 'مشروع';

  return (
    <section className="stat-card mb-6" aria-label="سلامة البيانات">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary" />سلامة البيانات</h3>
        <span className="text-[11px] text-muted-foreground">كل مبلغ له مصدر · لا تكرار · كل عهدة ودفعة متوازنة · كل فرق له سبب</span>
      </div>
      {problems.length === 0 ? (
        <p className="mt-2 text-sm flex items-center gap-2 text-success"><CheckCircle2 className="w-4 h-4" />الحسابات مغلقة: لا مبلغ بلا مصدر ولا تكرار ولا رصيد مكشوف.</p>
      ) : (
        <p className="mt-2 text-sm text-destructive">{problems.length === 1 ? 'ملاحظة واحدة تحتاج تصحيحاً' : `${problems.length} ملاحظات تحتاج تصحيحاً`}</p>
      )}
      {issues.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {issues.map((i, n) => (
            <li key={n} className="flex items-start gap-2 text-sm">
              {ICON[i.severity]}
              <span className="flex-1 min-w-0">
                <Link to={`/project/${i.projectId}`} className="font-medium hover:underline">{name(i.projectId)}</Link>
                <span className="text-muted-foreground"> · </span>{i.text}
              </span>
              <span className="font-mono text-xs shrink-0">{formatCurrency(i.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
