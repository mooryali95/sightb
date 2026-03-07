import { useStore } from '@/store/useStore';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { StatCard } from '@/components/StatCard';
import { formatCurrency, getProjectSummary } from '@/lib/finance';
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS, type ProjectStatus } from '@/types/project';
import {
  Building2, FolderKanban, Briefcase, TrendingUp, Plus,
  ArrowLeft, DollarSign, Filter, Search, X, Archive, ArchiveRestore,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
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
  const { companies, portfolios, projects, budgetItems, expenses, revenues, loading, loadAll, archiveCompany, unarchiveCompany } = useStore();
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
      // Hide projects from archived companies unless filtering by that company
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
  const filteredRevenues = revenues.filter((r) => filteredProjects.some((p) => p.id === r.projectId));
  const totalRevenue = filteredRevenues.reduce((s, r) => s + r.amount, 0) || totalContractValue;
  const totalProfit = totalRevenue - totalExpenses;
  const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

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
          /* Empty State */
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
                  {/* Search */}
                  <div className="relative flex-1 min-w-0">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="بحث بالاسم..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pr-9 h-9 text-sm"
                    />
                  </div>

                  {/* Company Filter */}
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

                  {/* Status Filter */}
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

                  {/* Clear Filters */}
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
                  value={formatCurrency(totalContractValue)}
                  icon={<DollarSign className="w-4 h-4" />}
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
                  title="صافي الربح"
                  value={formatCurrency(totalProfit)}
                  icon={<TrendingUp className="w-4 h-4" />}
                  trend={totalProfit >= 0 ? 'up' : 'down'}
                  subtitle={`هامش الربح: ${profitMargin.toFixed(1)}%`}
                />
              </motion.div>
              <motion.div variants={stagger.item}>
                <StatCard
                  title="المشاريع"
                  value={filteredProjects.length.toString()}
                  icon={<Briefcase className="w-4 h-4" />}
                  subtitle={`${companies.length} شركة · ${portfolios.length} محفظة`}
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

            {/* Per-Project Financial KPI Cards */}
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
                  const summary = getProjectSummary(project, pBudget, pExpenses, pRevenues);
                  const company = companies.find((c) => c.id === project.companyId);
                  const spendRate = project.contractValue > 0 ? (summary.totalActual / project.contractValue) * 100 : 0;
                  const budgetUtilization = project.contractValue > 0 ? (summary.totalPlanned / project.contractValue) * 100 : 0;

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
                          <p className="text-xs font-mono font-bold">{formatCurrency(project.contractValue)}</p>
                        </div>
                        <div className="text-center p-2 rounded-lg bg-muted/30">
                          <p className="text-[10px] text-muted-foreground">المصروفات</p>
                          <p className="text-xs font-mono font-bold">{formatCurrency(summary.totalActual)}</p>
                        </div>
                        <div className="text-center p-2 rounded-lg bg-muted/30">
                          <p className="text-[10px] text-muted-foreground">الإيرادات</p>
                          <p className="text-xs font-mono font-bold">{formatCurrency(summary.totalRevenue)}</p>
                        </div>
                        <div className="text-center p-2 rounded-lg bg-muted/30">
                          <p className="text-[10px] text-muted-foreground">صافي الربح</p>
                          <p className={`text-xs font-mono font-bold ${summary.netProfit >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                            {formatCurrency(summary.netProfit)}
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
                      <th>الربح</th>
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
                        const summary = getProjectSummary(project, pBudget, pExpenses, pRevenues);
                        const company = companies.find((c) => c.id === project.companyId);
                        const spendRate = project.contractValue > 0 ? (summary.totalActual / project.contractValue) * 100 : 0;

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
                            <td className="font-mono text-sm">{formatCurrency(project.contractValue)}</td>
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
                              <span className={summary.netProfit >= 0 ? 'badge-profit' : 'badge-loss'}>
                                {formatCurrency(summary.netProfit)}
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
          </>
        )}
      </motion.div>
    </AppLayout>
  );
}
