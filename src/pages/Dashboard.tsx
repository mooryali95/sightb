import { useStore } from '@/store/useStore';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { StatCard } from '@/components/StatCard';
import { formatCurrency, getProjectSummary } from '@/lib/finance';
import {
  Building2, FolderKanban, Briefcase, TrendingUp, Plus,
  ArrowLeft, DollarSign,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import basserhLogo from '@/assets/basserh-logo.jpg';

const COLORS = ['hsl(40, 55%, 55%)', 'hsl(160, 60%, 42%)', 'hsl(38, 92%, 50%)', 'hsl(0, 72%, 51%)', 'hsl(280, 60%, 50%)'];

export default function Dashboard() {
  const { companies, portfolios, projects, budgetItems, expenses, revenues } = useStore();
  const navigate = useNavigate();

  const totalContractValue = projects.reduce((s, p) => s + p.contractValue, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const totalRevenue = revenues.reduce((s, r) => s + r.amount, 0) || totalContractValue;
  const totalProfit = totalRevenue - totalExpenses;
  const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  const companyData = companies.map((c) => {
    const compProjects = projects.filter((p) => p.companyId === c.id);
    const compExpenses = expenses.filter((e) => compProjects.some((p) => p.id === e.projectId));
    const total = compExpenses.reduce((s, e) => s + e.amount, 0);
    return { name: c.name, value: total };
  });

  const statusData = [
    { name: 'نشط', value: projects.filter((p) => p.status === 'active').length },
    { name: 'مكتمل', value: projects.filter((p) => p.status === 'completed').length },
    { name: 'معلق', value: projects.filter((p) => p.status === 'on-hold').length },
  ].filter((d) => d.value > 0);

  const hasData = companies.length > 0;

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        {/* Header */}
        <div className="page-header flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="page-title">لوحة التحكم</h1>
            <p className="page-subtitle">نظرة شاملة على جميع المحافظ والمشاريع</p>
          </div>
          <Button onClick={() => navigate('/companies/new')} className="gap-2">
            <Plus className="w-4 h-4" />
            شركة جديدة
          </Button>
        </div>

        {!hasData ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-24">
            <img src={basserhLogo} alt="بصيرة" className="w-24 h-24 rounded-2xl object-cover mb-6 shadow-lg" />
            <h2 className="text-xl font-bold mb-2">مرحباً بك في بصيرة</h2>
            <p className="text-muted-foreground mb-2 text-center max-w-md">
              نظام إدارة المحافظ والمشاريع المالية
            </p>
            <p className="text-muted-foreground mb-8 text-center max-w-md text-sm">
              ابدأ بإضافة شركة، ثم أنشئ محافظ ومشاريع لتتبع الميزانيات والمصروفات والربحية
            </p>
            <Button onClick={() => navigate('/companies/new')} size="lg" className="gap-2">
              <Plus className="w-5 h-5" />
              إضافة أول شركة
            </Button>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <StatCard
                title="إجمالي قيمة العقود"
                value={formatCurrency(totalContractValue)}
                icon={<DollarSign className="w-4 h-4" />}
              />
              <StatCard
                title="إجمالي المصروفات"
                value={formatCurrency(totalExpenses)}
                icon={<TrendingUp className="w-4 h-4" />}
                trend="down"
              />
              <StatCard
                title="صافي الربح"
                value={formatCurrency(totalProfit)}
                icon={<TrendingUp className="w-4 h-4" />}
                trend={totalProfit >= 0 ? 'up' : 'down'}
                subtitle={`هامش الربح: ${profitMargin.toFixed(1)}%`}
              />
              <StatCard
                title="المشاريع"
                value={projects.length.toString()}
                icon={<Briefcase className="w-4 h-4" />}
                subtitle={`${companies.length} شركة · ${portfolios.length} محفظة`}
              />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
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
            </div>

            {/* Projects List */}
            <div className="stat-card">
              <h3 className="text-sm font-semibold mb-4">أحدث المشاريع</h3>
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>المشروع</th>
                      <th className="hidden sm:table-cell">الشركة</th>
                      <th>قيمة العقد</th>
                      <th className="hidden md:table-cell">المصروفات</th>
                      <th>الربح</th>
                      <th className="hidden sm:table-cell">الحالة</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.slice(0, 10).map((project) => {
                      const pExpenses = expenses.filter((e) => e.projectId === project.id);
                      const pRevenues = revenues.filter((r) => r.projectId === project.id);
                      const pBudget = budgetItems.filter((b) => b.projectId === project.id);
                      const summary = getProjectSummary(project, pBudget, pExpenses, pRevenues);
                      const company = companies.find((c) => c.id === project.companyId);

                      return (
                        <tr key={project.id} className="cursor-pointer" onClick={() => navigate(`/project/${project.id}`)}>
                          <td className="font-medium">{project.name}</td>
                          <td className="text-muted-foreground hidden sm:table-cell">{company?.name}</td>
                          <td className="font-mono text-sm">{formatCurrency(project.contractValue)}</td>
                          <td className="font-mono text-sm hidden md:table-cell">{formatCurrency(summary.totalActual)}</td>
                          <td>
                            <span className={summary.netProfit >= 0 ? 'badge-profit' : 'badge-loss'}>
                              {formatCurrency(summary.netProfit)}
                            </span>
                          </td>
                          <td className="hidden sm:table-cell">
                            <span className={
                              project.status === 'active' ? 'badge-gold' :
                              project.status === 'completed' ? 'badge-profit' : 'badge-warning'
                            }>
                              {project.status === 'active' ? 'نشط' :
                               project.status === 'completed' ? 'مكتمل' :
                               project.status === 'on-hold' ? 'معلق' : 'ملغي'}
                            </span>
                          </td>
                          <td>
                            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </motion.div>
    </AppLayout>
  );
}
