import { useMemo, useState } from 'react';
import { useDialogSession } from '@/hooks/useDialogSession';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { useCoreData, useCompanyData } from '@/hooks/useAppData';
import { useRole } from '@/hooks/useRole';
import { AppLayout } from '@/components/AppLayout';
import { StatCard } from '@/components/StatCard';
import { formatCurrency, getCountedExpenses, getEffectiveContractValue } from '@/lib/finance';
import { getCompanySummary } from '@/lib/portfolio';
import { exportCompanyToExcel, exportCompanyToPDF } from '@/lib/export-lazy';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import {
  Building2, DollarSign, TrendingUp, AlertTriangle,
  FileSpreadsheet, Pencil, Trash2, Archive, Eye, EyeOff, Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { PageHeader } from '@/components/ui/page-header';
import { EditCompanyDialog } from './company/EditCompanyDialog';
import { IndirectCostsCard } from './company/IndirectCostsCard';
import { PortfolioCards } from './company/PortfolioCards';
import { StandaloneProjectCards } from './company/StandaloneProjectCards';
import { buildCompanyExport } from './company/buildCompanyExport';
import { CompanyLedgerSection } from './company/ledger/CompanyLedgerSection';

/** See the note in Dashboard.tsx — module scope keeps the `useMemo`s memoized. */
const INACTIVE_STATUSES = ['completed', 'archived', 'cancelled'];
const CHART_COLORS = ['hsl(var(--primary))', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#6366f1'];

export default function CompanyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, canEdit } = useRole();
  const {
    companies, portfolios, projects, budgetItems, expenses, revenues,
    changeOrders, milestones, risks, indirectCosts,
    loading, deleteCompany, archiveCompany,
  } = useStore();

  const detailsLoaded = useStore((s) => s.detailsLoaded);

  useCoreData();
  useCompanyData(detailsLoaded ? undefined : id);

  const company = companies.find(c => c.id === id);

  const summary = useMemo(() => {
    if (!company) return null;
    return getCompanySummary(
      company, portfolios, projects, budgetItems, expenses, revenues,
      changeOrders, milestones, risks, indirectCosts,
    );
  }, [company, portfolios, projects, budgetItems, expenses, revenues, changeOrders, milestones, risks, indirectCosts]);

  const companyProjects = useMemo(() => projects.filter(p => p.companyId === id), [projects, id]);
  const standaloneProjects = useMemo(() => companyProjects.filter(p => !p.portfolioId), [companyProjects]);
  // Active projects a company expense can be charged to, weighted by their effective contract for the suggested split.
  const ledgerProjects = useMemo(() => companyProjects
    .filter((p) => !INACTIVE_STATUSES.includes(p.status))
    .map((p) => ({ id: p.id, name: p.name, weight: getEffectiveContractValue(p.contractValue, changeOrders.filter((o) => o.projectId === p.id)) })),
  [companyProjects, changeOrders]);
  const compPortfolios = useMemo(() => portfolios.filter(p => p.companyId === id), [portfolios, id]);
  const compIndirectCosts = useMemo(() => indirectCosts.filter(ic => ic.companyId === id), [indirectCosts, id]);
  // The stat card above counts spend through the summary library, which
  // leaves out rejected expenses and advances still outstanding. The chart
  // and the project cards must count the same rows or the page disagrees
  // with itself.
  const countedExpenses = useMemo(() => getCountedExpenses(expenses), [expenses]);

  const expensesByPortfolio = useMemo(() => {
    const data: { name: string; value: number }[] = [];
    compPortfolios.forEach(p => {
      const portfolioProjectIds = companyProjects.filter(pr => pr.portfolioId === p.id).map(pr => pr.id);
      const total = countedExpenses.filter(e => portfolioProjectIds.includes(e.projectId)).reduce((s, e) => s + e.amount, 0);
      if (total > 0) data.push({ name: p.name, value: total });
    });
    const standaloneTotal = countedExpenses.filter(e => standaloneProjects.some(sp => sp.id === e.projectId)).reduce((s, e) => s + e.amount, 0);
    if (standaloneTotal > 0) data.push({ name: 'مشاريع مستقلة', value: standaloneTotal });
    return data;
  }, [compPortfolios, companyProjects, standaloneProjects, countedExpenses]);

  const [showInactive, setShowInactive] = useState(false);

  const visibleCompanyProjects = useMemo(() => {
    if (showInactive) return companyProjects;
    return companyProjects.filter(p => !INACTIVE_STATUSES.includes(p.status));
  }, [companyProjects, showInactive]);
  const visibleStandaloneProjects = useMemo(() => {
    if (showInactive) return standaloneProjects;
    return standaloneProjects.filter(p => !INACTIVE_STATUSES.includes(p.status));
  }, [standaloneProjects, showInactive]);

  const inactiveCount = companyProjects.filter(p => INACTIVE_STATUSES.includes(p.status)).length;

  // Remounted on open so the form starts from the company; see useDialogSession.
  const edit = useDialogSession<true>();

  if (loading || !company) {
    return (
      <AppLayout>
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <div className="text-center py-20">
            <p className="text-muted-foreground">الشركة غير موجودة</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate('/')}>العودة</Button>
          </div>
        )}
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <PageHeader
          eyebrow={
            <button onClick={() => navigate('/')} className="hover:text-foreground transition-colors">لوحة التحكم</button>
          }
          title={
            <span className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5 text-primary" />
              </span>
              <span>{company.name}</span>
            </span>
          }
          subtitle={
            <>
              {company.description && <span className="block">{company.description}</span>}
              <span className="text-xs">
                {compPortfolios.length} محفظة · {visibleCompanyProjects.length} مشروع
                {inactiveCount > 0 && !showInactive && (
                  <span className="text-muted-foreground/60"> ({inactiveCount} منتهي)</span>
                )}
              </span>
            </>
          }
          meta={
            <Badge variant={company.status === 'active' ? 'default' : 'secondary'} className="text-xs">
              {company.status === 'active' ? 'نشطة' : 'مؤرشفة'}
            </Badge>
          }
          actions={
            <>
              <Button variant="outline" size="sm" className="gap-1" onClick={() => navigate('/organize')}>
                <Layers className="w-4 h-4" />هيكلة المشاريع
              </Button>
              {inactiveCount > 0 && (
                <Button
                  variant={showInactive ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setShowInactive(!showInactive)}
                  className="gap-1.5 text-xs"
                >
                  {showInactive ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {showInactive ? 'إخفاء المنتهية' : 'عرض المنتهية'}
                </Button>
              )}
              {(isAdmin || canEdit('company', id!)) && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => edit.open(true)}>
                  <Pencil className="w-3.5 h-3.5" />تعديل
                </Button>
              )}
              {summary && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
                  exportCompanyToExcel(buildCompanyExport(company.name, summary, compIndirectCosts));
                  toast.success('تم تصدير تقرير الشركة');
                }}>
                  <FileSpreadsheet className="w-3.5 h-3.5" />Excel
                </Button>
              )}
              {summary && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
                  exportCompanyToPDF(buildCompanyExport(company.name, summary, compIndirectCosts));
                  toast.success('تم تصدير تقرير PDF');
                }}>
                  <FileSpreadsheet className="w-3.5 h-3.5" />PDF
                </Button>
              )}
              {isAdmin && (
                <>
                  {company.status === 'active' && (
                    <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground" onClick={async () => {
                      try { await archiveCompany(id!); toast.success('تم الأرشفة'); } catch { toast.error('فشل'); }
                    }}>
                      <Archive className="w-3.5 h-3.5" />أرشفة
                    </Button>
                  )}
                  <ConfirmDeleteDialog
                    title="حذف الشركة"
                    description={`هل أنت متأكد من حذف "${company.name}"؟ سيتم حذف جميع البيانات المرتبطة.`}
                    onConfirm={async () => {
                      try { await deleteCompany(id!); toast.success('تم الحذف'); navigate('/'); } catch { toast.error('فشل الحذف'); }
                    }}
                    trigger={
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    }
                  />
                </>
              )}
            </>
          }
        />

        <EditCompanyDialog key={edit.session} company={company} open={edit.value !== null} onOpenChange={(v) => { if (!v) edit.close(); }} />

        {/* Stats */}
        {summary && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard title="قيمة العقود الفعّالة" value={formatCurrency(summary.totalContractValue)} icon={<DollarSign className="w-4 h-4" />} tooltip="العقود الأصلية + أوامر التغيير المعتمدة لكل مشاريع الشركة." />
            <StatCard title="المصروف الفعلي" value={formatCurrency(summary.totalActual)} icon={<TrendingUp className="w-4 h-4" />} trend="down" tooltip="المصروفات المقبولة، بعد استبعاد المرفوض والسلف القائمة." />
            <StatCard
              title="صافي الربح بعد غير المباشرة"
              value={formatCurrency(summary.netProfitAfterIndirect)}
              icon={<TrendingUp className="w-4 h-4" />}
              trend={summary.netProfitAfterIndirect >= 0 ? 'up' : 'down'}
              subtitle={`هامش: ${summary.netProfitMargin.toFixed(1)}%`}
              tooltip="الربح المخطط لكل المشاريع − التكاليف غير المباشرة للشركة. لا يساوي الربح النقدي المحقق."
            />
            <StatCard title="مشاريع متعثرة" value={String(summary.totalAtRiskProjects)} icon={<AlertTriangle className="w-4 h-4" />} trend={summary.totalAtRiskProjects > 0 ? 'down' : 'up'} tooltip="مشاريع معلقة أو ملغاة أو تجاوز صرفها الموازنة المعتمدة." />
          </div>
        )}

        {/* Expense Distribution Pie Chart */}
        {expensesByPortfolio.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4 mb-6">
            <h3 className="text-sm font-semibold mb-4">توزيع المصروفات حسب المحافظ</h3>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expensesByPortfolio}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={{ strokeWidth: 1 }}
                  >
                    {expensesByPortfolio.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }}
                  />
                  <Legend
                    formatter={(value) => <span className="text-xs">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <PortfolioCards summaries={summary?.portfolioSummaries ?? []} projects={visibleCompanyProjects} countedExpenses={countedExpenses} changeOrders={changeOrders} />

        <CompanyLedgerSection companyId={id!} projects={ledgerProjects} canEdit={isAdmin || canEdit('company', id!)} />

        <IndirectCostsCard companyId={id!} costs={compIndirectCosts} canEdit={isAdmin || canEdit('company', id!)} />

        <StandaloneProjectCards projects={visibleStandaloneProjects} countedExpenses={countedExpenses} changeOrders={changeOrders} />
      </motion.div>
    </AppLayout>
  );
}
