import { useStore } from '@/store/useStore';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useState, useMemo, useEffect } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import basserhLogo from '@/assets/basserh-logo.jpg';
import { useRole } from '@/hooks/useRole';

import { DashboardFilters } from '@/components/dashboard/DashboardFilters';
import { DashboardStats } from '@/components/dashboard/DashboardStats';
import { DashboardCharts } from '@/components/dashboard/DashboardCharts';
import { PortfolioPerformance } from '@/components/dashboard/PortfolioPerformance';
import { HealthMatrix } from '@/components/dashboard/HealthMatrix';
import { AttentionProjects } from '@/components/dashboard/AttentionProjects';
import { ProjectCards } from '@/components/dashboard/ProjectCards';
import { ProjectsTable } from '@/components/dashboard/ProjectsTable';
import { CompanyManagement } from '@/components/dashboard/CompanyManagement';
import { SnapshotControls } from '@/components/dashboard/SnapshotControls';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { PageHeader } from '@/components/ui/page-header';
import { useCoreData, useDetailsData } from '@/hooks/useAppData';
import { dashboardFigures } from './dashboard/dashboardFigures';
import { FinancialBrief } from '@/components/dashboard/FinancialBrief';
import { useDashboardFilters } from '@/hooks/useDashboardFilters';

