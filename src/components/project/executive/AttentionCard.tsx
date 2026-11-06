/** What needs a decision now; rendered only when there is something. */
import { AlertTriangle, Clock, XCircle, TrendingDown } from 'lucide-react';
import { formatCurrency } from '@/lib/finance';
import type { ChangeOrder, Expense, Milestone } from '@/types/project';
import { SectionCard, SectionTitle } from './SectionCard';

interface Props {
  expenses: Expense[];
  changeOrders: ChangeOrder[];
  milestones: Milestone[];
  budgetRemaining: number;
}

export function AttentionCard({ expenses, changeOrders, milestones, budgetRemaining }: Props) {
  const pendingExpenses = expenses.filter(e => e.approvalStatus === 'pending');
  const pendingCOs = changeOrders.filter(co => co.status === 'proposed');
  const delayedMilestones = milestones.filter(m => m.status === 'delayed').length;
  if (!(pendingExpenses.length > 0 || pendingCOs.length > 0 || delayedMilestones > 0 || budgetRemaining < 0)) return null;
  return (
    <SectionCard className="border-warning/30 bg-warning/10">
      <SectionTitle icon={AlertTriangle}>يحتاج تدخل</SectionTitle>
      <div className="space-y-2">
        {pendingExpenses.length > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <Clock className="w-3.5 h-3.5 text-warning" />
            <span>{pendingExpenses.length} مصروف بانتظار الاعتماد ({formatCurrency(pendingExpenses.reduce((s, e) => s + e.amount, 0))})</span>
          </div>
        )}
        {pendingCOs.length > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <Clock className="w-3.5 h-3.5 text-warning" />
            <span>{pendingCOs.length} أمر تغيير مقترح</span>
          </div>
        )}
        {delayedMilestones > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <XCircle className="w-3.5 h-3.5 text-destructive" />
            <span>{delayedMilestones} مرحلة متأخرة</span>
          </div>
        )}
        {budgetRemaining < 0 && (
          <div className="flex items-center gap-2 text-xs">
            <TrendingDown className="w-3.5 h-3.5 text-destructive" />
            <span>تجاوز الموازنة بـ {formatCurrency(Math.abs(budgetRemaining))}</span>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
