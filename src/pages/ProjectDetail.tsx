import { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { exportToExcel, exportToPDF } from '@/lib/export-lazy';
import { getMonthlyBudgetPlan } from '@/lib/finance';
import { MobileFAB } from '@/components/MobileFAB';
import { useTabBadges } from '@/hooks/useTabBadges';
import { useProjectDetailData } from '@/hooks/useProjectDetailData';
import { buildTabGroups, buildSubTabs, FAB_ACTIONS, type TabGroup } from './project-detail/tabsConfig';
import { ProjectDetailHeader } from '@/components/project/ProjectDetailHeader';
import { ProjectEditDialog } from '@/components/project/ProjectEditDialog';
import { ProjectStatsGrid } from '@/components/project/ProjectStatsGrid';

// Sections
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
import { SpendConsistencyChart } from '@/components/project/SpendConsistencyChart';

import { CashRepairLogSection } from '@/components/project/CashRepairLogSection';
import { CashFlowSankey } from '@/components/project/CashFlowSankey';
import { ResourcePayablesSection } from '@/components/project/ResourcePayablesSection';
import { VendorPayablesPanel } from '@/components/project/VendorPayablesPanel';
import { ExecutiveSummary } from '@/components/project/ExecutiveSummary';
import { SourceOfTruthSection } from '@/components/project/SourceOfTruthSection';
import { SsotHealthBanner } from '@/components/project/SsotHealthBanner';

import { PerformanceComparisonSection } from '@/components/project/PerformanceComparisonSection';
import { AIExecutiveInsights } from '@/components/project/AIExecutiveInsights';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const data = useProjectDetailData(id);
  const badges = useTabBadges(id || '');

  const [editOpen, setEditOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeGroup, setActiveGroupState] = useState<TabGroup>((searchParams.get('group') as TabGroup) || 'summary');
  const [activeTab, setActiveTabState] = useState(searchParams.get('tab') || 'overview');

  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    setSearchParams((prev) => { const n = new URLSearchParams(prev); n.set('tab', tab); return n; }, { replace: true });
  };
  const setActiveGroup = (group: TabGroup) => {
    setActiveGroupState(group);
    setSearchParams((prev) => { const n = new URLSearchParams(prev); n.set('group', group); return n; }, { replace: true });
  };

  if (!data.project) {
    return (
      <AppLayout>
        <div className="text-center py-20">
          <p className="text-muted-foreground">المشروع غير موجود</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/')}>العودة</Button>
        </div>
      </AppLayout>
    );
  }

  const {
    project, company, portfolio, isAdmin, isSystemAdmin, isReadOnly, canEditRole,
    updateProject, archiveProject, deleteProject,
    pBudget, pExpenses, pRevenues, pResources, pCustodies, pMilestones, pChangeOrders, pRisks, pCommitments,
    projectFunds, fundSettlements, paymentRequests, cashTransfers,
    summary, pieData, barData, getActualForItem, projectBaselines, evm, currentMonth,
    totalCommitted, availableBudget, daysRemaining, monthsRemaining, vatRate, healthScore,
    openRisksCount, pendingExpensesCount, totalAllRevenue, pendingChangeOrders, openHighRisks, baselineLocked,
  } = data;

  const tabGroups = buildTabGroups(badges);
  const subTabs = buildSubTabs(isAdmin);

  const handleGroupChange = (group: TabGroup) => {
    setActiveGroup(group);
    const firstTab = subTabs[group][0]?.value;
    if (firstTab) setActiveTab(firstTab);
  };

  const navigateToTab = (tab: string) => {
    for (const [grp, tabs] of Object.entries(subTabs)) {
      if (tabs.some((t) => t.value === tab)) {
        setActiveGroup(grp as TabGroup);
        setActiveTab(tab);
        return;
      }
    }
    setActiveTab(tab);
  };

  const handleArchive = async () => {
    try { await archiveProject(project.id); toast.success('تم أرشفة المشروع'); navigate('/'); }
    catch { toast.error('فشل أرشفة المشروع'); }
  };
  const handleDelete = async () => {
    try { await deleteProject(project.id); toast.success('تم حذف المشروع نهائياً'); navigate('/'); }
    catch (e: any) { toast.error(e?.message || 'فشل حذف المشروع — تأكد من أرشفته أولاً'); }
  };

  const exportPayload = () => ({
    projectName: project.name, contractValue: summary.effectiveContractValue,
    budgetItems: pBudget.map((b) => ({ ...b, actual: getActualForItem(b) })),
    expenses: pExpenses, revenues: pRevenues, changeOrders: pChangeOrders,
    totalPlanned: summary.totalPlanned, totalActual: summary.totalActual,
    totalRevenue: totalAllRevenue, durationMonths: project.durationMonths,
  });

  const renderSection = (value: string) => {
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
              changeOrders={pChangeOrders} expenses={pExpenses} revenues={pRevenues}
              budgetItems={pBudget} commitments={pCommitments} baselines={projectBaselines}
              evm={evm} currentMonth={currentMonth} daysRemaining={daysRemaining}
              totalCommitted={totalCommitted} availableBudget={availableBudget} healthScore={healthScore}
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
            <ExpenseSpendExplorer
              projectId={project.id}
              projectName={project.name}
              expenses={pExpenses}
              resources={pResources}
              custodies={pCustodies}
              budgetItems={pBudget}
            />
            <SpendConsistencyChart projectId={project.id} expenses={pExpenses} resources={pResources} />

          </div>
        );
      case 'funds':
        return (
          <div className="space-y-4">
            <CashLedgerSection projectId={project.id} funds={projectFunds} settlements={fundSettlements} expenses={pExpenses} custodies={pCustodies} />
            <CashRepairLogSection
              projectId={project.id} custodies={pCustodies} cashTransfers={cashTransfers || []}
              funds={projectFunds} expenses={pExpenses} paymentRequests={paymentRequests}
              readOnly={isReadOnly}
            />
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
            <ResourcePayablesSection projectId={project.id} projectName={project.name} readOnly={isReadOnly} />
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
      case 'ssot':
        return (
          <SourceOfTruthSection
            project={project} summary={summary} evm={evm}
            budgetItems={pBudget} expenses={pExpenses} revenues={pRevenues} changeOrders={pChangeOrders}
            funds={projectFunds.filter((f) => f.projectId === project.id)}
            settlements={fundSettlements.filter((s) => s.projectId === project.id)}
            custodies={pCustodies}
            paymentRequests={paymentRequests.filter((p) => p.projectId === project.id)}
            cashTransfers={(cashTransfers || []).filter((t) => t.projectId === project.id)}
          />
        );
      default:
        return null;
    }
  };

  const fab = FAB_ACTIONS[activeGroup];

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <ProjectDetailHeader
          project={project}
          company={company}
          portfolio={portfolio}
          isReadOnly={isReadOnly}
          isAdmin={isAdmin}
          isSystemAdmin={isSystemAdmin}
          canEditProject={canEditRole('project', project.id)}
          onStatusChange={(status) => updateProject(project.id, { status })}
          onEdit={() => setEditOpen(true)}
          onExportExcel={() => {
            exportToExcel({
              ...exportPayload(),
              vatRate: project.taxPercent,
              contractValueInclVAT: summary.contractValueInclVAT,
              totalVATOnExpenses: summary.totalVATOnExpenses,
              totalVATOnRevenues: summary.totalVATOnRevenues,
              netVATPayable: summary.netVATPayable,
            });
            toast.success('تم تصدير التقرير إلى Excel');
          }}
          onExportPDF={() => {
            exportToPDF({ ...exportPayload(), plannedProfit: summary.plannedProfit });
            toast.success('تم تصدير التقرير إلى PDF');
          }}
          onArchive={handleArchive}
          onDelete={handleDelete}
        />

        <SsotHealthBanner
          project={project}
          expenses={pExpenses}
          custodies={pCustodies}
          paymentRequests={paymentRequests.filter((p) => p.projectId === project.id)}
          cashTransfers={(cashTransfers || []).filter((t) => t.projectId === project.id)}
          funds={projectFunds.filter((f) => f.projectId === project.id)}
          settlements={fundSettlements.filter((s) => s.projectId === project.id)}
          changeOrders={pChangeOrders}
          onInspect={() => navigateToTab('ssot')}
        />

        <ProjectEditDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          project={project}
          onSave={(values) => updateProject(project.id, values)}
        />


        <ProjectStatsGrid
          project={project} summary={summary} evm={evm} currentMonth={currentMonth}
          daysRemaining={daysRemaining} monthsRemaining={monthsRemaining}
          totalCommitted={totalCommitted} availableBudget={availableBudget}
          vatRate={vatRate} healthScore={healthScore}
          openRisksCount={openRisksCount} pendingExpensesCount={pendingExpensesCount}
          pendingChangeOrders={pendingChangeOrders}
          invoicedCount={pRevenues.filter((r) => r.status === 'invoiced').length}
        />

        {/* 6 main tab groups — mobile: horizontal scroll snap; desktop: grid */}
        <Tabs value={activeGroup} onValueChange={(v) => handleGroupChange(v as TabGroup)} className="space-y-4">
          <TabsList className="sticky top-[57px] z-10 bg-muted/50 backdrop-blur-sm h-auto w-full p-1 gap-1 flex md:grid md:grid-cols-5 overflow-x-auto overflow-y-hidden snap-x snap-mandatory no-scrollbar">
            {tabGroups.map((group) => {
              const Icon = group.icon;
              const badgeColor =
                group.badgeLevel === 'critical' ? 'bg-destructive text-destructive-foreground'
                : group.badgeLevel === 'warning' ? 'bg-warning text-warning-foreground'
                : 'bg-primary text-primary-foreground';
              const trigger = (
                <TabsTrigger
                  key={group.key}
                  value={group.key}
                  className="relative shrink-0 snap-start flex items-center gap-2 min-h-[44px] px-3.5 md:px-3 py-2 text-xs md:text-[13px] font-medium data-[state=active]:shadow-sm"
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="leading-tight whitespace-nowrap">{group.label}</span>
                  {group.badge > 0 && (
                    <span className={`min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center px-1 ${badgeColor}`}>
                      {group.badge}
                    </span>
                  )}
                </TabsTrigger>
              );
              return group.badgeHint && group.badge > 0 ? (
                <Tooltip key={group.key}>
                  <TooltipTrigger asChild>{trigger}</TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">{group.badgeHint}</TooltipContent>
                </Tooltip>
              ) : trigger;
            })}
          </TabsList>

          {tabGroups.map((group) => {
            const sections = subTabs[group.key];
            if (sections.length === 1) {
              return (
                <TabsContent key={group.key} value={group.key} className="mt-2">
                  {renderSection(sections[0].value)}
                </TabsContent>
              );
            }
            const defaultOpen = activeTab && sections.some((s) => s.value === activeTab)
              ? [activeTab]
              : [sections[0].value];
            return (
              <TabsContent key={group.key} value={group.key} className="mt-2">
                <Accordion
                  type="multiple"
                  defaultValue={defaultOpen}
                  onValueChange={(vals) => { if (vals.length > 0) setActiveTab(vals[vals.length - 1]); }}
                  className="space-y-2"
                >
                  {sections.map((s) => {
                    const Icon = s.icon;
                    return (
                      <AccordionItem key={s.value} value={s.value} className="border border-border rounded-lg bg-card px-3 md:px-4">
                        <AccordionTrigger className="text-sm font-semibold py-3 hover:no-underline">
                          <div className="flex items-center gap-2 text-foreground">
                            <Icon className="w-4 h-4 text-primary" />
                            <span>{s.label}</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pt-2 pb-4">
                          {renderSection(s.value)}
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </TabsContent>
            );
          })}
        </Tabs>
      </motion.div>

      {/* Mobile FAB — primary contextual action per active group */}
      {!isReadOnly && fab && (
        <MobileFAB
          label={fab.label}
          onClick={() => {
            setActiveGroup(fab.group);
            setActiveTab(fab.tab);
            setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
          }}
        />
      )}
    </AppLayout>
  );
}
