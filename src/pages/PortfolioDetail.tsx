import { useEffect, useMemo } from 'react';
import { useDialogSession } from '@/hooks/useDialogSession';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { useCoreData } from '@/hooks/useAppData';
import { useRole } from '@/hooks/useRole';
import { AppLayout } from '@/components/AppLayout';
import { StatCard } from '@/components/StatCard';
import { formatCurrency } from '@/lib/finance';
import { getPortfolioSummary } from '@/lib/portfolio';
import { exportPortfolioToExcel, exportPortfolioToPDF } from '@/lib/export-lazy';
import { HEALTH_STATUS_LABELS, HEALTH_STATUS_COLORS } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { motion } from 'framer-motion';
import { DollarSign, TrendingUp, TrendingDown, Target, FileSpreadsheet, FolderKanban, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { RisksSection } from '@/components/project/RisksSection';
import { PortfolioPayablesSection } from '@/components/portfolio/PortfolioPayablesSection';
import { PageHeader } from '@/components/ui/page-header';
import { MixedCurrencyNotice } from '@/components/MixedCurrencyNotice';
import { EditPortfolioDialog } from './portfolio/EditPortfolioDialog';
import { ProjectComparisonTable } from './portfolio/ProjectComparisonTable';
import { PortfolioCharts } from './portfolio/PortfolioCharts';
import { buildPortfolioExport } from './portfolio/buildPortfolioExport';
import { rankProjects, aggregateCashFlow } from './portfolio/portfolioFigures';
import { countAr } from '@/lib/plural';
import { useShallow } from 'zustand/react/shallow';


export default function PortfolioDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, canEdit } = useRole();
  const {
    portfolios, companies, projects, budgetItems, expenses, revenues,
    changeOrders, milestones, risks, loading, deletePortfolio,
  } = useStore(useShallow((s) => ({ portfolios: s.portfolios, companies: s.companies, projects: s.projects, budgetItems: s.budgetItems, expenses: s.expenses, revenues: s.revenues, changeOrders: s.changeOrders, milestones: s.milestones, risks: s.risks, loading: s.loading, deletePortfolio: s.deletePortfolio })));

  const { loadProjectData } = useStore(useShallow((s) => ({ loadProjectData: s.loadProjectData })));

  useCoreData();

  // Load project data for all portfolio projects (idempotent per project)
  const earlyPortfolioProjects = useMemo(() => projects.filter(p => p.portfolioId === id), [projects, id]);
  useEffect(() => {
    earlyPortfolioProjects.forEach(p => loadProjectData(p.id));
  }, [earlyPortfolioProjects, loadProjectData]);

  const portfolio = portfolios.find(p => p.id === id);
  const company = portfolio ? companies.find(c => c.id === portfolio.companyId) : null;

  // Remounted on open so the form starts from the portfolio; see useDialogSession.
  const edit = useDialogSession<true>();

  const summary = useMemo(() => {
    if (!portfolio) return null;
    return getPortfolioSummary(
      portfolio, projects, budgetItems, expenses, revenues,
      changeOrders, milestones, risks,
    );
  }, [portfolio, projects, budgetItems, expenses, revenues, changeOrders, milestones, risks]);

  const portfolioProjects = useMemo(() => {
    if (!portfolio) return [];
    return projects.filter(p => p.portfolioId === portfolio.id);
  }, [portfolio, projects]);

  const projectSummaries = useMemo(
    () => rankProjects(portfolioProjects, budgetItems, expenses, revenues, changeOrders),
    [portfolioProjects, budgetItems, expenses, revenues, changeOrders],
  );

  const pieData = useMemo(() =>
    projectSummaries.filter(ps => ps.summary.totalActual > 0).map(ps => ({
      name: ps.project.name, value: ps.summary.totalActual,
    })), [projectSummaries]);

  const barData = useMemo(() =>
    projectSummaries.map(ps => ({
      name: ps.project.name.substring(0, 15),
      'الربح المخطط': ps.summary.plannedProfit,
    })), [projectSummaries]);

  const cashFlowData = useMemo(
    () => aggregateCashFlow(portfolioProjects, budgetItems, expenses, revenues),
    [portfolioProjects, budgetItems, expenses, revenues],
  );

  const portfolioRisks = useMemo(() => {
    if (!portfolio) return [];
    const projectIds = new Set(portfolioProjects.map(p => p.id));
    return risks.filter(r =>
      r.portfolioId === portfolio.id || (r.projectId && projectIds.has(r.projectId))
    );
  }, [portfolio, portfolioProjects, risks]);

  if (!portfolio) {
    return (
      <AppLayout>
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <div className="text-center py-20">
            <p className="text-muted-foreground">المحفظة غير موجودة</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate('/')}>العودة</Button>
          </div>
        )}
      </AppLayout>
    );
  }

  if (!summary) return null;

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <PageHeader
          eyebrow={
            <span className="flex items-center gap-1.5">
              <button onClick={() => navigate('/')} className="hover:text-foreground transition-colors">لوحة التحكم</button>
              {company && (
                <>
                  <span aria-hidden>←</span>
                  <button onClick={() => navigate(`/company/${company.id}`)} className="hover:text-foreground transition-colors">{company.name}</button>
                </>
              )}
            </span>
          }
          title={
            <span className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center shrink-0">
                <FolderKanban className="w-5 h-5 text-violet-600 dark:text-violet-400" />
              </span>
              <span>{portfolio.name}</span>
            </span>
          }
          subtitle={
            <span>
              {countAr(summary.projectCount, 'project')}
              {portfolio.fiscalYear && <> · السنة المالية {portfolio.fiscalYear}</>}
            </span>
          }
          meta={
            <Badge className={`text-xs ${HEALTH_STATUS_COLORS[summary.healthStatus]}`}>
              {HEALTH_STATUS_LABELS[summary.healthStatus]}
            </Badge>
          }
          actions={
            <>
              {(isAdmin || canEdit('company', portfolio.companyId)) && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => edit.open(true)}>
                  <Pencil className="w-3.5 h-3.5" />تعديل
                </Button>
              )}
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
                exportPortfolioToExcel(buildPortfolioExport(portfolio, summary, projectSummaries, portfolioRisks, projects));
                toast.success('تم تصدير تقرير المحفظة');
              }}>
                <FileSpreadsheet className="w-3.5 h-3.5" />Excel
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
                exportPortfolioToPDF(buildPortfolioExport(portfolio, summary, projectSummaries, portfolioRisks, projects));
                toast.success('تم تصدير تقرير PDF');
              }}>
                <FileSpreadsheet className="w-3.5 h-3.5" />PDF
              </Button>
              {isAdmin && (
                <ConfirmDeleteDialog
                  title="حذف المحفظة"
                  description={`هل أنت متأكد من حذف "${portfolio.name}"؟ ستصبح المشاريع بدون محفظة.`}
                  onConfirm={async () => {
                    try { await deletePortfolio(id!); toast.success('تم الحذف'); navigate('/'); } catch { toast.error('فشل الحذف'); }
                  }}
                  trigger={
                    <Button variant="ghost" size="icon" title="حذف المحفظة" className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  }
                />
              )}
            </>
          }
        />

        <MixedCurrencyNotice currencies={summary.currencies} scopeLabel="هذه المحفظة" />

        <EditPortfolioDialog key={edit.session} portfolio={portfolio} open={edit.value !== null} onOpenChange={(v) => { if (!v) edit.close(); }} />

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard title="قيمة العقود الفعّالة" value={formatCurrency(summary.totalEffectiveValue)} icon={<DollarSign className="w-4 h-4" />} tooltip="العقود الأصلية + أوامر التغيير المعتمدة لكل مشاريع المحفظة." />
          <StatCard title="المصروف الفعلي" value={formatCurrency(summary.totalActual)} icon={<TrendingDown className="w-4 h-4" />} trend="down" tooltip="المصروفات المقبولة، بعد استبعاد المرفوض والسلف القائمة." />
          <StatCard title="الربح المخطط الإجمالي" value={formatCurrency(summary.aggregatePlannedProfit)} icon={<TrendingUp className="w-4 h-4" />} trend={summary.aggregatePlannedProfit >= 0 ? 'up' : 'down'} subtitle={`هامش: ${summary.aggregatePlannedMargin.toFixed(1)}%`} tooltip="قيمة العقود الفعّالة − الموازنات المعتمدة. لا يساوي الربح النقدي المحقق." />
          <StatCard title="الإنجاز المرجّح" value={`${summary.weightedPercentComplete.toFixed(1)}%`} icon={<Target className="w-4 h-4" />} subtitle={`${summary.projectCount} مشروع`} tooltip="متوسط إنجاز المشاريع موزوناً بقيمة العقد الفعّالة لكل مشروع." />
        </div>

        {/* Revenue target bar */}
        {portfolio.targetRevenue > 0 && (
          <div className="stat-card mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold">هدف الإيراد المحصّل</span>
              <span className="text-sm font-mono">{formatCurrency(summary.totalCollectedRevenue)} / {formatCurrency(portfolio.targetRevenue)}</span>
            </div>
            <Progress value={Math.min(summary.revenueAchievement, 100)} aria-label="تحقيق الإيراد المستهدف" className="h-3" />
            <p className="text-xs text-muted-foreground mt-1">{summary.revenueAchievement.toFixed(1)}% من المستهدف</p>
          </div>
        )}

        <ProjectComparisonTable rows={projectSummaries} />

        <PortfolioCharts pieData={pieData} barData={barData} cashFlowData={cashFlowData} />

        {/* Payables across the portfolio */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold mb-4">المستحقات مقابل التسويات والمدفوعات المتوقعة</h3>
          <PortfolioPayablesSection projects={portfolioProjects} />
        </div>

        {/* Risks */}
        <div className="stat-card mb-6">
          <h3 className="text-sm font-semibold mb-4">المخاطر</h3>
          <RisksSection portfolioId={portfolio.id} risks={portfolioRisks} />
        </div>
      </motion.div>
    </AppLayout>
  );
}
