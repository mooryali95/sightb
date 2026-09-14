/**
 * Health strip + KPI card rows + quick alerts for the project overview.
 * Each row lives under stats/; this file only lays them out.
 */
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
  return (
    <>
      <HealthStrip project={project} evm={evm} currentMonth={currentMonth} daysRemaining={daysRemaining} healthScore={healthScore} openRisksCount={openRisksCount} />
      <ContractRow summary={summary} vatRate={vatRate} />
      <BudgetRow summary={summary} evm={evm} monthsRemaining={monthsRemaining} totalCommitted={totalCommitted} availableBudget={availableBudget} />
      <CollectionRow summary={summary} evm={evm} invoicedCount={invoicedCount} />
      <QuickAlerts pendingExpensesCount={pendingExpensesCount} pendingChangeOrders={pendingChangeOrders} />
    </>
  );
}
