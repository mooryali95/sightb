import { useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { AppLayout } from '@/components/AppLayout';
import { StatCard } from '@/components/StatCard';
import { formatCurrency } from '@/lib/finance';
import { getPortfolioSummary, getHealthScore } from '@/lib/portfolio';
import { getProjectSummary, getCashFlowForecast } from '@/lib/finance';
import { exportPortfolioToExcel } from '@/lib/export';
import { HEALTH_STATUS_LABELS, HEALTH_STATUS_COLORS, PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS, RISK_PROBABILITY_LABELS, RISK_STATUS_LABELS, type ProjectStatus } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { motion } from 'framer-motion';
import {
  DollarSign, TrendingUp, Target, BarChart3,
  FileSpreadsheet, ArrowLeft, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend,
} from 'recharts';
import { RisksSection } from '@/components/project/RisksSection';

const COLORS = ['hsl(40, 55%, 55%)', 'hsl(160, 60%, 42%)', 'hsl(38, 92%, 50%)', 'hsl(0, 72%, 51%)', 'hsl(280, 60%, 50%)', 'hsl(200, 70%, 50%)'];

export default function PortfolioDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    portfolios, companies, projects, budgetItems, expenses, revenues,
    changeOrders, milestones, risks, loading, loadAll,
  } = useStore();

  useEffect(() => { loadAll(); }, []);

  const portfolio = portfolios.find(p => p.id === id);
  const company = portfolio ? companies.find(c => c.id === portfolio.companyId) : null;

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

  const projectSummaries = useMemo(() => {
    return portfolioProjects.map(project => {
      const pBudget = budgetItems.filter(b => b.projectId === project.id);
      const pExpenses = expenses.filter(e => e.projectId === project.id);
      const pRevenues = revenues.filter(r => r.projectId === project.id);
      const pCO = changeOrders.filter(co => co.projectId === project.id);
      const s = getProjectSummary(project, pBudget, pExpenses, pRevenues, pCO);
      const health = s.spendRate > 100 || project.status === 'on-hold' || project.status === 'cancelled' ? 'critical' : s.spendRate > 90 ? 'warning' : 'healthy';
      return { project, summary: s, health };
    }).sort((a, b) => {
      const order = { critical: 0, warning: 1, healthy: 2 };
      return (order[a.health as keyof typeof order] ?? 2) - (order[b.health as keyof typeof order] ?? 2);
    });
  }, [portfolioProjects, budgetItems, expenses, revenues, changeOrders]);

  // Charts data
  const pieData = useMemo(() =>
    projectSummaries.filter(ps => ps.summary.totalActual > 0).map(ps => ({
      name: ps.project.name, value: ps.summary.totalActual,
    })), [projectSummaries]);

  const barData = useMemo(() =>
    projectSummaries.map(ps => ({
      name: ps.project.name.substring(0, 15),
      'الربح المخطط': ps.summary.plannedProfit,
    })), [projectSummaries]);

  // Aggregated cash flow
  const cashFlowData = useMemo(() => {
    if (portfolioProjects.length === 0) return [];
    const maxMonths = Math.max(...portfolioProjects.map(p => p.durationMonths), 1);
    const aggregated: { month: number; مخطط: number; فعلي: number }[] = [];
    for (let m = 1; m <= maxMonths; m++) {
      let planned = 0, actual = 0;
      portfolioProjects.forEach(project => {
        const pBudget = budgetItems.filter(b => b.projectId === project.id);
        const pExpenses = expenses.filter(e => e.projectId === project.id);
        const pRevenues = revenues.filter(r => r.projectId === project.id);
        const cf = getCashFlowForecast(pBudget, pExpenses, pRevenues, project.durationMonths);
        const entry = cf.find(c => c.month === m);
        if (entry) { planned += entry.cumulativePlanned; actual += entry.cumulativeActual; }
      });
      aggregated.push({ month: m, مخطط: planned, فعلي: actual });
    }
    return aggregated;
  }, [portfolioProjects, budgetItems, expenses, revenues]);

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
        <div className="text-center py-20">
          <p className="text-muted-foreground">المحفظة غير موجودة</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/')}>العودة</Button>
        </div>
      </AppLayout>
    );
  }

  if (!summary) return null;

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        {/* Header */}
        <div className="page-header">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <button onClick={() => navigate('/')} className="hover:text-primary transition-colors">لوحة التحكم</button>
            <span>←</span>
            {company && <button onClick={() => navigate(`/company/${company.id}`)} className="hover:text-primary transition-colors">{company.name}</button>}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="page-title">{portfolio.name}</h1>
              <span className={`text-xs px-2 py-0.5 rounded-full ${HEALTH_STATUS_COLORS[summary.healthStatus]}`}>
                {HEALTH_STATUS_LABELS[summary.healthStatus]}
              </span>
            </div>
          </div>
          {portfolio.fiscalYear && <p className="text-xs text-muted-foreground mt-1">السنة المالية: {portfolio.fiscalYear}</p>}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard title="إجمالي قيمة العقود" value={formatCurrency(summary.totalEffectiveValue)} icon={<DollarSign className="w-4 h-4" />} />
          <StatCard title="إجمالي المصروفات" value={formatCurrency(summary.totalActual)} icon={<TrendingUp className="w-4 h-4" />} trend="down" />
          <StatCard title="الربح المخطط الإجمالي" value={formatCurrency(summary.aggregatePlannedProfit)} icon={<TrendingUp className="w-4 h-4" />} trend={summary.aggregatePlannedProfit >= 0 ? 'up' : 'down'} subtitle={`هامش: ${summary.aggregatePlannedMargin.toFixed(1)}%`} />
          <StatCard title="الإنجاز المرجّح" value={`${summary.weightedPercentComplete.toFixed(1)}%`} icon={<Target className="w-4 h-4" />} subtitle={`${summary.projectCount} مشروع`} />
        </div>

        {/* Revenue target bar */}
        {portfolio.targetRevenue > 0 && (
          <div className="stat-card mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold">هدف الإيراد المحصّل</span>
              <span className="text-sm font-mono">{formatCurrency(summary.totalCollectedRevenue)} / {formatCurrency(portfolio.targetRevenue)}</span>
            </div>
            <Progress value={Math.min(summary.revenueAchievement, 100)} className="h-3" />
            <p className="text-xs text-muted-foreground mt-1">{summary.revenueAchievement.toFixed(1)}% من المستهدف</p>
          </div>
        )}

        {/* Project comparison table */}
        {projectSummaries.length > 0 && (
          <div className="stat-card mb-6">
            <h3 className="text-sm font-semibold mb-4">مقارنة المشاريع</h3>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>المشروع</th>
                    <th>القيمة</th>
                    <th className="hidden md:table-cell">المخطط</th>
                    <th>المصروف</th>
                    <th>الربح المخطط</th>
                    <th>الإنجاز%</th>
                    <th>الصحة</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {projectSummaries.map(({ project, summary: ps, health }) => (
                    <tr key={project.id} className="cursor-pointer" onClick={() => navigate(`/project/${project.id}`)}>
                      <td className="font-medium">{project.name}</td>
                      <td className="font-mono text-sm">{formatCurrency(ps.effectiveContractValue)}</td>
                      <td className="font-mono text-sm hidden md:table-cell">{formatCurrency(ps.totalPlanned)}</td>
                      <td className="font-mono text-sm">{formatCurrency(ps.totalActual)}</td>
                      <td><span className={ps.plannedProfit >= 0 ? 'badge-profit' : 'badge-loss'}>{formatCurrency(ps.plannedProfit)}</span></td>
                      <td className="text-sm">{project.percentComplete}%</td>
                      <td>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${HEALTH_STATUS_COLORS[health as keyof typeof HEALTH_STATUS_COLORS]}`}>
                          {HEALTH_STATUS_LABELS[health as keyof typeof HEALTH_STATUS_LABELS]}
                        </span>
                      </td>
                      <td><ArrowLeft className="w-4 h-4 text-muted-foreground" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {pieData.length > 0 && (
            <div className="stat-card">
              <h3 className="text-sm font-semibold mb-4">توزيع المصروفات حسب المشروع</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value" label={({ name, value }) => `${name}: ${(value / 1000).toFixed(0)}k`}>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {barData.length > 0 && (
            <div className="stat-card">
              <h3 className="text-sm font-semibold mb-4">الربح المخطط لكل مشروع</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                  <Bar dataKey="الربح المخطط" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Cash flow chart */}
        {cashFlowData.length > 0 && (
          <div className="stat-card mb-6">
            <h3 className="text-sm font-semibold mb-4">التدفق النقدي المجمّع (تراكمي)</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={cashFlowData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tickFormatter={v => `${v}`} />
                <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                <Legend />
                <Line type="monotone" dataKey="مخطط" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="فعلي" stroke="hsl(160, 60%, 42%)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Risks */}
        <div className="stat-card mb-6">
          <h3 className="text-sm font-semibold mb-4">المخاطر</h3>
          <RisksSection portfolioId={portfolio.id} risks={portfolioRisks} />
        </div>
      </motion.div>
    </AppLayout>
  );
}
