/**
 * The executive summary: the month's performance, the budget split, the
 * milestones, the collection line, the risks, and what needs attention.
 * Each block lives under executive/; the maths in executiveFigures.ts.
 */
import { getPlannedMonthlyCashFlow, getMonthlyBreakdown } from '@/lib/finance';
import type {
  Project, ProjectSummary, Milestone, Risk, ChangeOrder, Expense, BudgetItem,
} from '@/types/project';
import { MonthPerformanceCard } from './executive/MonthPerformanceCard';
import { BudgetSplitCard, MilestonesCard } from './executive/BudgetAndMilestonesCards';
import { CollectionCard } from './executive/CollectionCard';
import { RisksCard } from './executive/RisksCard';
import { AttentionCard } from './executive/AttentionCard';
import { splitBudget } from './executive/executiveFigures';

interface Props {
  project: Project;
  summary: ProjectSummary;
  milestones: Milestone[];
  risks: Risk[];
  changeOrders: ChangeOrder[];
  expenses: Expense[];
  budgetItems: BudgetItem[];
  currentMonth: number;
  totalCommitted: number;
}

export function ExecutiveSummary({
  project, summary, milestones, risks, changeOrders, expenses, budgetItems, currentMonth, totalCommitted,
}: Props) {
  const plannedMonthly = getPlannedMonthlyCashFlow(budgetItems, project.durationMonths);
  const actualMonthly = getMonthlyBreakdown(expenses, project.durationMonths);
  const budgetSlices = splitBudget(summary.totalPlanned, summary.totalActual, totalCommitted);

  return (
    <div className="space-y-4">
      {/* ═══ 1. أداء الشهر ═══ */}
      <MonthPerformanceCard
        currentMonth={currentMonth}
        durationMonths={project.durationMonths}
        plannedMonthly={plannedMonthly}
        actualMonthly={actualMonthly}
      />

      {/* قسم EVM المفصّل أُزيل لتفادي تكرار CPI/SPI/EAC/TCPI المعروضة في رأس الصفحة */}

      {/* ═══ 3. الموازنة + المراحل ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BudgetSplitCard slices={budgetSlices} />
        <MilestonesCard milestones={milestones} />
      </div>

      {/* ═══ 4. التحصيل ═══ */}
      <CollectionCard summary={summary} />

      {/* ═══ 5. المخاطر ═══ */}
      <RisksCard risks={risks} managementReserve={project.managementReserve} />

      {/* ═══ 6. يحتاج تدخل ═══ */}
      <AttentionCard expenses={expenses} changeOrders={changeOrders} milestones={milestones} budgetRemaining={summary.budgetRemaining} />
    </div>
  );
}
