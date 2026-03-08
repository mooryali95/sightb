import { useStore } from '@/store/useStore';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { StatCard } from '@/components/StatCard';
import { formatCurrency, getProjectSummary } from '@/lib/finance';
import { getPortfolioSummary, getHealthScore } from '@/lib/portfolio';
import {
  PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS, type ProjectStatus,
  HEALTH_STATUS_LABELS, HEALTH_STATUS_COLORS,
  RISK_PROBABILITY_LABELS, RISK_PROBABILITY_COLORS, type RiskProbability,
} from '@/types/project';
import {
  Building2, FolderKanban, Briefcase, TrendingUp, Plus,
  ArrowLeft, DollarSign, Filter, Search, X, Archive, ArchiveRestore,
  AlertTriangle, ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useState, useMemo, useEffect } from 'react';
import basserhLogo from '@/assets/basserh-logo.jpg';
import { useRole } from '@/hooks/useRole';

const COLORS = ['hsl(40, 55%, 55%)', 'hsl(160, 60%, 42%)', 'hsl(38, 92%, 50%)', 'hsl(0, 72%, 51%)', 'hsl(280, 60%, 50%)'];

const stagger = {
  container: { hidden: {}, show: { transition: { staggerChildren: 0.08 } } },
  item: { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } } },
};

