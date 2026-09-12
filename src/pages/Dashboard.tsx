import { useStore } from '@/store/useStore';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { formatCurrency, getProjectSummary, getTotalPlanned } from '@/lib/finance';
import { PROJECT_STATUS_LABELS, type Expense, type ProjectStatus } from '@/types/project';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subMonths, subQuarters, subYears, isWithinInterval, parseISO } from 'date-fns';
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

/**
 * Project states hidden from the default view. Module scope, not component
 * scope: a literal declared inside the body is a fresh array every render, so
 * every `useMemo` closing over it silently lost its memoization.
 */
const INACTIVE_STATUSES: ProjectStatus[] = ['completed', 'archived', 'cancelled'];

export default function Dashboard() {
  const { companies, portfolios, projects, budgetItems, expenses, revenues, changeOrders, milestones, risks, indirectCosts, loading, loadAll, saveSnapshot, archiveCompany, unarchiveCompany, deleteCompany } = useStore();
  const navigate = useNavigate();
  const { isAdmin } = useRole();
  const isMobile = useIsMobile();

  const activeCompanies = useMemo(() => companies.filter(c => c.status !== 'archived'), [companies]);
  const archivedCompanies = useMemo(() => companies.filter(c => c.status === 'archived'), [companies]);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterCompany, setFilterCompany] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [timePeriod, setTimePeriod] = useState<string>('all');
  const [showInactive, setShowInactive] = useState(false);

  const core = useCoreData();
  useDetailsData();

  useEffect(() => {
    if (core.isError) {
      toast.error('حدث خطأ أثناء تحميل البيانات. يرجى إعادة تحميل الصفحة.');
    }
  }, [core.isError]);

  // Time period date ranges
  const { currentRange, previousRange } = useMemo(() => {
    const now = new Date();
    let currentStart: Date, currentEnd: Date, prevStart: Date, prevEnd: Date;
    switch (timePeriod) {
      case 'month':
        currentStart = startOfMonth(now); currentEnd = endOfMonth(now);
        prevStart = startOfMonth(subMonths(now, 1)); prevEnd = endOfMonth(subMonths(now, 1));
        break;
      case 'quarter':
        currentStart = startOfQuarter(now); currentEnd = endOfQuarter(now);
        prevStart = startOfQuarter(subQuarters(now, 1)); prevEnd = endOfQuarter(subQuarters(now, 1));
        break;
      case 'year':
        currentStart = startOfYear(now); currentEnd = endOfYear(now);
        prevStart = startOfYear(subYears(now, 1)); prevEnd = endOfYear(subYears(now, 1));
        break;
      default:
        return { currentRange: null, previousRange: null };
    }
    return {
      currentRange: { start: currentStart, end: currentEnd },
      previousRange: { start: prevStart, end: prevEnd },
    };
  }, [timePeriod]);

  const isInRange = useCallback((dateStr: string, range: { start: Date; end: Date } | null) => {
    if (!range) return true;
    try {
      const d = parseISO(dateStr);
      return isWithinInterval(d, range);
    } catch { return true; }
  }, []);

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      if (filterCompany === 'all') {
        const comp = companies.find(c => c.id === p.companyId);
        if (comp?.status === 'archived') return false;
      }
      if (filterCompany !== 'all' && p.companyId !== filterCompany) return false;
      if (filterStatus !== 'all' && p.status !== filterStatus) return false;
      if (filterStatus === 'all' && !showInactive && INACTIVE_STATUSES.includes(p.status)) return false;
      if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [projects, companies, filterCompany, filterStatus, searchQuery, showInactive]);

  const visibleProjectIds = useMemo(() => new Set(filteredProjects.map((project) => project.id)), [filteredProjects]);
  const filteredBudgetItems = useMemo(() => budgetItems.filter((b) => visibleProjectIds.has(b.projectId)), [budgetItems, visibleProjectIds]);
  // SSOT: exclude rejected expenses and outstanding (unsettled) advances — matches getProjectSummary in finance.ts
  const isCountedExpense = (e: Expense) => e.approvalStatus !== 'rejected' && !e.isOutstandingAdvance;
  const filteredExpenses = useMemo(() => expenses.filter((e) => visibleProjectIds.has(e.projectId) && isCountedExpense(e) && isInRange(e.date, currentRange)), [expenses, visibleProjectIds, isInRange, currentRange]);
  const filteredAllExpenses = useMemo(() => expenses.filter((e) => visibleProjectIds.has(e.projectId) && isCountedExpense(e)), [expenses, visibleProjectIds]);
  const filteredRevenues = useMemo(() => revenues.filter((r) => visibleProjectIds.has(r.projectId) && isInRange(r.date, currentRange)), [revenues, visibleProjectIds, isInRange, currentRange]);
  const filteredAllRevenues = useMemo(() => revenues.filter((r) => visibleProjectIds.has(r.projectId)), [revenues, visibleProjectIds]);
  const filteredChangeOrders = useMemo(() => changeOrders.filter((co) => visibleProjectIds.has(co.projectId)), [changeOrders, visibleProjectIds]);
  const filteredMilestones = useMemo(() => milestones.filter((m) => visibleProjectIds.has(m.projectId)), [milestones, visibleProjectIds]);
  const filteredRisks = useMemo(() => risks.filter((r) => !r.projectId || visibleProjectIds.has(r.projectId)), [risks, visibleProjectIds]);
  const filteredPortfolios = useMemo(() => portfolios.filter((portfolio) => filteredProjects.some((project) => project.portfolioId === portfolio.id)), [portfolios, filteredProjects]);
  const defaultVisibleProjectsCount = useMemo(() => {
    if (filterStatus !== 'all' || showInactive) return projects.length;
    return projects.filter((project) => {
      if (filterCompany === 'all') {
        const company = companies.find((c) => c.id === project.companyId);
        if (company?.status === 'archived') return false;
      }
      if (filterCompany !== 'all' && project.companyId !== filterCompany) return false;
      return !INACTIVE_STATUSES.includes(project.status);
    }).length;
  }, [projects, companies, filterCompany, filterStatus, showInactive]);

  const hasActiveFilters = filterCompany !== 'all' || filterStatus !== 'all' || searchQuery !== '' || timePeriod !== 'all' || showInactive;
  const clearFilters = () => { setFilterCompany('all'); setFilterStatus('all'); setSearchQuery(''); setTimePeriod('all'); setShowInactive(false); };

  // Stats
  const totalContractValue = filteredProjects.reduce((s, p) => s + p.contractValue, 0);
  const totalExpenses = filteredExpenses.reduce((s, e) => s + e.amount, 0);
  const totalPlanned = getTotalPlanned(filteredBudgetItems);
  const approvedChangeImpact = filteredChangeOrders.filter(co => co.status === 'approved').reduce((s, co) => s + co.amountImpact, 0);
  const effectiveTotalContract = totalContractValue + approvedChangeImpact;
  const plannedProfit = effectiveTotalContract - totalPlanned;
  const plannedProfitMargin = effectiveTotalContract > 0 ? (plannedProfit / effectiveTotalContract) * 100 : 0;
  const collectedRevenue = filteredRevenues.filter(r => r.status === 'collected').reduce((s, r) => s + r.amount, 0);
  const prevExpenses = previousRange ? filteredAllExpenses.filter((e) => isInRange(e.date, previousRange)).reduce((s, e) => s + e.amount, 0) : 0;
  const prevRevenue = previousRange ? filteredAllRevenues.filter((r) => r.status === 'collected' && isInRange(r.date, previousRange)).reduce((s, r) => s + r.amount, 0) : 0;
  const expenseChange = prevExpenses > 0 ? ((totalExpenses - prevExpenses) / prevExpenses) * 100 : null;
  const revenueChange = prevRevenue > 0 ? ((collectedRevenue - prevRevenue) / prevRevenue) * 100 : null;

  // The same rows as the total expenses card: visible projects, counted, in the period.
  const companyData = companies.map((c) => {
    const compProjects = filteredProjects.filter((p) => p.companyId === c.id);
    const total = filteredExpenses.filter((e) => compProjects.some((p) => p.id === e.projectId)).reduce((s, e) => s + e.amount, 0);
    return { name: c.name, value: total };
  }).filter((d) => d.value > 0);

  const statusData = Object.entries(PROJECT_STATUS_LABELS).map(([key, label]) => ({
    name: label, value: filteredProjects.filter((p) => p.status === key).length,
  })).filter((d) => d.value > 0);

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

            <AttentionProjects
              filteredProjects={filteredProjects} expenses={filteredAllExpenses}
              budgetItems={filteredBudgetItems} revenues={filteredAllRevenues} changeOrders={filteredChangeOrders}
              risks={risks} projects={projects} portfolios={portfolios}
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
