import { getMonthlyBudgetPlan } from '@/lib/finance';
import type { ProjectDetailData } from '@/hooks/useProjectDetailData';
import { ResourcesSection } from '@/components/project/ResourcesSection';
import { BudgetSection } from '@/components/project/BudgetSection';
import { BaselineSection } from '@/components/project/BaselineSection';
import { ExpensesSection } from '@/components/project/ExpensesSection';
import { CustodySection } from '@/components/project/CustodySection';
import { RevenueSection } from '@/components/project/RevenueSection';
import { ChartsSection } from '@/components/project/ChartsSection';
import { AuditLogSection } from '@/components/project/AuditLogSection';
import { MilestonesSection } from '@/components/project/MilestonesSection';
import { ChangeOrdersSection } from '@/components/project/ChangeOrdersSection';
import { RisksSection } from '@/components/project/RisksSection';
import { WhatIfSection } from '@/components/project/WhatIfSection';
import { CommitmentsSection } from '@/components/project/CommitmentsSection';
import { SmartBudgetAlerts } from '@/components/project/SmartBudgetAlerts';
import { FundsSection } from '@/components/project/FundsSection';
import { CashLedgerSection } from '@/components/project/CashLedgerSection';
import { ExpenseSpendExplorer } from '@/components/project/ExpenseSpendExplorer';
import { CashFlowSankey } from '@/components/project/CashFlowSankey';
import { ChargedCostsCard } from '@/components/project/ledger/ChargedCostsCard';
import { ResourcePayablesSection } from '@/components/project/ResourcePayablesSection';
import { VendorPayablesPanel } from '@/components/project/VendorPayablesPanel';
import { ExecutiveSummary } from '@/components/project/ExecutiveSummary';
import { PerformanceComparisonSection } from '@/components/project/PerformanceComparisonSection';
import { AIExecutiveInsights } from '@/components/project/AIExecutiveInsights';

type LoadedData = Extract<ProjectDetailData, { project: object }>;

interface ProjectSectionProps {
  value: string;
  data: LoadedData;
  navigateToTab: (tab: string) => void;
}

