import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { AppLayout } from '@/components/AppLayout';
import { StatCard } from '@/components/StatCard';
import { formatCurrency, getProjectSummary, getExpensesByCategory, getMonthlyBreakdown } from '@/lib/finance';
import { EXPENSE_CATEGORY_LABELS, type ExpenseCategory } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { motion } from 'framer-motion';
import {
  DollarSign, TrendingUp, TrendingDown, Target, Users, Wallet, History,
  BarChart3, Receipt, PiggyBank, Baseline,
  FileSpreadsheet, FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { BudgetAlerts } from '@/components/BudgetAlerts';
import { exportToExcel, exportToPDF } from '@/lib/export';

// Sub-components
import { ResourcesSection } from '@/components/project/ResourcesSection';
import { BudgetSection } from '@/components/project/BudgetSection';
import { BaselineSection } from '@/components/project/BaselineSection';
import { ExpensesSection } from '@/components/project/ExpensesSection';
import { CustodySection } from '@/components/project/CustodySection';
import { RevenueSection } from '@/components/project/RevenueSection';
import { ChartsSection } from '@/components/project/ChartsSection';
import { AuditLogSection } from '@/components/project/AuditLogSection';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    projects, companies, portfolios, budgetItems, expenses, revenues, resources, custodies,
    loadAll,
  } = useStore();

  useEffect(() => { loadAll(); }, []);

  const project = projects.find((p) => p.id === id);
  if (!project) {
    return (
      <AppLayout>
        <div className="text-center py-20">
          <p className="text-muted-foreground">المشروع غير موجود</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/')}>العودة</Button>
        </div>
      </AppLayout>
    );
  }

  const company = companies.find((c) => c.id === project.companyId);
  const portfolio = project.portfolioId ? portfolios.find((p) => p.id === project.portfolioId) : null;
  const pBudget = budgetItems.filter((b) => b.projectId === project.id);
  const pExpenses = expenses.filter((e) => e.projectId === project.id);
  const pRevenues = revenues.filter((r) => r.projectId === project.id);
  const pResources = resources.filter((r) => r.projectId === project.id);
  const pCustodies = custodies.filter((c) => c.projectId === project.id);
  const summary = getProjectSummary(project, pBudget, pExpenses, pRevenues);
  const categoryBreakdown = getExpensesByCategory(pExpenses);
  const monthlyData = getMonthlyBreakdown(pExpenses, project.durationMonths);

  const pieData = Object.entries(categoryBreakdown).map(([key, value]) => ({
    name: EXPENSE_CATEGORY_LABELS[key as ExpenseCategory] || key,
    value,
  }));

  const barData = monthlyData.map((v, i) => ({
    month: `شهر ${i + 1}`,
    مصروفات: v,
  }));

  const getActualForItem = (item: any) =>
    pExpenses.filter((e) => e.budgetItemId === item.id).reduce((s: number, e: any) => s + e.amount, 0);

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        {/* Header */}
        <div className="page-header">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <span>{company?.name}</span>
            {portfolio && (<><span>←</span><span>{portfolio.name}</span></>)}
          </div>
          <h1 className="page-title">{project.name}</h1>
          <p className="page-subtitle">
            {project.durationMonths} أشهر · {project.resourceCount} موارد · {project.currency}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard title="قيمة العقد" value={formatCurrency(project.contractValue)} icon={<DollarSign className="w-4 h-4" />} />
          <StatCard title="المصروفات الفعلية" value={formatCurrency(summary.totalActual)} icon={<TrendingDown className="w-4 h-4" />} trend="down" subtitle={`المخطط: ${formatCurrency(summary.totalPlanned)}`} />
          <StatCard title="صافي الربح" value={formatCurrency(summary.netProfit)} icon={<TrendingUp className="w-4 h-4" />} trend={summary.netProfit >= 0 ? 'up' : 'down'} subtitle={`هامش الربح: ${summary.profitMargin.toFixed(1)}%`} />
          <StatCard title="المتبقي من الميزانية" value={formatCurrency(summary.remaining)} icon={<Target className="w-4 h-4" />} trend={summary.remaining >= 0 ? 'up' : 'down'} />
        </div>

        <BudgetAlerts totalPlanned={summary.totalPlanned} totalActual={summary.totalActual} contractValue={project.contractValue} budgetItems={pBudget} expenses={pExpenses} />

        {/* Export Buttons */}
        <div className="flex gap-2 mb-4">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
            exportToExcel({
              projectName: project.name, contractValue: project.contractValue,
              budgetItems: pBudget.map(b => ({ ...b, actual: getActualForItem(b) })),
              expenses: pExpenses, revenues: pRevenues,
              totalPlanned: summary.totalPlanned, totalActual: summary.totalActual, totalRevenue: summary.totalRevenue,
            });
            toast.success('تم تصدير التقرير إلى Excel');
          }}>
            <FileSpreadsheet className="w-3.5 h-3.5" />تصدير Excel
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
            exportToPDF({
              projectName: project.name, contractValue: project.contractValue,
              budgetItems: pBudget.map(b => ({ ...b, actual: getActualForItem(b) })),
              expenses: pExpenses, revenues: pRevenues,
              totalPlanned: summary.totalPlanned, totalActual: summary.totalActual, totalRevenue: summary.totalRevenue,
            });
            toast.success('تم تصدير التقرير إلى PDF');
          }}>
            <FileText className="w-3.5 h-3.5" />تصدير PDF
          </Button>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="resources" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 sm:grid-cols-8 max-w-5xl">
            <TabsTrigger value="resources" className="gap-1 text-xs"><Users className="w-3.5 h-3.5" /><span className="hidden sm:inline">الموارد</span></TabsTrigger>
            <TabsTrigger value="budget" className="gap-1 text-xs"><PiggyBank className="w-3.5 h-3.5" /><span className="hidden sm:inline">الموازنة</span></TabsTrigger>
            <TabsTrigger value="baseline" className="gap-1 text-xs"><Baseline className="w-3.5 h-3.5" /><span className="hidden sm:inline">خط الأساس</span></TabsTrigger>
            <TabsTrigger value="expenses" className="gap-1 text-xs"><Receipt className="w-3.5 h-3.5" /><span className="hidden sm:inline">المصروفات</span></TabsTrigger>
            <TabsTrigger value="custody" className="gap-1 text-xs"><Wallet className="w-3.5 h-3.5" /><span className="hidden sm:inline">العهد</span></TabsTrigger>
            <TabsTrigger value="revenue" className="gap-1 text-xs"><DollarSign className="w-3.5 h-3.5" /><span className="hidden sm:inline">الإيرادات</span></TabsTrigger>
            <TabsTrigger value="charts" className="gap-1 text-xs"><BarChart3 className="w-3.5 h-3.5" /><span className="hidden sm:inline">التحليلات</span></TabsTrigger>
            <TabsTrigger value="auditlog" className="gap-1 text-xs"><History className="w-3.5 h-3.5" /><span className="hidden sm:inline">السجل</span></TabsTrigger>
          </TabsList>

          <TabsContent value="resources"><ResourcesSection projectId={project.id} resources={pResources} /></TabsContent>
          <TabsContent value="budget"><BudgetSection projectId={project.id} budgetItems={pBudget} expenses={pExpenses} durationMonths={project.durationMonths} resources={pResources} contractValue={project.contractValue} currency={project.currency} /></TabsContent>
          <TabsContent value="baseline"><BaselineSection projectId={project.id} durationMonths={project.durationMonths} expenses={pExpenses} budgetItems={pBudget} /></TabsContent>
          <TabsContent value="expenses"><ExpensesSection projectId={project.id} durationMonths={project.durationMonths} expenses={pExpenses} resources={pResources} custodies={pCustodies} budgetItems={pBudget} revenues={pRevenues} contractValue={project.contractValue} /></TabsContent>
          <TabsContent value="custody"><CustodySection projectId={project.id} companyId={project.companyId} custodies={pCustodies} expenses={pExpenses} /></TabsContent>
          <TabsContent value="revenue"><RevenueSection projectId={project.id} revenues={pRevenues} durationMonths={project.durationMonths} /></TabsContent>
          <TabsContent value="charts"><ChartsSection pieData={pieData} barData={barData} /></TabsContent>
          <TabsContent value="auditlog"><AuditLogSection projectId={project.id} /></TabsContent>
        </Tabs>
      </motion.div>
    </AppLayout>
  );
}
