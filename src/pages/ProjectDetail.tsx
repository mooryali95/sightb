import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { AppLayout } from '@/components/AppLayout';
import { StatCard } from '@/components/StatCard';
import { formatCurrency, getProjectSummary, getExpensesByCategory, getMonthlyBreakdown, getBaselineMonthlyPV, calculateEVM } from '@/lib/finance';
import { EXPENSE_CATEGORY_LABELS, type ExpenseCategory, type CostBaseline, type Resource, type Custody } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { motion } from 'framer-motion';
import {
  DollarSign, TrendingUp, TrendingDown, Target, Plus, Trash2,
  BarChart3, Receipt, PiggyBank, Baseline, CheckCircle2, Users, Wallet,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from 'recharts';
import { toast } from 'sonner';

const COLORS = [
  'hsl(40, 55%, 55%)', 'hsl(160, 60%, 42%)', 'hsl(38, 92%, 50%)',
  'hsl(0, 72%, 51%)', 'hsl(280, 60%, 50%)', 'hsl(190, 80%, 42%)',
  'hsl(330, 70%, 50%)', 'hsl(50, 80%, 45%)',
];

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    projects, companies, portfolios, budgetItems, expenses, revenues, resources, custodies,
    addBudgetItem, deleteBudgetItem, addExpense, deleteExpense, addRevenue, deleteRevenue,
    addResource, deleteResource, addCustody, deleteCustody,
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

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        {/* Header */}
        <div className="page-header">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <span>{company?.name}</span>
            {portfolio && (
              <>
                <span>←</span>
                <span>{portfolio.name}</span>
              </>
            )}
          </div>
          <h1 className="page-title">{project.name}</h1>
          <p className="page-subtitle">
            {project.durationMonths} أشهر · {project.resourceCount} موارد · {project.currency}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            title="قيمة العقد"
            value={formatCurrency(project.contractValue)}
            icon={<DollarSign className="w-4 h-4" />}
          />
          <StatCard
            title="المصروفات الفعلية"
            value={formatCurrency(summary.totalActual)}
            icon={<TrendingDown className="w-4 h-4" />}
            trend="down"
            subtitle={`المخطط: ${formatCurrency(summary.totalPlanned)}`}
          />
          <StatCard
            title="صافي الربح"
            value={formatCurrency(summary.netProfit)}
            icon={<TrendingUp className="w-4 h-4" />}
            trend={summary.netProfit >= 0 ? 'up' : 'down'}
            subtitle={`هامش الربح: ${summary.profitMargin.toFixed(1)}%`}
          />
          <StatCard
            title="المتبقي من الميزانية"
            value={formatCurrency(summary.remaining)}
            icon={<Target className="w-4 h-4" />}
            trend={summary.remaining >= 0 ? 'up' : 'down'}
          />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="resources" className="space-y-6">
          <TabsList className="grid w-full grid-cols-7 max-w-4xl">
            <TabsTrigger value="resources" className="gap-1.5 text-xs">
              <Users className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">الموارد</span>
            </TabsTrigger>
            <TabsTrigger value="budget" className="gap-1.5 text-xs">
              <PiggyBank className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">الموازنة</span>
            </TabsTrigger>
            <TabsTrigger value="expenses" className="gap-1.5 text-xs">
              <Receipt className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">المصروفات</span>
            </TabsTrigger>
            <TabsTrigger value="custody" className="gap-1.5 text-xs">
              <Wallet className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">العهد</span>
            </TabsTrigger>
            <TabsTrigger value="baseline" className="gap-1.5 text-xs">
              <Baseline className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">خط الأساس</span>
            </TabsTrigger>
            <TabsTrigger value="revenue" className="gap-1.5 text-xs">
              <DollarSign className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">الإيرادات</span>
            </TabsTrigger>
            <TabsTrigger value="charts" className="gap-1.5 text-xs">
              <BarChart3 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">التحليلات</span>
            </TabsTrigger>
          </TabsList>

          {/* Resources Tab */}
          <TabsContent value="resources">
            <ResourcesSection projectId={project.id} resources={pResources} />
          </TabsContent>

          {/* Expenses Tab */}
          <TabsContent value="expenses">
            <ExpensesSection projectId={project.id} durationMonths={project.durationMonths} expenses={pExpenses} resources={pResources} custodies={pCustodies} />
          </TabsContent>

          {/* Budget Tab */}
          <TabsContent value="budget">
            <BudgetSection projectId={project.id} budgetItems={pBudget} expenses={pExpenses} durationMonths={project.durationMonths} resources={pResources} />
          </TabsContent>

          {/* Custody Tab */}
          <TabsContent value="custody">
            <CustodySection projectId={project.id} companyId={project.companyId} custodies={pCustodies} expenses={pExpenses} />
          </TabsContent>

          {/* Baseline Tab */}
          <TabsContent value="baseline">
            <BaselineSection
              projectId={project.id}
              durationMonths={project.durationMonths}
              expenses={pExpenses}
              budgetItems={pBudget}
            />
          </TabsContent>

          {/* Revenue Tab */}
          <TabsContent value="revenue">
            <RevenueSection projectId={project.id} revenues={pRevenues} durationMonths={project.durationMonths} />
          </TabsContent>

          {/* Charts Tab */}
          <TabsContent value="charts">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {pieData.length > 0 && (
                <div className="stat-card">
                  <h3 className="text-sm font-semibold mb-4">المصروفات حسب الفئة</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                        {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}

              {barData.length > 0 && (
                <div className="stat-card">
                  <h3 className="text-sm font-semibold mb-4">المصروفات الشهرية</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={barData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" />
                      <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: number) => formatCurrency(v)}
                        contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                      <Bar dataKey="مصروفات" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </motion.div>
    </AppLayout>
  );
}

// ---- Sub-components ----

function ExpensesSection({ projectId, durationMonths, expenses, resources, custodies }: {
  projectId: string; durationMonths: number; expenses: any[]; resources: Resource[]; custodies: Custody[];
}) {
  const { addExpense, deleteExpense } = useStore();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ExpenseCategory>('salary');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [month, setMonth] = useState('1');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [responsible, setResponsible] = useState('');
  const [resourceId, setResourceId] = useState<string>('');
  const [custodyId, setCustodyId] = useState<string>('');

  const handleAdd = async () => {
    if (!description.trim() || !amount) return;
    await addExpense({
      projectId,
      category,
      description: description.trim(),
      amount: parseFloat(amount),
      date,
      month: parseInt(month),
      responsible: responsible.trim() || undefined,
      resourceId: resourceId || undefined,
      custodyId: custodyId || undefined,
    });
    setDescription(''); setAmount(''); setResponsible(''); setResourceId(''); setCustodyId('');
    setOpen(false);
  };

  // Responsible summary
  const responsibleMap = new Map<string, number>();
  expenses.forEach((e: any) => {
    const key = e.responsible || 'غير محدد';
    responsibleMap.set(key, (responsibleMap.get(key) || 0) + e.amount);
  });

  return (
    <div className="space-y-4">
      {/* Responsible Summary */}
      {responsibleMap.size > 1 && (
        <div className="stat-card">
          <h3 className="text-sm font-semibold mb-3">ملخص الصرف حسب المسؤول</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from(responsibleMap.entries()).map(([name, total]) => (
              <div key={name} className="p-3 rounded-lg border border-border bg-muted/30">
                <p className="text-xs text-muted-foreground">{name}</p>
                <p className="text-sm font-mono font-semibold mt-1">{formatCurrency(total)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="stat-card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">سجل المصروفات</h3>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                إضافة مصروف
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>إضافة مصروف جديد</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>الفئة</Label>
                  <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>الوصف</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="مثال: راتب شهر يناير — أحمد" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>المبلغ</Label>
                    <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
                  </div>
                  <div className="space-y-2">
                    <Label>الشهر</Label>
                    <Select value={month} onValueChange={setMonth}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: durationMonths }, (_, i) => (
                          <SelectItem key={i + 1} value={String(i + 1)}>شهر {i + 1}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>التاريخ</Label>
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>المسؤول</Label>
                    <Input value={responsible} onChange={(e) => setResponsible(e.target.value)} placeholder="اختياري" />
                  </div>
                </div>
                {/* Resource selection */}
                {resources.length > 0 && (
                  <div className="space-y-2">
                    <Label>المورد (اختياري)</Label>
                    <Select value={resourceId} onValueChange={setResourceId}>
                      <SelectTrigger><SelectValue placeholder="اختر المورد" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">بدون مورد</SelectItem>
                        {resources.map((r) => (
                          <SelectItem key={r.id} value={r.id}>{r.name} {r.role ? `(${r.role})` : ''}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {/* Custody selection */}
                {custodies.length > 0 && (
                  <div className="space-y-2">
                    <Label>خصم من عهدة (اختياري)</Label>
                    <Select value={custodyId} onValueChange={setCustodyId}>
                      <SelectTrigger><SelectValue placeholder="اختر العهدة" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">بدون عهدة</SelectItem>
                        {custodies.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.resourceName} — متبقي: {formatCurrency(c.remaining)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Button onClick={handleAdd} className="w-full">إضافة</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {expenses.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">لا توجد مصروفات مسجلة بعد</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>الفئة</th>
                  <th>الوصف</th>
                  <th>المبلغ</th>
                  <th className="hidden sm:table-cell">الشهر</th>
                  <th className="hidden md:table-cell">المورد</th>
                  <th className="hidden lg:table-cell">المسؤول</th>
                  <th className="hidden lg:table-cell">العهدة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((exp) => {
                  const resource = resources.find(r => r.id === exp.resourceId);
                  const custody = custodies.find(c => c.id === exp.custodyId);
                  return (
                    <tr key={exp.id}>
                      <td><span className="badge-gold">{EXPENSE_CATEGORY_LABELS[exp.category as ExpenseCategory]}</span></td>
                      <td>{exp.description}</td>
                      <td className="font-mono text-sm">{formatCurrency(exp.amount)}</td>
                      <td className="hidden sm:table-cell">شهر {exp.month}</td>
                      <td className="hidden md:table-cell text-xs">{resource?.name || '—'}</td>
                      <td className="text-muted-foreground hidden lg:table-cell">{exp.responsible || '—'}</td>
                      <td className="hidden lg:table-cell text-xs">{custody?.resourceName || '—'}</td>
                      <td>
                        <Button variant="ghost" size="icon" onClick={() => deleteExpense(exp.id)}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function BudgetSection({ projectId, budgetItems, expenses, durationMonths }: {
  projectId: string; budgetItems: any[]; expenses: any[]; durationMonths: number;
}) {
  const { addBudgetItem, deleteBudgetItem } = useStore();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ExpenseCategory>('salary');
  const [description, setDescription] = useState('');
  const [plannedAmount, setPlannedAmount] = useState('');
  const [month, setMonth] = useState<string>('');

  const handleAdd = async () => {
    if (!description.trim() || !plannedAmount) return;
    await addBudgetItem({
      projectId,
      category,
      description: description.trim(),
      plannedAmount: parseFloat(plannedAmount),
      month: month ? parseInt(month) : undefined,
    });
    setDescription(''); setPlannedAmount(''); setMonth('');
    setOpen(false);
  };

  // Calculate totals for summary
  const totalPlanned = budgetItems.reduce((s: number, b: any) => s + b.plannedAmount, 0);
  const totalActual = expenses.reduce((s: number, e: any) => s + e.amount, 0);
  const overBudgetCategories = budgetItems.filter((item: any) => {
    const actual = expenses
      .filter((e: any) => e.category === item.category)
      .reduce((s: number, e: any) => s + e.amount, 0);
    return actual > item.plannedAmount;
  });

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold">بنود الموازنة</h3>
          <p className="text-xs text-muted-foreground">
            الإجمالي المخطط: {formatCurrency(totalPlanned)} · الفعلي: {formatCurrency(totalActual)}
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              بند جديد
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>إضافة بند موازنة</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>الفئة</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>الوصف</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="مثال: الموارد البشرية — 4 موارد × 8,000" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>المبلغ المخطط</Label>
                  <Input type="number" value={plannedAmount} onChange={(e) => setPlannedAmount(e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-2">
                  <Label>الشهر <span className="text-muted-foreground text-xs">(اختياري)</span></Label>
                  <Select value={month} onValueChange={setMonth}>
                    <SelectTrigger><SelectValue placeholder="موزع على الكل" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">موزع على كل الأشهر</SelectItem>
                      {Array.from({ length: durationMonths }, (_, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>شهر {i + 1}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={handleAdd} className="w-full">إضافة</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Overspend Alert */}
      {overBudgetCategories.length > 0 && (
        <div className="mb-4 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
          <p className="text-sm font-medium text-destructive flex items-center gap-2">
            <TrendingDown className="w-4 h-4" />
            تجاوز الميزانية في {overBudgetCategories.length} {overBudgetCategories.length === 1 ? 'بند' : 'بنود'}
          </p>
          <ul className="mt-1 text-xs text-destructive/80 space-y-0.5">
            {overBudgetCategories.map((item: any) => {
              const actual = expenses.filter((e: any) => e.category === item.category).reduce((s: number, e: any) => s + e.amount, 0);
              return (
                <li key={item.id}>
                  {EXPENSE_CATEGORY_LABELS[item.category as ExpenseCategory]}: تجاوز بـ {formatCurrency(actual - item.plannedAmount)}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {budgetItems.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">لا توجد بنود موازنة بعد</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>الفئة</th>
                <th>الوصف</th>
                <th>الشهر</th>
                <th>المخطط</th>
                <th>الفعلي</th>
                <th className="hidden sm:table-cell">المتبقي</th>
                <th className="hidden md:table-cell">نسبة الصرف</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {budgetItems.map((item) => {
                const actual = expenses
                  .filter((e: any) => e.category === item.category)
                  .reduce((s: number, e: any) => s + e.amount, 0);
                const remaining = item.plannedAmount - actual;
                const spentPct = item.plannedAmount > 0 ? (actual / item.plannedAmount) * 100 : 0;

                return (
                  <tr key={item.id} className={spentPct > 100 ? 'bg-destructive/5' : ''}>
                    <td><span className="badge-gold">{EXPENSE_CATEGORY_LABELS[item.category as ExpenseCategory]}</span></td>
                    <td>{item.description}</td>
                    <td className="text-xs text-muted-foreground">{item.month ? `شهر ${item.month}` : 'موزع'}</td>
                    <td className="font-mono text-sm">{formatCurrency(item.plannedAmount)}</td>
                    <td className="font-mono text-sm">{formatCurrency(actual)}</td>
                    <td className="hidden sm:table-cell">
                      <span className={remaining >= 0 ? 'badge-profit' : 'badge-loss'}>
                        {formatCurrency(remaining)}
                      </span>
                    </td>
                    <td className="hidden md:table-cell">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.min(spentPct, 100)}%`,
                              backgroundColor: spentPct > 100 ? 'hsl(var(--loss))' : 'hsl(var(--primary))',
                            }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">{spentPct.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td>
                      <Button variant="ghost" size="icon" onClick={() => deleteBudgetItem(item.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RevenueSection({ projectId, revenues, durationMonths }: {
  projectId: string; revenues: any[]; durationMonths: number;
}) {
  const { addRevenue, deleteRevenue } = useStore();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [month, setMonth] = useState('1');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const handleAdd = async () => {
    if (!description.trim() || !amount) return;
    await addRevenue({
      projectId,
      description: description.trim(),
      amount: parseFloat(amount),
      date,
      month: parseInt(month),
    });
    setDescription(''); setAmount('');
    setOpen(false);
  };

  const total = revenues.reduce((s: number, r: any) => s + r.amount, 0);

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold">الإيرادات</h3>
          <p className="text-xs text-muted-foreground">الإجمالي: {formatCurrency(total)}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              إضافة إيراد
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>إضافة إيراد</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>الوصف</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="مثال: دفعة أولى من العميل" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>المبلغ</Label>
                  <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>الشهر</Label>
                  <Select value={month} onValueChange={setMonth}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: durationMonths }, (_, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>شهر {i + 1}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>التاريخ</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <Button onClick={handleAdd} className="w-full">إضافة</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {revenues.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">لا توجد إيرادات مسجلة</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>الوصف</th>
                <th>المبلغ</th>
                <th className="hidden sm:table-cell">الشهر</th>
                <th className="hidden sm:table-cell">التاريخ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {revenues.map((rev: any) => (
                <tr key={rev.id}>
                  <td>{rev.description}</td>
                  <td className="font-mono text-sm profit-text">{formatCurrency(rev.amount)}</td>
                  <td className="hidden sm:table-cell">شهر {rev.month}</td>
                  <td className="text-muted-foreground text-xs hidden sm:table-cell">{rev.date}</td>
                  <td>
                    <Button variant="ghost" size="icon" onClick={() => deleteRevenue(rev.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function BaselineSection({ projectId, durationMonths, expenses, budgetItems }: {
  projectId: string; durationMonths: number; expenses: any[]; budgetItems: any[];
}) {
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
      toast.error(err.message || 'خطأ في إنشاء خط الأساس');
    } finally {
      setCreating(false);
    }
  };

  // EVM calculations
  const evm = activeBaseline
    ? calculateEVM(activeBaseline.items, expenses, durationMonths, Math.min(durationMonths, getCurrentMonth(durationMonths)))
    : null;

  // S-Curve data
  const sCurveData = activeBaseline ? buildSCurveData(activeBaseline, expenses, durationMonths) : [];

  if (loading) {
    return <div className="stat-card text-center py-8 text-sm text-muted-foreground">جاري التحميل...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="stat-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold">خطوط الأساس (Cost Baselines)</h3>
            <p className="text-xs text-muted-foreground">
              أنشئ خط أساس من الموازنة الحالية لتتبع الأداء المالي
            </p>
          </div>
          <Dialog open={openDialog} onOpenChange={setOpenDialog}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5" disabled={budgetItems.length === 0}>
                <Plus className="w-3.5 h-3.5" />
                خط أساس جديد
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>إنشاء خط أساس</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <p className="text-sm text-muted-foreground">
                  سيتم حفظ نسخة ثابتة من بنود الموازنة الحالية ({budgetItems.length} بند) كخط أساس للمقارنة.
                </p>
                <div className="space-y-2">
                  <Label>اسم خط الأساس</Label>
                  <Input
                    value={baselineName}
                    onChange={(e) => setBaselineName(e.target.value)}
                    placeholder={`Baseline ${projectBaselines.length + 1}`}
                  />
                </div>
                <Button onClick={handleCreate} className="w-full" disabled={creating}>
                  {creating ? 'جاري الإنشاء...' : 'إنشاء خط الأساس'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Baselines list */}
        {projectBaselines.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            لم يتم إنشاء خط أساس بعد. أضف بنود الموازنة أولاً ثم أنشئ خط الأساس.
          </p>
        ) : (
          <div className="space-y-2">
            {projectBaselines.map((bl) => (
              <div
                key={bl.id}
                className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                  bl.isActive ? 'border-primary bg-primary/5' : 'border-border'
                }`}
              >
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
                    <Button size="sm" variant="outline" onClick={() => setActiveBaseline(bl.id, projectId)}>
                      تفعيل
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" onClick={() => deleteBaseline(bl.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* EVM Metrics */}
      {evm && activeBaseline && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard
              title="التكلفة المخططة (PV)"
              value={formatCurrency(evm.pv)}
              icon={<Target className="w-4 h-4" />}
            />
            <StatCard
              title="التكلفة الفعلية (AC)"
              value={formatCurrency(evm.ac)}
              icon={<TrendingDown className="w-4 h-4" />}
            />
            <StatCard
              title="انحراف التكلفة (CV)"
              value={formatCurrency(evm.cv)}
              icon={evm.cv >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              trend={evm.cv >= 0 ? 'up' : 'down'}
            />
            <StatCard
              title="مؤشر الأداء (CPI)"
              value={evm.cpi.toFixed(2)}
              icon={<BarChart3 className="w-4 h-4" />}
              trend={evm.cpi >= 1 ? 'up' : 'down'}
              subtitle={evm.cpi >= 1 ? 'ضمن الميزانية' : 'تجاوز الميزانية'}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <StatCard
              title="الميزانية الكلية (BAC)"
              value={formatCurrency(evm.bac)}
              icon={<DollarSign className="w-4 h-4" />}
            />
            <StatCard
              title="التقدير للإنجاز (EAC)"
              value={formatCurrency(evm.eac)}
              icon={<Target className="w-4 h-4" />}
              trend={evm.eac <= evm.bac ? 'up' : 'down'}
            />
            <StatCard
              title="الانحراف عند الإنجاز (VAC)"
              value={formatCurrency(evm.vac)}
              icon={evm.vac >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              trend={evm.vac >= 0 ? 'up' : 'down'}
            />
          </div>

          {/* S-Curve Chart */}
          {sCurveData.length > 0 && (
            <div className="stat-card">
              <h3 className="text-sm font-semibold mb-4">منحنى S — التكلفة المخططة مقابل الفعلية</h3>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={sCurveData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(v: number) => formatCurrency(v)}
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="planned"
                    name="المخطط (PV)"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    name="الفعلي (AC)"
                    stroke="hsl(0, 72%, 51%)"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Baseline Items Detail */}
          <div className="stat-card">
            <h3 className="text-sm font-semibold mb-4">
              تفاصيل خط الأساس النشط: {activeBaseline.name}
            </h3>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>الفئة</th>
                    <th>الوصف</th>
                    <th>المخطط</th>
                    <th>الشهر</th>
                  </tr>
                </thead>
                <tbody>
                  {activeBaseline.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <span className="badge-gold">
                          {EXPENSE_CATEGORY_LABELS[item.category as ExpenseCategory] || item.category}
                        </span>
                      </td>
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

function getCurrentMonth(durationMonths: number): number {
  // Simple heuristic - return middle of project for now
  // In real usage this should be calculated from project start date
  return Math.ceil(durationMonths / 2);
}

function buildSCurveData(baseline: CostBaseline, expenses: any[], durationMonths: number) {
  const monthlyPV = getBaselineMonthlyPV(baseline.items, durationMonths);
  const monthlyAC = getMonthlyBreakdown(expenses, durationMonths);

  let cumPV = 0;
  let cumAC = 0;

  return Array.from({ length: durationMonths }, (_, i) => {
    cumPV += monthlyPV[i];
    cumAC += monthlyAC[i];
    return {
      month: `شهر ${i + 1}`,
      planned: cumPV,
      actual: cumAC,
    };
  });
}