export default function Dashboard() {
  const { companies, portfolios, projects, budgetItems, expenses, revenues, changeOrders, milestones, risks, indirectCosts, loading, loadAll, saveSnapshot, archiveCompany, unarchiveCompany, deleteCompany } = useStore();
  const navigate = useNavigate();
  const { isAdmin } = useRole();
  const isMobile = useIsMobile();

  const activeCompanies = useMemo(() => companies.filter(c => c.status !== 'archived'), [companies]);
  const archivedCompanies = useMemo(() => companies.filter(c => c.status === 'archived'), [companies]);

  const [filtersOpen, setFiltersOpen] = useState(false);
  // Filters live in the address bar: a filtered view can be shared and survives a reload.
  const { filters, update, clear: clearFilters, active } = useDashboardFilters();
  const { filterCompany, filterPortfolio, filterStatus, searchQuery, timePeriod, showInactive } = filters;
  const setFilterCompany = (v: string) => update({ filterCompany: v });
  const setFilterPortfolio = (v: string) => update({ filterPortfolio: v });
  const setFilterStatus = (v: string) => update({ filterStatus: v });
  const setSearchQuery = (v: string) => update({ searchQuery: v });
  const setTimePeriod = (v: string) => update({ timePeriod: v });
  const setShowInactive = (v: boolean) => update({ showInactive: v });

  const core = useCoreData();
  useDetailsData();

  useEffect(() => {
    if (core.isError) {
      toast.error('حدث خطأ أثناء تحميل البيانات. يرجى إعادة تحميل الصفحة.');
    }
  }, [core.isError]);

  const figures = useMemo(
    () => dashboardFigures({ companies, portfolios, projects, budgetItems, expenses, revenues, changeOrders, milestones, risks, indirectCosts }, filters),
    [companies, portfolios, projects, budgetItems, expenses, revenues, changeOrders, milestones, risks, indirectCosts, filters],
  );
  const {
    filteredProjects, filteredBudgetItems, filteredAllExpenses, filteredAllRevenues, filteredChangeOrders,
    filteredMilestones, filteredRisks, filteredPortfolios, defaultVisibleProjectsCount,
    totalContractValue, totalExpenses, approvedChangeImpact, effectiveTotalContract, plannedProfit, plannedProfitMargin,
    collectedRevenue, expenseChange, revenueChange, attentionProjectsCount, companyData, statusData,
    netCash, receivables, indirectTotal, netPlannedProfit, netPlannedMargin,
  } = figures;

  const hasActiveFilters = active.length > 0;

  const hasData = companies.length > 0;

  // Show skeleton while initial data is loading and we have no data yet
  if (loading && companies.length === 0) {
    return <DashboardSkeleton />;
  }

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
        <PageHeader
          eyebrow="نظرة عامة"
          title="لوحة التحكم"
          subtitle="نظرة شاملة على جميع المحافظ والمشاريع"
          actions={isAdmin && (
            <Button onClick={() => navigate('/companies/new')} className="gap-2">
              <Plus className="w-4 h-4" /> شركة جديدة
            </Button>
          )}
        />

        {!hasData ? (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, delay: 0.2 }}
            className="flex flex-col items-center justify-center py-24">
            <img src={basserhLogo} alt="بصيرة" className="w-24 h-24 rounded-2xl object-cover mb-6 shadow-lg" />
            <h2 className="text-xl font-bold mb-2">مرحباً بك في رؤية</h2>
            <p className="text-muted-foreground mb-2 text-center max-w-md">نظام إدارة المحافظ والمشاريع المالية</p>
            <p className="text-muted-foreground mb-8 text-center max-w-md text-sm">ابدأ بإضافة شركة، ثم أنشئ محافظ ومشاريع لتتبع الميزانيات والمصروفات والربحية</p>
            {isAdmin && (
              <Button onClick={() => navigate('/companies/new')} size="lg" className="gap-2">
                <Plus className="w-5 h-5" /> إضافة أول شركة
              </Button>
            )}
          </motion.div>
        ) : (
          <>
            <DashboardFilters
              companies={activeCompanies} filterCompany={filterCompany} setFilterCompany={setFilterCompany}
              portfolios={portfolios} filterPortfolio={filterPortfolio} setFilterPortfolio={setFilterPortfolio}
              filterStatus={filterStatus} setFilterStatus={setFilterStatus}
              searchQuery={searchQuery} setSearchQuery={setSearchQuery}
              timePeriod={timePeriod} setTimePeriod={setTimePeriod}
              hasActiveFilters={hasActiveFilters} clearFilters={clearFilters}
              filteredCount={filteredProjects.length} totalCount={defaultVisibleProjectsCount}
              isMobile={isMobile} filtersOpen={filtersOpen} setFiltersOpen={setFiltersOpen}
              showInactive={showInactive} setShowInactive={setShowInactive}
            />

            <DashboardStats
              effectiveTotalContract={effectiveTotalContract} totalContractValue={totalContractValue}
              approvedChangeImpact={approvedChangeImpact} totalExpenses={totalExpenses}
              expenseChange={expenseChange} plannedProfit={plannedProfit}
              plannedProfitMargin={plannedProfitMargin} collectedRevenue={collectedRevenue}
              revenueChange={revenueChange} timePeriod={timePeriod}
              filteredProjectsCount={filteredProjects.length}
              activeCompaniesCount={activeCompanies.length}
              archivedCompaniesCount={archivedCompanies.length}
              portfoliosCount={portfolios.length}
            />

            <FinancialBrief
              netCash={netCash} receivables={receivables} plannedProfit={plannedProfit}
              indirectTotal={indirectTotal} netPlannedProfit={netPlannedProfit} netPlannedMargin={netPlannedMargin}
              attentionCount={attentionProjectsCount} timePeriod={timePeriod}
            />

            <AttentionProjects
              filteredProjects={filteredProjects} expenses={filteredAllExpenses}
              budgetItems={filteredBudgetItems} revenues={filteredAllRevenues} changeOrders={filteredChangeOrders}
              risks={risks} projects={projects} portfolios={portfolios}
            />

            <DashboardCharts companyData={companyData} statusData={statusData} />

            <PortfolioPerformance
              portfolios={filteredPortfolios} companies={companies} projects={filteredProjects}
              budgetItems={filteredBudgetItems} expenses={filteredAllExpenses} revenues={filteredAllRevenues}
              changeOrders={filteredChangeOrders} milestones={filteredMilestones} risks={filteredRisks}
            />

            <HealthMatrix
              filteredProjects={filteredProjects} expenses={filteredAllExpenses}
              budgetItems={filteredBudgetItems} revenues={filteredAllRevenues} changeOrders={filteredChangeOrders}
            />

            <SnapshotControls
              projects={projects} portfolios={portfolios} companies={companies}
              budgetItems={budgetItems} expenses={expenses} revenues={revenues}
              changeOrders={changeOrders} milestones={milestones} risks={risks}
              indirectCosts={indirectCosts} saveSnapshot={saveSnapshot}
            />

            <ProjectCards
              filteredProjects={filteredProjects} expenses={filteredAllExpenses}
              budgetItems={filteredBudgetItems} revenues={filteredAllRevenues} changeOrders={filteredChangeOrders}
              companies={companies}
            />

            <ProjectsTable
              filteredProjects={filteredProjects} expenses={filteredAllExpenses}
              budgetItems={filteredBudgetItems} revenues={filteredAllRevenues} changeOrders={filteredChangeOrders}
              companies={companies} hasActiveFilters={hasActiveFilters} clearFilters={clearFilters}
            />

            <CompanyManagement
              activeCompanies={activeCompanies} archivedCompanies={archivedCompanies}
              isAdmin={isAdmin} archiveCompany={archiveCompany}
              unarchiveCompany={unarchiveCompany} deleteCompany={deleteCompany}
            />
          </>
        )}
      </motion.div>
    </AppLayout>
  );
}
