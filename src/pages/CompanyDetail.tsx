import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { useRole } from '@/hooks/useRole';
import { AppLayout } from '@/components/AppLayout';
import { StatCard } from '@/components/StatCard';
import { formatCurrency } from '@/lib/finance';
import { getCompanySummary } from '@/lib/portfolio';
import { exportCompanyToExcel } from '@/lib/export';
import {
  HEALTH_STATUS_LABELS, HEALTH_STATUS_COLORS,
  INDIRECT_COST_CATEGORY_LABELS, type IndirectCostCategory,
  PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS,
} from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import {
  Building2, DollarSign, TrendingUp, AlertTriangle, Plus,
  FolderKanban, ArrowLeft, Briefcase, FileSpreadsheet, Pencil, Trash2,
  Archive, ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';

export default function CompanyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, canEdit } = useRole();
  const {
    companies, portfolios, projects, budgetItems, expenses, revenues,
    changeOrders, milestones, risks, indirectCosts,
    loading, loadAll, addIndirectCost, deleteIndirectCost,
    updateCompany, deleteCompany, archiveCompany,
  } = useStore();

  useEffect(() => { loadAll(); }, []);

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
  const compPortfolios = useMemo(() => portfolios.filter(p => p.companyId === id), [portfolios, id]);
  const compIndirectCosts = useMemo(() => indirectCosts.filter(ic => ic.companyId === id), [indirectCosts, id]);
  const totalIndirect = compIndirectCosts.reduce((s, ic) => s + ic.amount, 0);

  // Add indirect cost form
  const [icOpen, setIcOpen] = useState(false);
  const [icCategory, setIcCategory] = useState<IndirectCostCategory>('other');
  const [icDescription, setIcDescription] = useState('');
  const [icAmount, setIcAmount] = useState('');
  const [icMonth, setIcMonth] = useState('1');
  const [icDate, setIcDate] = useState(new Date().toISOString().split('T')[0]);

  const [expandedPortfolios, setExpandedPortfolios] = useState<Record<string, boolean>>({});

  const togglePortfolio = (portfolioId: string) => {
    setExpandedPortfolios(prev => ({ ...prev, [portfolioId]: !prev[portfolioId] }));
  };

  // Edit company form
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const openEdit = () => {
    if (company) {
      setEditName(company.name);
      setEditDescription(company.description || '');
      setEditOpen(true);
    }
  };

  const handleSaveEdit = async () => {
    if (!editName.trim()) { toast.error('اسم الشركة مطلوب'); return; }
    try {
      await updateCompany(id!, { name: editName, description: editDescription || undefined });
      toast.success('تم تحديث بيانات الشركة');
      setEditOpen(false);
    } catch { toast.error('فشل التحديث'); }
  };

  const handleAddIndirectCost = async () => {
    if (!icDescription.trim()) { toast.error('الوصف مطلوب'); return; }
    try {
      await addIndirectCost({
        companyId: id!,
        category: icCategory,
        description: icDescription,
        amount: parseFloat(icAmount) || 0,
        month: parseInt(icMonth) || 1,
        date: icDate,
        allocationMethod: 'equal',
      });
      toast.success('تم إضافة التكلفة');
      setIcDescription(''); setIcAmount(''); setIcOpen(false);
    } catch { toast.error('حدث خطأ'); }
  };

  if (!company) {
    return (
      <AppLayout>
        <div className="text-center py-20">
          <p className="text-muted-foreground">الشركة غير موجودة</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/')}>العودة</Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        {/* Header with Blue Theme */}
        <div className="relative mb-6 rounded-xl overflow-hidden border border-border bg-gradient-to-l from-blue-500/10 via-primary/5 to-transparent">
          <div className="p-6">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
              <button onClick={() => navigate('/')} className="hover:text-primary transition-colors">لوحة التحكم</button>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-xl font-bold">{company.name}</h1>
                    <Badge variant={company.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">
                      {company.status === 'active' ? 'نشطة' : 'مؤرشفة'}
                    </Badge>
                  </div>
                  {company.description && (
                    <p className="text-sm text-muted-foreground mt-0.5">{company.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {compPortfolios.length} محفظة · {companyProjects.length} مشروع
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(isAdmin || canEdit('company', id!)) && (
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={openEdit}>
                    <Pencil className="w-3.5 h-3.5" />تعديل
                  </Button>
                )}
                {summary && (
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
                    exportCompanyToExcel({
                      companyName: company.name,
                      summary,
                      portfolioSummaries: (summary.portfolioSummaries || []).map(ps => ({
                        name: ps.portfolioName,
                        projects: ps.projectCount,
                        contractValue: ps.totalEffectiveValue,
                        actual: ps.totalActual,
                        profit: ps.aggregatePlannedProfit,
                        completion: ps.weightedPercentComplete,
                        health: HEALTH_STATUS_LABELS[ps.healthStatus],
                      })),
                      indirectCosts: compIndirectCosts.map(ic => ({
                        category: INDIRECT_COST_CATEGORY_LABELS[ic.category],
                        description: ic.description,
                        amount: ic.amount,
                        month: ic.month,
                      })),
                    });
                    toast.success('تم تصدير تقرير الشركة');
                  }}>
                    <FileSpreadsheet className="w-3.5 h-3.5" />تصدير
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
              </div>
            </div>
          </div>
        </div>

        {/* Edit Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>تعديل بيانات الشركة</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>اسم الشركة *</Label>
                <Input value={editName} onChange={e => setEditName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>الوصف</Label>
                <Textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} rows={3} />
              </div>
              <Button onClick={handleSaveEdit} className="w-full">حفظ</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Stats */}
        {summary && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard title="إجمالي العقود" value={formatCurrency(summary.totalContractValue)} icon={<DollarSign className="w-4 h-4" />} />
            <StatCard title="إجمالي المصروفات" value={formatCurrency(summary.totalActual)} icon={<TrendingUp className="w-4 h-4" />} trend="down" />
            <StatCard
              title="صافي الربح بعد غير المباشرة"
              value={formatCurrency(summary.netProfitAfterIndirect)}
              icon={<TrendingUp className="w-4 h-4" />}
              trend={summary.netProfitAfterIndirect >= 0 ? 'up' : 'down'}
              subtitle={`هامش: ${summary.netProfitMargin.toFixed(1)}%`}
            />
            <StatCard title="مشاريع متعثرة" value={String(summary.totalAtRiskProjects)} icon={<AlertTriangle className="w-4 h-4" />} trend={summary.totalAtRiskProjects > 0 ? 'down' : 'up'} />
          </div>
        )}

        {/* Portfolios with nested projects */}
        {compPortfolios.length > 0 && (
          <div className="mb-6 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <FolderKanban className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold">المحافظ ({compPortfolios.length})</h3>
            </div>
            {summary?.portfolioSummaries.map(ps => {
              const portfolioProjects = companyProjects.filter(p => p.portfolioId === ps.portfolioId);
              return (
                <div key={ps.portfolioId} className="rounded-xl border border-border bg-card overflow-hidden">
                  {/* Portfolio header */}
                  <div className="p-4 border-b border-border/50">
                    <div className="flex items-center justify-between mb-3">
                      <div
                        className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity flex-1"
                        onClick={() => navigate(`/portfolio/${ps.portfolioId}`)}
                      >
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                          <FolderKanban className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold">{ps.portfolioName}</h4>
                          <p className="text-[11px] text-muted-foreground">{ps.projectCount} مشروع</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${HEALTH_STATUS_COLORS[ps.healthStatus]}`}>
                          {HEALTH_STATUS_LABELS[ps.healthStatus]}
                        </span>
                        {portfolioProjects.length > 0 && (
                          <button
                            onClick={() => togglePortfolio(ps.portfolioId)}
                            className="w-7 h-7 rounded-md hover:bg-muted flex items-center justify-center transition-colors"
                          >
                            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${expandedPortfolios[ps.portfolioId] ? 'rotate-180' : ''}`} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-3">
                      <div className="text-center p-2 rounded-lg bg-muted/40">
                        <p className="text-[10px] text-muted-foreground mb-0.5">العقود</p>
                        <p className="text-xs font-mono font-bold">{formatCurrency(ps.totalEffectiveValue)}</p>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-muted/40">
                        <p className="text-[10px] text-muted-foreground mb-0.5">المصروفات</p>
                        <p className="text-xs font-mono font-bold">{formatCurrency(ps.totalActual)}</p>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-muted/40">
                        <p className="text-[10px] text-muted-foreground mb-0.5">الإنجاز</p>
                        <p className="text-sm font-bold">{ps.weightedPercentComplete.toFixed(0)}%</p>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-muted/40">
                        <p className="text-[10px] text-muted-foreground mb-0.5">الربح</p>
                        <p className={`text-xs font-mono font-bold ${ps.aggregatePlannedProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
                          {formatCurrency(ps.aggregatePlannedProfit)}
                        </p>
                      </div>
                    </div>
                  </div>
                  {/* Collapsible nested projects */}
                  {portfolioProjects.length > 0 && expandedPortfolios[ps.portfolioId] && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="divide-y divide-border/40"
                    >
                      {portfolioProjects.map(project => {
                        const projExpenses = expenses.filter(e => e.projectId === project.id);
                        const totalSpent = projExpenses.reduce((s, e) => s + e.amount, 0);
                        const spentPercent = project.contractValue > 0 ? Math.min((totalSpent / project.contractValue) * 100, 100) : 0;
                        return (
                          <div
                            key={project.id}
                            className="px-4 py-3 hover:bg-muted/20 cursor-pointer transition-colors flex items-center gap-4"
                            onClick={() => navigate(`/project/${project.id}`)}
                          >
                            <div className="w-7 h-7 rounded-md bg-blue-500/10 flex items-center justify-center shrink-0">
                              <Briefcase className="w-3.5 h-3.5 text-blue-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-medium truncate">{project.name}</span>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full shrink-0 ${PROJECT_STATUS_COLORS[project.status]}`}>
                                  {PROJECT_STATUS_LABELS[project.status]}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                                <span>العقد: {formatCurrency(project.contractValue)}</span>
                                <span>·</span>
                                <span>المصروف: {formatCurrency(totalSpent)}</span>
                                <span>·</span>
                                <span>الإنجاز: {project.percentComplete}%</span>
                              </div>
                              <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${spentPercent > 90 ? 'bg-destructive' : spentPercent > 70 ? 'bg-amber-500' : 'bg-primary'}`}
                                  style={{ width: `${spentPercent}%` }}
                                />
                              </div>
                            </div>
                            <ArrowLeft className="w-4 h-4 text-muted-foreground shrink-0" />
                          </div>
                        );
                      })}
                    </motion.div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Indirect Costs */}
        <div className="stat-card mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">التكاليف غير المباشرة</h3>
            {(isAdmin || canEdit('company', id!)) && (
              <Dialog open={icOpen} onOpenChange={setIcOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-1"><Plus className="w-3.5 h-3.5" />إضافة</Button>
                </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>إضافة تكلفة غير مباشرة</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label>الفئة</Label>
                    <Select value={icCategory} onValueChange={v => setIcCategory(v as IndirectCostCategory)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(INDIRECT_COST_CATEGORY_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>الوصف *</Label>
                    <Input value={icDescription} onChange={e => setIcDescription(e.target.value)} placeholder="وصف التكلفة" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>المبلغ</Label>
                      <Input type="number" value={icAmount} onChange={e => setIcAmount(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>الشهر</Label>
                      <Input type="number" value={icMonth} onChange={e => setIcMonth(e.target.value)} min="1" max="12" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>التاريخ</Label>
                    <Input type="date" value={icDate} onChange={e => setIcDate(e.target.value)} />
                  </div>
                  <Button onClick={handleAddIndirectCost} className="w-full">إضافة</Button>
                </div>
              </DialogContent>
              </Dialog>
            )}
          </div>

          {compIndirectCosts.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>الفئة</th>
                      <th>الوصف</th>
                      <th>المبلغ</th>
                      <th>الشهر</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {compIndirectCosts.map(ic => (
                      <tr key={ic.id}>
                        <td className="text-xs">{INDIRECT_COST_CATEGORY_LABELS[ic.category]}</td>
                        <td className="font-medium">{ic.description}</td>
                        <td className="font-mono text-sm">{formatCurrency(ic.amount)}</td>
                        <td className="text-xs">شهر {ic.month}</td>
                        {(isAdmin || canEdit('company', id!)) && (
                          <td>
                            <ConfirmDeleteDialog onConfirm={async () => {
                              try { await deleteIndirectCost(ic.id); toast.success('تم الحذف'); } catch { toast.error('فشل الحذف'); }
                            }} title="حذف التكلفة" description={`هل أنت متأكد من حذف "${ic.description}"؟`} />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 p-3 rounded-lg bg-muted/30 flex items-center justify-between">
                <span className="text-sm font-semibold">إجمالي التكاليف غير المباشرة</span>
                <span className="font-mono font-bold text-destructive">{formatCurrency(totalIndirect)}</span>
              </div>
            </>
          ) : (
            <div className="text-center py-6 text-muted-foreground text-sm">لا توجد تكاليف غير مباشرة</div>
          )}
        </div>

        {/* Standalone projects */}
        {standaloneProjects.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Briefcase className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">مشاريع مستقلة ({standaloneProjects.length})</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {standaloneProjects.map(project => {
                const projExpenses = expenses.filter(e => e.projectId === project.id);
                const totalSpent = projExpenses.reduce((s, e) => s + e.amount, 0);
                const spentPercent = project.contractValue > 0 ? Math.min((totalSpent / project.contractValue) * 100, 100) : 0;
                return (
                  <div
                    key={project.id}
                    className="rounded-xl border border-border bg-card p-4 cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all"
                    onClick={() => navigate(`/project/${project.id}`)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                          <Briefcase className="w-4 h-4 text-blue-500" />
                        </div>
                        <span className="text-sm font-semibold truncate">{project.name}</span>
                      </div>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${PROJECT_STATUS_COLORS[project.status]}`}>
                        {PROJECT_STATUS_LABELS[project.status]}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center mb-3">
                      <div className="p-1.5 rounded bg-muted/40">
                        <p className="text-[10px] text-muted-foreground">العقد</p>
                        <p className="text-xs font-mono font-bold">{formatCurrency(project.contractValue)}</p>
                      </div>
                      <div className="p-1.5 rounded bg-muted/40">
                        <p className="text-[10px] text-muted-foreground">المصروف</p>
                        <p className="text-xs font-mono font-bold">{formatCurrency(totalSpent)}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                      <span>الإنجاز: {project.percentComplete}%</span>
                      <span>الصرف: {spentPercent.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${spentPercent > 90 ? 'bg-destructive' : spentPercent > 70 ? 'bg-amber-500' : 'bg-primary'}`}
                        style={{ width: `${spentPercent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </motion.div>
    </AppLayout>
  );
}