export default function Dashboard() {
  const { companies, portfolios, projects, budgetItems, expenses, revenues, changeOrders, milestones, risks, loading, loadAll, archiveCompany, unarchiveCompany } = useStore();
  const navigate = useNavigate();
  const { isAdmin, canEdit } = useRole();

  const activeCompanies = useMemo(() => companies.filter(c => c.status !== 'archived'), [companies]);
  const archivedCompanies = useMemo(() => companies.filter(c => c.status === 'archived'), [companies]);

  useEffect(() => {
    loadAll();
  }, []);

  const [filterCompany, setFilterCompany] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Filtered projects
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      if (filterCompany === 'all') {
        const comp = companies.find(c => c.id === p.companyId);
        if (comp?.status === 'archived') return false;
      }
      if (filterCompany !== 'all' && p.companyId !== filterCompany) return false;
      if (filterStatus !== 'all' && p.status !== filterStatus) return false;
      if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [projects, companies, filterCompany, filterStatus, searchQuery]);

  const hasActiveFilters = filterCompany !== 'all' || filterStatus !== 'all' || searchQuery !== '';

  const clearFilters = () => {
    setFilterCompany('all');
    setFilterStatus('all');
    setSearchQuery('');
  };

  // Stats based on filtered projects
  const totalContractValue = filteredProjects.reduce((s, p) => s + p.contractValue, 0);
  const filteredExpenses = expenses.filter((e) => filteredProjects.some((p) => p.id === e.projectId));
  const totalExpenses = filteredExpenses.reduce((s, e) => s + e.amount, 0);
  const filteredBudgetItems = budgetItems.filter((b) => filteredProjects.some((p) => p.id === b.projectId));
  const totalPlanned = filteredBudgetItems.reduce((s, b) => s + b.plannedAmount, 0);
  const filteredChangeOrders = changeOrders.filter((co) => filteredProjects.some((p) => p.id === co.projectId));
  const approvedChangeImpact = filteredChangeOrders.filter(co => co.status === 'approved').reduce((s, co) => s + co.amountImpact, 0);
  const effectiveTotalContract = totalContractValue + approvedChangeImpact;
  const plannedProfit = effectiveTotalContract - totalPlanned;
  const plannedProfitMargin = effectiveTotalContract > 0 ? (plannedProfit / effectiveTotalContract) * 100 : 0;

  const filteredRevenues = revenues.filter((r) => filteredProjects.some((p) => p.id === r.projectId));
  const collectedRevenue = filteredRevenues.filter(r => r.status === 'collected').reduce((s, r) => s + r.amount, 0);

  const companyData = companies
    .map((c) => {
      const compProjects = filteredProjects.filter((p) => p.companyId === c.id);
      const compExpenses = expenses.filter((e) => compProjects.some((p) => p.id === e.projectId));
      const total = compExpenses.reduce((s, e) => s + e.amount, 0);
      return { name: c.name, value: total };
    })
    .filter((d) => d.value > 0);

  const statusData = Object.entries(PROJECT_STATUS_LABELS)
    .map(([key, label]) => ({
      name: label,
      value: filteredProjects.filter((p) => p.status === key).length,
    }))
    .filter((d) => d.value > 0);

  const hasData = companies.length > 0;

  return (
    <AppLayout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="page-header flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        >
          <div>
            <h1 className="page-title">لوحة التحكم</h1>
            <p className="page-subtitle">نظرة شاملة على جميع المحافظ والمشاريع</p>
          </div>
          {isAdmin && (
            <Button onClick={() => navigate('/companies/new')} className="gap-2">
              <Plus className="w-4 h-4" />
              شركة جديدة
            </Button>
          )}
        </motion.div>

        {!hasData ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex flex-col items-center justify-center py-24"
          >
            <img src={basserhLogo} alt="بصيرة" className="w-24 h-24 rounded-2xl object-cover mb-6 shadow-lg" />
            <h2 className="text-xl font-bold mb-2">مرحباً بك في رؤية</h2>
            <p className="text-muted-foreground mb-2 text-center max-w-md">
              نظام إدارة المحافظ والمشاريع المالية
            </p>
            <p className="text-muted-foreground mb-8 text-center max-w-md text-sm">
              ابدأ بإضافة شركة، ثم أنشئ محافظ ومشاريع لتتبع الميزانيات والمصروفات والربحية
            </p>
            {isAdmin && (
              <Button onClick={() => navigate('/companies/new')} size="lg" className="gap-2">
                <Plus className="w-5 h-5" />
                إضافة أول شركة
              </Button>
            )}
          </motion.div>
        ) : (
          <>
            {/* Filters Bar */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="stat-card mb-6"
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="flex items-center gap-2 text-muted-foreground shrink-0">
                  <Filter className="w-4 h-4" />
                  <span className="text-xs font-semibold">تصفية</span>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 w-full">
                  <div className="relative flex-1 min-w-0">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="بحث بالاسم..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pr-9 h-9 text-sm"
                    />
                  </div>

                  <Select value={filterCompany} onValueChange={setFilterCompany}>
                    <SelectTrigger className="w-full sm:w-[180px] h-9 text-sm">
                      <SelectValue placeholder="جميع الشركات" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">جميع الشركات</SelectItem>
                      {companies.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-full sm:w-[150px] h-9 text-sm">
                      <SelectValue placeholder="جميع الحالات" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">جميع الحالات</SelectItem>
                      {Object.entries(PROJECT_STATUS_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <AnimatePresence>
                    {hasActiveFilters && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                      >
                        <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-xs shrink-0">
                          <X className="w-3.5 h-3.5" />
                          مسح
                        </Button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {hasActiveFilters && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-xs text-muted-foreground mt-2"
                >
                  عرض {filteredProjects.length} من {projects.length} مشروع
                </motion.p>
              )}
            </motion.div>

            {/* Stats */}
            <motion.div
              variants={stagger.container}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
            >
              <motion.div variants={stagger.item}>
                <StatCard
                  title="إجمالي قيمة العقود"
                  value={formatCurrency(effectiveTotalContract)}
                  icon={<DollarSign className="w-4 h-4" />}
                  subtitle={approvedChangeImpact !== 0 ? `الأصلية: ${formatCurrency(totalContractValue)}` : undefined}
                />
              </motion.div>
              <motion.div variants={stagger.item}>
                <StatCard
                  title="إجمالي المصروفات"
                  value={formatCurrency(totalExpenses)}
                  icon={<TrendingUp className="w-4 h-4" />}
                  trend="down"
                />
              </motion.div>
              <motion.div variants={stagger.item}>
                <StatCard
                  title="الربح المخطط"
                  value={formatCurrency(plannedProfit)}
                  icon={<TrendingUp className="w-4 h-4" />}
                  trend={plannedProfit >= 0 ? 'up' : 'down'}
                  subtitle={`هامش: ${plannedProfitMargin.toFixed(1)}%`}
                />
              </motion.div>
              <motion.div variants={stagger.item}>
                <StatCard
                  title="المشاريع"
                  value={filteredProjects.length.toString()}
                  icon={<Briefcase className="w-4 h-4" />}
                  subtitle={collectedRevenue > 0 ? `محصّل: ${formatCurrency(collectedRevenue)}` : `${companies.length} شركة · ${portfolios.length} محفظة`}
                />
              </motion.div>
            </motion.div>

            {/* Charts Row */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8"
            >
              {companyData.length > 0 && (
                <div className="stat-card">
                  <h3 className="text-sm font-semibold mb-4">المصروفات حسب الشركة</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={companyData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                      <Tooltip
                        formatter={(value: number) => formatCurrency(value)}
                        contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                      />
                      <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {statusData.length > 0 && (
                <div className="stat-card">
                  <h3 className="text-sm font-semibold mb-4">حالة المشاريع</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={statusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {statusData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </motion.div>

            {/* Portfolio Performance Section */}
            {(() => {
              const activePortfolios = portfolios.filter(p => {
                const comp = companies.find(c => c.id === p.companyId);
                return comp && comp.status !== 'archived';
              });
              if (activePortfolios.length === 0) return null;
              return (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.32 }}
                  className="mb-8"
                >
                  <h3 className="text-sm font-semibold mb-3">أداء المحافظ</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {activePortfolios.map(portfolio => {
                      const ps = getPortfolioSummary(portfolio, projects, budgetItems, expenses, revenues, changeOrders, milestones, risks);
                      return (
                        <div
                          key={portfolio.id}
                          className="stat-card cursor-pointer hover:border-primary/40 transition-colors"
                          onClick={() => navigate(`/portfolio/${portfolio.id}`)}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <FolderKanban className="w-4 h-4 text-primary" />
                              <span className="text-sm font-semibold">{portfolio.name}</span>
                            </div>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${HEALTH_STATUS_COLORS[ps.healthStatus]}`}>
                              {HEALTH_STATUS_LABELS[ps.healthStatus]}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="p-1.5 rounded bg-muted/30">
                              <p className="text-[10px] text-muted-foreground">المشاريع</p>
                              <p className="text-sm font-bold">{ps.projectCount}</p>
                            </div>
                            <div className="p-1.5 rounded bg-muted/30">
                              <p className="text-[10px] text-muted-foreground">العقود</p>
                              <p className="text-[10px] font-mono font-bold">{formatCurrency(ps.totalEffectiveValue)}</p>
                            </div>
                            <div className="p-1.5 rounded bg-muted/30">
                              <p className="text-[10px] text-muted-foreground">الإنجاز</p>
                              <p className="text-sm font-bold">{ps.weightedPercentComplete.toFixed(0)}%</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })()}

            {/* Projects Needing Attention */}
            {(() => {
              const attentionProjects = filteredProjects.filter(p => {
                const pExp = expenses.filter(e => e.projectId === p.id);
                const pBud = budgetItems.filter(b => b.projectId === p.id);
                const pRev = revenues.filter(r => r.projectId === p.id);
                const pCO = changeOrders.filter(co => co.projectId === p.id);
                const s = getProjectSummary(p, pBud, pExp, pRev, pCO);
                return s.spendRate > 90 || p.status === 'on-hold' || p.status === 'cancelled';
              });
              if (attentionProjects.length === 0) return null;
              return (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.33 }}
                  className="stat-card mb-8 border-amber-300 dark:border-amber-700"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <h3 className="text-sm font-semibold">مشاريع تحتاج انتباه ({attentionProjects.length})</h3>
                  </div>
                  <div className="space-y-2">
                    {attentionProjects.slice(0, 5).map(p => {
                      const s = getProjectSummary(p, budgetItems.filter(b => b.projectId === p.id), expenses.filter(e => e.projectId === p.id), revenues.filter(r => r.projectId === p.id), changeOrders.filter(co => co.projectId === p.id));
                      return (
                        <div key={p.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate(`/project/${p.id}`)}>
                          <div>
                            <span className="text-sm font-medium">{p.name}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full mr-2 ${PROJECT_STATUS_COLORS[p.status]}`}>{PROJECT_STATUS_LABELS[p.status]}</span>
                          </div>
                          <span className="text-xs font-mono text-destructive">{s.spendRate.toFixed(0)}% صرف</span>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })()}

            {/* Top Risks */}
            {(() => {
              const openRisks = risks.filter(r => r.status === 'open' || r.status === 'mitigating').sort((a, b) => b.financialImpact - a.financialImpact).slice(0, 5);
              if (openRisks.length === 0) return null;
              return (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.34 }}
                  className="stat-card mb-8"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <ShieldAlert className="w-4 h-4 text-destructive" />
                    <h3 className="text-sm font-semibold">أعلى المخاطر المفتوحة</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>العنوان</th>
                          <th>المشروع</th>
                          <th>الاحتمال</th>
                          <th>الأثر المالي</th>
                        </tr>
                      </thead>
                      <tbody>
                        {openRisks.map(risk => {
                          const project = risk.projectId ? projects.find(p => p.id === risk.projectId) : null;
                          const portfolio = risk.portfolioId ? portfolios.find(p => p.id === risk.portfolioId) : null;
                          return (
                            <tr key={risk.id}>
                              <td className="font-medium text-sm">{risk.title}</td>
                              <td className="text-xs text-muted-foreground">{project?.name || portfolio?.name || '-'}</td>
                              <td>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${RISK_PROBABILITY_COLORS[risk.probability]}`}>
                                  {RISK_PROBABILITY_LABELS[risk.probability]}
                                </span>
                              </td>
                              <td className="font-mono text-sm text-destructive">{formatCurrency(risk.financialImpact)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              );
            })()}

            {filteredProjects.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.35 }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8"
              >
                {filteredProjects.slice(0, 6).map((project) => {
                  const pExpenses = expenses.filter((e) => e.projectId === project.id);
                  const pRevenues = revenues.filter((r) => r.projectId === project.id);
                  const pBudget = budgetItems.filter((b) => b.projectId === project.id);
                  const pCO = changeOrders.filter((co) => co.projectId === project.id);
                  const summary = getProjectSummary(project, pBudget, pExpenses, pRevenues, pCO);
                  const company = companies.find((c) => c.id === project.companyId);
                  const spendRate = summary.contractSpendRate;
                  const budgetUtilization = summary.effectiveContractValue > 0 ? (summary.totalPlanned / summary.effectiveContractValue) * 100 : 0;

                  return (
                    <div
                      key={project.id}
                      className="stat-card cursor-pointer hover:border-primary/40 transition-colors"
                      onClick={() => navigate(`/project/${project.id}`)}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h4 className="text-sm font-semibold">{project.name}</h4>
                          <p className="text-xs text-muted-foreground">{company?.name}</p>
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${PROJECT_STATUS_COLORS[project.status]}`}>
                          {PROJECT_STATUS_LABELS[project.status]}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="text-center p-2 rounded-lg bg-muted/30">
                          <p className="text-[10px] text-muted-foreground">قيمة العقد</p>
                          <p className="text-xs font-mono font-bold">{formatCurrency(summary.effectiveContractValue)}</p>
                        </div>
                        <div className="text-center p-2 rounded-lg bg-muted/30">
                          <p className="text-[10px] text-muted-foreground">المصروفات</p>
                          <p className="text-xs font-mono font-bold">{formatCurrency(summary.totalActual)}</p>
                        </div>
                        <div className="text-center p-2 rounded-lg bg-muted/30">
                          <p className="text-[10px] text-muted-foreground">الربح المخطط</p>
                          <p className={`text-xs font-mono font-bold ${summary.plannedProfit >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                            {formatCurrency(summary.plannedProfit)}
                          </p>
                        </div>
                        <div className="text-center p-2 rounded-lg bg-muted/30">
                          <p className="text-[10px] text-muted-foreground">متبقي الموازنة</p>
                          <p className={`text-xs font-mono font-bold ${summary.budgetRemaining >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                            {formatCurrency(summary.budgetRemaining)}
                          </p>
                        </div>
                      </div>

                      {/* Spend Rate Bar */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                          <span>نسبة الصرف من العقد</span>
                          <span>{spendRate.toFixed(1)}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.min(spendRate, 100)}%`,
                              backgroundColor: spendRate > 100 ? 'hsl(var(--destructive))' : 'hsl(var(--primary))',
                            }}
                          />
                        </div>
                        {budgetUtilization > 0 && (
                          <>
                            <div className="flex justify-between text-[10px] text-muted-foreground">
                              <span>تخصيص الموازنة</span>
                              <span>{budgetUtilization.toFixed(1)}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all bg-primary/60"
                                style={{ width: `${Math.min(budgetUtilization, 100)}%` }}
                              />
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </motion.div>
            )}

            {/* Projects List */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="stat-card"
            >
              <h3 className="text-sm font-semibold mb-4">
                {hasActiveFilters ? `المشاريع المصفاة (${filteredProjects.length})` : 'جميع المشاريع'}
              </h3>
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>المشروع</th>
                      <th className="hidden sm:table-cell">الشركة</th>
                      <th>قيمة العقد</th>
                      <th className="hidden md:table-cell">المصروفات</th>
                      <th className="hidden md:table-cell">نسبة الصرف</th>
                      <th>الربح المخطط</th>
                      <th className="hidden sm:table-cell">الحالة</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence mode="popLayout">
                      {filteredProjects.map((project, idx) => {
                        const pExpenses = expenses.filter((e) => e.projectId === project.id);
                        const pRevenues = revenues.filter((r) => r.projectId === project.id);
                        const pBudget = budgetItems.filter((b) => b.projectId === project.id);
                        const pCO = changeOrders.filter((co) => co.projectId === project.id);
                        const summary = getProjectSummary(project, pBudget, pExpenses, pRevenues, pCO);
                        const company = companies.find((c) => c.id === project.companyId);
                        const spendRate = summary.contractSpendRate;

                        return (
                          <motion.tr
                            key={project.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            transition={{ duration: 0.25, delay: idx * 0.03 }}
                            className="cursor-pointer"
                            onClick={() => navigate(`/project/${project.id}`)}
                          >
                            <td className="font-medium">{project.name}</td>
                            <td className="text-muted-foreground hidden sm:table-cell">{company?.name}</td>
                            <td className="font-mono text-sm">{formatCurrency(summary.effectiveContractValue)}</td>
                            <td className="font-mono text-sm hidden md:table-cell">{formatCurrency(summary.totalActual)}</td>
                            <td className="hidden md:table-cell">
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all"
                                    style={{
                                      width: `${Math.min(spendRate, 100)}%`,
                                      backgroundColor: spendRate > 90 ? 'hsl(var(--destructive))' : 'hsl(var(--primary))',
                                    }}
                                  />
                                </div>
                                <span className="text-xs text-muted-foreground">{spendRate.toFixed(0)}%</span>
                              </div>
                            </td>
                            <td>
                              <span className={summary.plannedProfit >= 0 ? 'badge-profit' : 'badge-loss'}>
                                {formatCurrency(summary.plannedProfit)}
                              </span>
                            </td>
                            <td className="hidden sm:table-cell">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${PROJECT_STATUS_COLORS[project.status]}`}>
                                {PROJECT_STATUS_LABELS[project.status]}
                              </span>
                            </td>
                            <td>
                              <ArrowLeft className="w-4 h-4 text-muted-foreground" />
                            </td>
                          </motion.tr>
                        );
                      })}
                    </AnimatePresence>
                  </tbody>
                </table>

                {filteredProjects.length === 0 && hasActiveFilters && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center py-12 text-muted-foreground"
                  >
                    <Search className="w-8 h-8 mb-3 opacity-40" />
                    <p className="text-sm">لا توجد مشاريع تطابق التصفية</p>
                    <Button variant="ghost" size="sm" onClick={clearFilters} className="mt-2 text-xs">
                      مسح الفلاتر
                    </Button>
                  </motion.div>
                )}
              </div>
            </motion.div>

            {/* Company Management - Admin only */}
            {isAdmin && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.5 }}
                className="stat-card mt-6"
              >
                <h3 className="text-sm font-semibold mb-4">إدارة الشركات</h3>
                <div className="space-y-2">
                  {activeCompanies.map((company) => (
                    <div key={company.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-primary" />
                        <span className="text-sm font-medium">{company.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">نشطة</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-xs text-muted-foreground hover:text-destructive"
                        onClick={async () => {
                          try {
                            await archiveCompany(company.id);
                            toast.success(`تم أرشفة "${company.name}"`);
                          } catch (e: any) {
                            toast.error(`فشل أرشفة الشركة: ${e.message}`);
                          }
                        }}
                      >
                        <Archive className="w-3.5 h-3.5" />
                        أرشفة
                      </Button>
                    </div>
                  ))}
                  {archivedCompanies.length > 0 && (
                    <>
                      <div className="text-xs text-muted-foreground pt-3 pb-1 font-semibold">الشركات المؤرشفة</div>
                      {archivedCompanies.map((company) => (
                        <div key={company.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/40 opacity-70">
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm">{company.name}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">مؤرشفة</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1 text-xs text-muted-foreground hover:text-primary"
                            onClick={async () => {
                              try {
                                await unarchiveCompany(company.id);
                                toast.success(`تم إعادة تفعيل "${company.name}"`);
                              } catch (e: any) {
                                toast.error(`فشل إعادة التفعيل: ${e.message}`);
                              }
                            }}
                          >
                            <ArchiveRestore className="w-3.5 h-3.5" />
                            إعادة تفعيل
                          </Button>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </>
        )}
      </motion.div>
    </AppLayout>
  );
}