/** The section a tab value stands for, fed from the page's data. */
export function ProjectSection({ value, data: d, navigateToTab }: ProjectSectionProps) {
  const {
    project, company, isAdmin, isReadOnly,
    pBudget, pExpenses, pRevenues, pResources, pCustodies, pMilestones, pChangeOrders, pRisks, pCommitments,
    projectFunds, fundSettlements, paymentRequests, cashTransfers,
    summary, pieData, barData, evm, currentMonth, totalCommitted, daysRemaining,
    openRisksCount, pendingExpensesCount, totalAllRevenue, pendingChangeOrders, openHighRisks, baselineLocked,
  } = d;

  switch (value) {
    case 'overview':
      return (
        <>
          <AIExecutiveInsights context={{
            name: project.name, status: project.status, percentComplete: project.percentComplete,
            currentMonth, durationMonths: project.durationMonths,
            contractValue: summary.contractValue, effectiveContractValue: summary.effectiveContractValue,
            totalPlanned: summary.totalPlanned, totalActual: summary.totalActual,
            collectedRevenue: summary.collectedRevenue, invoicedRevenue: summary.invoicedRevenue,
            spendRate: summary.spendRate, plannedProfit: summary.plannedProfit,
            cpi: evm?.cpi ?? null, spi: evm?.spi ?? null,
            openRisks: openRisksCount,
            highRisks: pRisks.filter((r) => r.status === 'open' && (r.impact === 'high' || r.impact === 'very_high')).length,
            pendingExpenses: pendingExpensesCount, pendingChangeOrders,
            delayedMilestones: pMilestones.filter((m) => m.status === 'delayed').length,
            unsettledFunds: 0, remainingInManagerHand: 0,
            daysRemaining, currency: project.currency,
          }} />
          <ExecutiveSummary
            project={project} summary={summary} milestones={pMilestones} risks={pRisks}
            changeOrders={pChangeOrders} expenses={pExpenses} budgetItems={pBudget}
            currentMonth={currentMonth} totalCommitted={totalCommitted}
          />
        </>
      );
    case 'milestones':
      return <MilestonesSection projectId={project.id} milestones={pMilestones} project={project} readOnly={isReadOnly} revenues={pRevenues} />;
    case 'resources':
      return <ResourcesSection projectId={project.id} resources={pResources} budgetItems={pBudget} expenses={pExpenses} readOnly={isReadOnly} durationMonths={project.durationMonths} />;
    case 'budget':
      return (
        <div className="space-y-4">
          <SmartBudgetAlerts
            summary={summary}
            evm={evm}
            monthlyPlan={getMonthlyBudgetPlan(pBudget, pExpenses, pRevenues, project.durationMonths, project.startDate)}
            durationMonths={project.durationMonths}
            currentMonth={currentMonth}
            pendingChangeOrders={pendingChangeOrders}
            openHighRisks={openHighRisks}
            onNavigate={navigateToTab}
          />
          <BudgetSection projectId={project.id} budgetItems={pBudget} expenses={pExpenses} revenues={pRevenues} durationMonths={project.durationMonths} resources={pResources} contractValue={summary.effectiveContractValue} currency={project.currency} managementReserve={project.managementReserve} readOnly={isReadOnly} baselineLocked={baselineLocked} taxPercent={project.taxPercent} startDate={project.startDate} />
        </div>
      );
    case 'baseline':
      return <BaselineSection projectId={project.id} durationMonths={project.durationMonths} expenses={pExpenses} budgetItems={pBudget} project={project} readOnly={isReadOnly} />;
    case 'expenses':
      return (
        <div className="space-y-4">
          <ExpensesSection projectId={project.id} durationMonths={project.durationMonths} expenses={pExpenses} resources={pResources} custodies={pCustodies} budgetItems={pBudget} revenues={pRevenues} contractValue={summary.effectiveContractValue} readOnly={isReadOnly} taxPercent={project.taxPercent} projectStatus={project.status} />
          <ExpenseSpendExplorer projectId={project.id} projectName={project.name} expenses={pExpenses} resources={pResources} custodies={pCustodies} budgetItems={pBudget} />
          <ChargedCostsCard projectId={project.id} directActual={summary.totalActual} />
        </div>
      );
    case 'funds':
      return (
        <div className="space-y-4">
          <CashLedgerSection projectId={project.id} funds={projectFunds} settlements={fundSettlements} expenses={pExpenses} custodies={pCustodies} />
          <CashFlowSankey
            projectId={project.id} funds={projectFunds} expenses={pExpenses} custodies={pCustodies}
            paymentRequests={paymentRequests} cashTransfers={cashTransfers || []}
            resources={pResources} currency={project.currency}
          />
          <FundsSection projectId={project.id} expenses={pExpenses} readOnly={isReadOnly} />
        </div>
      );
    case 'custody':
      return <CustodySection projectId={project.id} companyId={project.companyId} custodies={pCustodies} expenses={pExpenses} readOnly={isReadOnly} />;
    case 'commitments':
      return <CommitmentsSection projectId={project.id} commitments={pCommitments} totalPlanned={summary.totalPlanned} readOnly={isReadOnly} />;
    case 'revenue':
      return <RevenueSection projectId={project.id} revenues={pRevenues} durationMonths={project.durationMonths} readOnly={isReadOnly} taxPercent={project.taxPercent} milestones={pMilestones} />;
    case 'payables':
      return (
        <div className="space-y-4">
          <ResourcePayablesSection projectId={project.id} companyName={company?.name} projectName={project.name} readOnly={isReadOnly} />
          <VendorPayablesPanel projectId={project.id} readOnly={isReadOnly} />
        </div>
      );
    case 'changeorders':
      return <ChangeOrdersSection projectId={project.id} changeOrders={pChangeOrders} contractValue={project.contractValue} readOnly={isReadOnly} />;
    case 'risks':
      return <RisksSection projectId={project.id} risks={pRisks} readOnly={isReadOnly} />;
    case 'performance':
      return (
        <PerformanceComparisonSection
          budgetItems={pBudget} expenses={pExpenses}
          durationMonths={project.durationMonths} startDate={project.startDate} currency={project.currency}
        />
      );
    case 'charts':
      return <ChartsSection pieData={pieData} barData={barData} expenses={pExpenses} totalPlanned={summary.totalPlanned} durationMonths={project.durationMonths} budgetItems={pBudget} />;
    case 'whatif':
      return (
        <WhatIfSection
          contractValue={summary.effectiveContractValue} totalPlanned={summary.totalPlanned}
          totalActual={summary.totalActual} totalRevenue={totalAllRevenue}
          durationMonths={project.durationMonths} percentComplete={project.percentComplete}
          currency={project.currency}
        />
      );
    case 'auditlog':
      return isAdmin ? <AuditLogSection projectId={project.id} /> : null;
    default:
      return null;
  }
}
