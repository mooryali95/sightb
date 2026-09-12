import { useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { useRole } from '@/hooks/useRole';
import { useCoreData, useProjectData } from '@/hooks/useAppData';
import {
  getProjectSummary, getExpensesByCategory, getMonthlyBreakdown,
  calculateEVM, getCurrentMonth,
} from '@/lib/finance';
import { EXPENSE_CATEGORY_LABELS, type BudgetItem, type ExpenseCategory } from '@/types/project';

/**
 * Single data entry point for the project detail page.
 * Owns loading/subscriptions and every derived figure so the page component
 * stays a pure shell. All hooks run unconditionally (project may be undefined).
 */
export function useProjectDetailData(id: string | undefined) {
  const { isAdmin: isSystemAdmin, isAdminFor, canEdit: canEditRole } = useRole();
  const isAdmin = id ? isAdminFor('project', id) : isSystemAdmin;

  const {
    projects, companies, portfolios, budgetItems, expenses, revenues, resources, custodies,
    milestones, changeOrders, risks, baselines, commitments,
    projectFunds, fundSettlements, paymentRequests, cashTransfers,
    loadAll, updateProject, archiveProject, deleteProject,
  } = useStore();

  const { detailsLoaded, subscribeToProject, ensureProjectCashData } = useStore();

  useCoreData();
  useProjectData(detailsLoaded ? undefined : id);

  // النقد (دفعات + مستحقات + تحويلات) ليس جزءاً من loadAll()/loadDetails()،
  // وبدون تحميله تظهر أرصدة وهمية للدفعات والعُهد.
  useEffect(() => {
    if (!id) return;
    ensureProjectCashData(id).catch((e: unknown) => console.warn('[ProjectDetail] cash data', e));
  }, [id, ensureProjectCashData]);


  // Realtime subscription for collaborative editing — cleanup on id change
  useEffect(() => {
    if (!id) return;
    return subscribeToProject(id);
  }, [id, subscribeToProject]);

  const project = projects.find((p) => p.id === id);

  if (!project) {
    return { project: undefined, isAdmin, isSystemAdmin, canEditRole, updateProject, archiveProject, deleteProject } as const;
  }

  const isReadOnly = !canEditRole('project', project.id);
  const company = companies.find((c) => c.id === project.companyId);
  const portfolio = project.portfolioId ? portfolios.find((p) => p.id === project.portfolioId) : null;

  const pBudget = budgetItems.filter((b) => b.projectId === project.id);
  const pExpenses = expenses.filter((e) => e.projectId === project.id);
  const pRevenues = revenues.filter((r) => r.projectId === project.id);
  const pResources = resources.filter((r) => r.projectId === project.id);
  const pCustodies = custodies.filter((c) => c.projectId === project.id);
  const pMilestones = milestones.filter((m) => m.projectId === project.id);
  const pChangeOrders = changeOrders.filter((co) => co.projectId === project.id);
  const pRisks = risks.filter((r) => r.projectId === project.id);
  const pCommitments = (commitments || []).filter((c) => c.projectId === project.id);

  const summary = getProjectSummary(project, pBudget, pExpenses, pRevenues, pChangeOrders);
  const categoryBreakdown = getExpensesByCategory(pExpenses);
  const monthlyData = getMonthlyBreakdown(pExpenses, project.durationMonths);

  const pieData = Object.entries(categoryBreakdown).map(([key, value]) => ({
    name: EXPENSE_CATEGORY_LABELS[key as ExpenseCategory] || key, value,
  }));
  const barData = monthlyData.map((v, i) => ({ month: `شهر ${i + 1}`, مصروفات: v }));

  // Spend against an item is what the summary counts as spend: not a
  // rejected expense, not an advance still outstanding.
  const countedExpenses = pExpenses.filter((e) => e.approvalStatus !== 'rejected' && !e.isOutstandingAdvance);
  const getActualForItem = (item: BudgetItem) =>
    countedExpenses.filter((e) => e.budgetItemId === item.id).reduce((s, e) => s + e.amount, 0);

  const projectBaselines = baselines.filter((b) => b.projectId === project.id);
  const activeBaseline = projectBaselines.find((b) => b.isActive);
  const currentMonth = getCurrentMonth(project.startDate, project.durationMonths);
  const evm = activeBaseline
    ? calculateEVM(
        activeBaseline.items, pExpenses, project.durationMonths,
        Math.min(project.durationMonths, currentMonth),
        project.percentComplete, project.managementReserve || 0,
      )
    : null;

  const activeCommitments = pCommitments.filter((c) => c.status === 'active');
  const totalCommitted = activeCommitments.reduce((s, c) => s + c.totalAmount, 0);
  const availableBudget = summary.totalPlanned - totalCommitted;

  const daysRemaining = project.endDate
    ? Math.max(0, Math.ceil((new Date(project.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;
  const monthsRemaining = summary.burnRate > 0 ? Math.max(0, summary.budgetRemaining / summary.burnRate) : null;

  // The project's own rate; the row mapper already defaults a missing one
  // to 15, so zero here means zero.
  const vatRate = project.taxPercent;

  const healthScore = (() => {
    let score = 0;
    if (summary.spendRate <= 100) score++;
    if (!evm || evm.spi >= 0.9) score++;
    if (pRisks.filter((r) => r.status === 'open' && (r.impact === 'high' || r.impact === 'very_high')).length === 0) score++;
    if (summary.plannedProfit >= 0) score++;
    if (score >= 4) return { label: 'سليم', color: 'health-good', bg: 'bg-success/10 border-success/25' };
    if (score >= 2) return { label: 'يحتاج انتباه', color: 'health-warning', bg: 'bg-warning/10 border-warning/25' };
    return { label: 'حرج', color: 'health-critical', bg: 'bg-destructive/10 border-destructive/25' };
  })();

  const openRisksCount = pRisks.filter((r) => r.status === 'open' || r.status === 'mitigating').length;
  const pendingExpensesCount = pExpenses.filter((e) => e.approvalStatus === 'pending').length;
  const totalAllRevenue = pRevenues.reduce((s, r) => s + r.amount, 0);
  const pendingChangeOrders = pChangeOrders.filter((co) => co.status === 'proposed').length;
  const openHighRisks = pRisks.filter((r) => r.status === 'open' && (r.impact === 'high' || r.probability === 'high')).length;
  const baselineLocked = baselines.some((b) => b.isActive && b.projectId === project.id);

  return {
    project, company, portfolio,
    isAdmin, isSystemAdmin, isReadOnly, canEditRole,
    updateProject, archiveProject, deleteProject,
    pBudget, pExpenses, pRevenues, pResources, pCustodies,
    pMilestones, pChangeOrders, pRisks, pCommitments,
    projectFunds, fundSettlements, paymentRequests, cashTransfers,
    summary, pieData, barData, getActualForItem,
    projectBaselines, evm, currentMonth,
    totalCommitted, availableBudget, daysRemaining, monthsRemaining,
    vatRate, healthScore, openRisksCount, pendingExpensesCount,
    totalAllRevenue, pendingChangeOrders, openHighRisks, baselineLocked,
  } as const;
}

export type ProjectDetailData = ReturnType<typeof useProjectDetailData>;
