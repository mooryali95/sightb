/**
 * Health strip + KPI card rows + quick alerts for the project overview.
 * Each row lives under stats/; this file only lays them out.
 *
 * On a phone the budget and collection rows (eight cards, about 700px, half
 * of them repeating the position strip above) fold behind one button, so the
 * section tabs are a scroll away instead of two screens. On a wider screen
 * every row shows.
 */
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import type { Project, ProjectSummary, EVMMetrics } from '@/types/project';
import { HealthStrip } from './stats/HealthStrip';
import { ContractRow } from './stats/ContractRow';
import { BudgetRow } from './stats/BudgetRow';
import { CollectionRow } from './stats/CollectionRow';
import { QuickAlerts } from './stats/QuickAlerts';

interface Props {
  project: Project;
  summary: ProjectSummary;
  evm: EVMMetrics | null;
  currentMonth: number;
  daysRemaining: number | null;
  monthsRemaining: number | null;
  totalCommitted: number;
  availableBudget: number;
  vatRate: number;
  healthScore: { label: string; color: string; bg: string };
  openRisksCount: number;
  pendingExpensesCount: number;
  pendingChangeOrders: number;
  invoicedCount: number;
}

export function ProjectStatsGrid({
  project, summary, evm, currentMonth, daysRemaining, monthsRemaining,
  totalCommitted, availableBudget, vatRate, healthScore,
  openRisksCount, pendingExpensesCount, pendingChangeOrders, invoicedCount,
}: Props) {
  const isMobile = useIsMobile();
  const [showAll, setShowAll] = useState(false);
  const folded = isMobile && !showAll;
  return (
    <>
      <HealthStrip project={project} evm={evm} currentMonth={currentMonth} daysRemaining={daysRemaining} healthScore={healthScore} openRisksCount={openRisksCount} />
      <ContractRow summary={summary} vatRate={vatRate} />
      <div id="project-more-indicators" hidden={folded}>
        {!folded && (
          <>
            <BudgetRow summary={summary} evm={evm} monthsRemaining={monthsRemaining} totalCommitted={totalCommitted} availableBudget={availableBudget} />
            <CollectionRow summary={summary} evm={evm} invoicedCount={invoicedCount} />
          </>
        )}
      </div>
      {isMobile && (
        <Button
          variant="outline" size="sm" className="w-full mb-4 gap-1.5"
          aria-expanded={showAll} aria-controls="project-more-indicators"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? 'إخفاء مؤشرات الموازنة والتحصيل' : 'عرض مؤشرات الموازنة والتحصيل'}
          <ChevronDown className={`w-4 h-4 transition-transform ${showAll ? 'rotate-180' : ''}`} aria-hidden="true" />
        </Button>
      )}
      <QuickAlerts pendingExpensesCount={pendingExpensesCount} pendingChangeOrders={pendingChangeOrders} />
    </>
  );
}
