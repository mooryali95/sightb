/**
 * Cash left at a settlement that has no next fund to join yet. It stays in
 * the project's hand and joins the next fund when one is created; once the
 * project has finished there is no next fund, so it goes back to the company.
 */
import { useState } from 'react';
import { ArrowLeftRight, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/finance';
import { COMPANY } from '@/lib/finance/company-ledger';
import { createEntry } from '@/services/companyLedgerService';
import { useStore } from '@/store/useStore';
import type { FundSettlement, ProjectFund, ProjectStatus } from '@/types/project';
import { todayLocal } from '@/lib/utils';

const FINISHED: ProjectStatus[] = ['completed', 'archived', 'cancelled'];

interface Props {
  projectId: string; companyId: string | undefined; status: ProjectStatus;
  funds: ProjectFund[]; settlements: FundSettlement[]; canEdit: boolean;
}

export function PendingCarryCard({ projectId, companyId, status, funds, settlements, canEdit }: Props) {
  const markCarryReturned = useStore((s) => s.markCarryReturned);
  const loadFundsForProject = useStore((s) => s.loadFundsForProject);
  const [busy, setBusy] = useState<string | null>(null);
  const pending = settlements.filter((st) => st.projectId === projectId && st.status === 'approved'
    && st.carryStatus === 'pending' && st.remainingCash > 0.005);
  if (pending.length === 0) return null;
  const finished = FINISHED.includes(status);
  const fundNo = (id: string) => funds.find((f) => f.id === id)?.fundNumber;

  const giveBack = async (st: FundSettlement) => {
    if (!companyId) return;
    setBusy(st.id);
    try {
      await createEntry({
        companyId, date: todayLocal(), amount: st.remainingCash, type: 'repayment',
        from: { kind: 'project', id: projectId }, to: COMPANY, note: `متبقي تسوية الدفعة رقم ${fundNo(st.fundId)} بعد انتهاء المشروع`,
        dueDate: null, sourceFundId: st.fundId,
      });
      await markCarryReturned(st.id);
      await loadFundsForProject(projectId);
      toast.success('أُعيد المتبقي للمنظومة');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذّرت الإعادة');
    } finally { setBusy(null); }
  };

  return (
    <section className="stat-card border-primary/30" aria-label="متبقٍ من تسويات سابقة">
      <h3 className="text-sm font-semibold flex items-center gap-2"><Wallet className="w-4 h-4 text-primary" />متبقٍ من تسويات سابقة</h3>
      <p className="text-xs text-muted-foreground mt-0.5">
        {finished
          ? 'انتهى المشروع ولا دفعة تالية: يعود هذا النقد للمنظومة.'
          : 'نقد بقي بيد المشروع عند التسوية. يُضاف تلقائياً إلى الدفعة التالية حين تُنشأ، ويُحسب ضمن ما بيد المدير حتى ذلك.'}
      </p>
      <ul className="mt-3 space-y-2">
        {pending.map((st) => (
          <li key={st.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
            <span className="text-sm">من تسوية الدفعة رقم {fundNo(st.fundId)}</span>
            <span className="font-mono text-sm font-semibold">{formatCurrency(st.remainingCash)}</span>
            {finished && canEdit && companyId && (
              <Button size="sm" className="gap-1" disabled={busy === st.id} onClick={() => giveBack(st)}>
                <ArrowLeftRight className="w-3.5 h-3.5" />أعده للمنظومة
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
