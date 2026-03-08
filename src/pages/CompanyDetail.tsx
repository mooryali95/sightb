import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { AppLayout } from '@/components/AppLayout';
import { StatCard } from '@/components/StatCard';
import { formatCurrency } from '@/lib/finance';
import { getCompanySummary } from '@/lib/portfolio';
import {
  HEALTH_STATUS_LABELS, HEALTH_STATUS_COLORS,
  INDIRECT_COST_CATEGORY_LABELS, type IndirectCostCategory,
  PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS,
} from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { motion } from 'framer-motion';
import {
  Building2, DollarSign, TrendingUp, AlertTriangle, Plus,
  FolderKanban, ArrowLeft, Briefcase,
} from 'lucide-react';
import { toast } from 'sonner';

export default function CompanyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    companies, portfolios, projects, budgetItems, expenses, revenues,
    changeOrders, milestones, risks, indirectCosts,
    loading, loadAll, addIndirectCost, deleteIndirectCost,
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
        {/* Header */}
        <div className="page-header">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <button onClick={() => navigate('/')} className="hover:text-primary transition-colors">لوحة التحكم</button>
          </div>
          <div className="flex items-center gap-3">
            <Building2 className="w-6 h-6 text-primary" />
            <h1 className="page-title">{company.name}</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {compPortfolios.length} محفظة · {companyProjects.length} مشروع
          </p>
        </div>

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

        {/* Portfolios */}
        {compPortfolios.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold mb-3">المحافظ</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {summary?.portfolioSummaries.map(ps => (
                <div
                  key={ps.portfolioId}
                  className="stat-card cursor-pointer hover:border-primary/40 transition-colors"
                  onClick={() => navigate(`/portfolio/${ps.portfolioId}`)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <FolderKanban className="w-4 h-4 text-primary" />
                      <span className="text-sm font-semibold">{ps.portfolioName}</span>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${HEALTH_STATUS_COLORS[ps.healthStatus]}`}>
                      {HEALTH_STATUS_LABELS[ps.healthStatus]}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="p-2 rounded bg-muted/30">
                      <p className="text-[10px] text-muted-foreground">المشاريع</p>
                      <p className="text-sm font-bold">{ps.projectCount}</p>
                    </div>
                    <div className="p-2 rounded bg-muted/30">
                      <p className="text-[10px] text-muted-foreground">العقود</p>
                      <p className="text-xs font-mono font-bold">{formatCurrency(ps.totalEffectiveValue)}</p>
                    </div>
                    <div className="p-2 rounded bg-muted/30">
                      <p className="text-[10px] text-muted-foreground">الإنجاز</p>
                      <p className="text-sm font-bold">{ps.weightedPercentComplete.toFixed(0)}%</p>
                    </div>
                    <div className="p-2 rounded bg-muted/30">
                      <p className="text-[10px] text-muted-foreground">الربح</p>
                      <p className={`text-xs font-mono font-bold ${ps.aggregatePlannedProfit >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                        {formatCurrency(ps.aggregatePlannedProfit)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Indirect Costs */}
        <div className="stat-card mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">التكاليف غير المباشرة</h3>
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
                        <td>
                          <ConfirmDeleteDialog onConfirm={async () => {
                            try { await deleteIndirectCost(ic.id); toast.success('تم الحذف'); } catch { toast.error('فشل الحذف'); }
                          }} title="حذف التكلفة" description={`هل أنت متأكد من حذف "${ic.description}"؟`} />
                        </td>
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
          <div className="stat-card mb-6">
            <h3 className="text-sm font-semibold mb-4">مشاريع مستقلة (بدون محفظة)</h3>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>المشروع</th>
                    <th>قيمة العقد</th>
                    <th>الحالة</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {standaloneProjects.map(project => (
                    <tr key={project.id} className="cursor-pointer" onClick={() => navigate(`/project/${project.id}`)}>
                      <td className="font-medium">{project.name}</td>
                      <td className="font-mono text-sm">{formatCurrency(project.contractValue)}</td>
                      <td>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${PROJECT_STATUS_COLORS[project.status]}`}>
                          {PROJECT_STATUS_LABELS[project.status]}
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
      </motion.div>
    </AppLayout>
  );
}
