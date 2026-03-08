import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { StatCard } from '@/components/StatCard';
import { formatCurrency, getBaselineMonthlyPV, getMonthlyBreakdown, calculateEVM, getCurrentMonth } from '@/lib/finance';
import { EXPENSE_CATEGORY_LABELS, type ExpenseCategory, type CostBaseline, type Project } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Target, TrendingUp, TrendingDown, DollarSign, BarChart3, CheckCircle2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { toast } from 'sonner';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';

interface BaselineSectionProps {
  projectId: string;
  durationMonths: number;
  expenses: any[];
  budgetItems: any[];
  project: Project;
}

function buildSCurveData(baseline: CostBaseline, expenses: any[], durationMonths: number) {
  const monthlyPV = getBaselineMonthlyPV(baseline.items, durationMonths);
  const monthlyAC = getMonthlyBreakdown(expenses, durationMonths);
  let cumPV = 0;
  let cumAC = 0;
  return Array.from({ length: durationMonths }, (_, i) => {
    cumPV += monthlyPV[i];
    cumAC += monthlyAC[i];
    return { month: `شهر ${i + 1}`, planned: cumPV, actual: cumAC };
  });
}

export function BaselineSection({ projectId, durationMonths, expenses, budgetItems, project }: BaselineSectionProps) {
  const { baselines, createBaseline, deleteBaseline, setActiveBaseline, loadBaselines } = useStore();
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [baselineName, setBaselineName] = useState('');
  const [openDialog, setOpenDialog] = useState(false);

  useEffect(() => {
    loadBaselines(projectId).finally(() => setLoading(false));
  }, [projectId]);

  const projectBaselines = baselines.filter(b => b.projectId === projectId);
  const activeBaseline = projectBaselines.find(b => b.isActive);

  const handleCreate = async () => {
    if (!baselineName.trim()) return;
    setCreating(true);
    try {
      await createBaseline(projectId, baselineName.trim());
      toast.success('تم إنشاء خط الأساس بنجاح');
      setBaselineName('');
      setOpenDialog(false);
    } catch (err: any) {
      console.error('[baseline]', err);
      toast.error('حدث خطأ، يرجى المحاولة مرة أخرى');
    } finally {
      setCreating(false);
    }
  };

  const currentMonth = getCurrentMonth(project.startDate, durationMonths);

  const evm = activeBaseline
    ? calculateEVM(activeBaseline.items, expenses, durationMonths, Math.min(durationMonths, currentMonth), project.percentComplete)
    : null;

  const sCurveData = activeBaseline ? buildSCurveData(activeBaseline, expenses, durationMonths) : [];

  if (loading) {
    return <div className="stat-card text-center py-8 text-sm text-muted-foreground">جاري التحميل...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="stat-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold">خطوط الأساس (Cost Baselines)</h3>
            <p className="text-xs text-muted-foreground">
              أنشئ خط أساس من الموازنة الحالية لتتبع الأداء المالي
              {project.percentComplete > 0 && ` · نسبة الإنجاز: ${project.percentComplete}%`}
              {` · الشهر الحالي: ${currentMonth}`}
            </p>
          </div>
          <Dialog open={openDialog} onOpenChange={setOpenDialog}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5" disabled={budgetItems.length === 0}>
                <Plus className="w-3.5 h-3.5" />خط أساس جديد
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>إنشاء خط أساس</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <p className="text-sm text-muted-foreground">
                  سيتم حفظ نسخة ثابتة من بنود الموازنة الحالية ({budgetItems.length} بند) كخط أساس للمقارنة.
                </p>
                <div className="space-y-2">
                  <Label>اسم خط الأساس</Label>
                  <Input value={baselineName} onChange={(e) => setBaselineName(e.target.value)} placeholder={`Baseline ${projectBaselines.length + 1}`} />
                </div>
                <Button onClick={handleCreate} className="w-full" disabled={creating}>
                  {creating ? 'جاري الإنشاء...' : 'إنشاء خط الأساس'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {projectBaselines.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">لم يتم إنشاء خط أساس بعد.</p>
            <p className="text-xs text-muted-foreground mt-1">أضف بنود الموازنة أولاً ← ثم أنشئ خط أساس ← ثم ابدأ بتسجيل المصروفات</p>
          </div>
        ) : (
          <div className="space-y-2">
            {projectBaselines.map((bl) => (
              <div key={bl.id} className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${bl.isActive ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <div className="flex items-center gap-3">
                  {bl.isActive && <CheckCircle2 className="w-4 h-4 text-primary" />}
                  <div>
                    <p className="text-sm font-medium">{bl.name} <span className="text-muted-foreground">v{bl.version}</span></p>
                    <p className="text-xs text-muted-foreground">
                      {bl.items.length} بند · {formatCurrency(bl.totalPlanned)} · {new Date(bl.createdAt).toLocaleDateString('ar-SA')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!bl.isActive && (
                    <Button size="sm" variant="outline" onClick={() => setActiveBaseline(bl.id, projectId)}>تفعيل</Button>
                  )}
                  <ConfirmDeleteDialog title="حذف خط الأساس" description="هل أنت متأكد من حذف خط الأساس هذا؟" onConfirm={() => deleteBaseline(bl.id)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {evm && activeBaseline && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard title="القيمة المكتسبة (EV)" value={formatCurrency(evm.ev)} icon={<TrendingUp className="w-4 h-4" />} subtitle={`الإنجاز: ${project.percentComplete}%`} />
            <StatCard title="التكلفة الفعلية (AC)" value={formatCurrency(evm.ac)} icon={<TrendingDown className="w-4 h-4" />} />
            <StatCard title="انحراف التكلفة (CV)" value={formatCurrency(evm.cv)} icon={evm.cv >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />} trend={evm.cv >= 0 ? 'up' : 'down'} />
            <StatCard title="مؤشر الأداء (CPI)" value={evm.cpi.toFixed(2)} icon={<BarChart3 className="w-4 h-4" />} trend={evm.cpi >= 1 ? 'up' : 'down'} subtitle={evm.cpi >= 1 ? 'ضمن الميزانية' : 'تجاوز الميزانية'} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <StatCard title="الميزانية الكلية (BAC)" value={formatCurrency(evm.bac)} icon={<DollarSign className="w-4 h-4" />} />
            <StatCard title="التقدير للإنجاز (EAC)" value={formatCurrency(evm.eac)} icon={<Target className="w-4 h-4" />} trend={evm.eac <= evm.bac ? 'up' : 'down'} />
            <StatCard title="الانحراف عند الإنجاز (VAC)" value={formatCurrency(evm.vac)} icon={evm.vac >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />} trend={evm.vac >= 0 ? 'up' : 'down'} />
          </div>

          {sCurveData.length > 0 && (
            <div className="stat-card">
              <h3 className="text-sm font-semibold mb-4">منحنى S — التكلفة المخططة مقابل الفعلية</h3>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={sCurveData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                  <Legend />
                  <Line type="monotone" dataKey="planned" name="المخطط (PV)" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="actual" name="الفعلي (AC)" stroke="hsl(0, 72%, 51%)" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="stat-card">
            <h3 className="text-sm font-semibold mb-4">تفاصيل خط الأساس النشط: {activeBaseline.name}</h3>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr><th>الفئة</th><th>الوصف</th><th>المخطط</th><th>الشهر</th></tr>
                </thead>
                <tbody>
                  {activeBaseline.items.map((item) => (
                    <tr key={item.id}>
                      <td><span className="badge-gold">{EXPENSE_CATEGORY_LABELS[item.category as ExpenseCategory] || item.category}</span></td>
                      <td>{item.description}</td>
                      <td className="font-mono text-sm">{formatCurrency(item.plannedAmount)}</td>
                      <td>{item.month ? `شهر ${item.month}` : 'موزع'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
