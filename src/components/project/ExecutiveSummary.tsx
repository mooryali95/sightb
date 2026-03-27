import { useState, useMemo } from 'react';
import { formatCurrency, getPlannedMonthlyCashFlow, getMonthlyBreakdown } from '@/lib/finance';
import {
  Project, ProjectSummary, Milestone, Risk, ChangeOrder, Expense, Revenue,
  BudgetItem, Commitment, CostBaseline, EVMMetrics,
} from '@/types/project';
import {
  DollarSign, TrendingUp, TrendingDown, AlertTriangle, Clock,
  CheckCircle2, XCircle, Shield, BarChart3, Receipt, Calendar, ChevronDown,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Props {
  project: Project;
  summary: ProjectSummary;
  milestones: Milestone[];
  risks: Risk[];
  changeOrders: ChangeOrder[];
  expenses: Expense[];
  revenues: Revenue[];
  budgetItems: BudgetItem[];
  commitments: Commitment[];
  baselines: CostBaseline[];
  evm: EVMMetrics | null;
  currentMonth: number;
  daysRemaining: number | null;
  totalCommitted: number;
  availableBudget: number;
  healthScore: { label: string; color: string; bg: string };
}

export function ExecutiveSummary({
  project, summary, milestones, risks, changeOrders, expenses, revenues,
  budgetItems, commitments, baselines, evm, currentMonth, daysRemaining,
  totalCommitted, availableBudget, healthScore,
}: Props) {
  const vatRate = project.taxPercent || 15;
  const openRisks = risks.filter(r => r.status === 'open' || r.status === 'mitigating');
  const highRisks = openRisks.filter(r => r.impact === 'high' || r.impact === 'very_high');
  const riskExposure = openRisks.reduce((s, r) => s + r.financialImpact, 0);
  const completedMilestones = milestones.filter(m => m.status === 'completed').length;
  const delayedMilestones = milestones.filter(m => m.status === 'delayed').length;
  const nextMilestone = milestones.find(m => m.status === 'planned' || m.status === 'in_progress');
  const pendingExpenses = expenses.filter(e => e.approvalStatus === 'pending');
  const pendingCOs = changeOrders.filter(co => co.status === 'proposed');
  const collectedPct = summary.effectiveContractValue > 0 ? (summary.collectedRevenue / summary.effectiveContractValue) * 100 : 0;

  const plannedMonthly = getPlannedMonthlyCashFlow(budgetItems, project.durationMonths);
  const actualMonthly = getMonthlyBreakdown(expenses, project.durationMonths);

  // Month selector state: 'current' | 'all' | specific month number
  const [selectedMonth, setSelectedMonth] = useState<string>('current');

  const monthPerformance = useMemo(() => {
    if (selectedMonth === 'all') {
      // Cumulative across all elapsed months
      const elapsed = Math.min(project.durationMonths, currentMonth);
      let totalPlanned = 0, totalActual = 0;
      for (let i = 0; i < elapsed; i++) {
        totalPlanned += plannedMonthly[i] || 0;
        totalActual += actualMonthly[i] || 0;
      }
      const diff = totalPlanned - totalActual;
      return { planned: totalPlanned, actual: totalActual, diff, label: `إجمالي ${elapsed} شهر` };
    }
    const monthIdx = selectedMonth === 'current' ? currentMonth - 1 : parseInt(selectedMonth) - 1;
    const planned = plannedMonthly[monthIdx] || 0;
    const actual = actualMonthly[monthIdx] || 0;
    const diff = planned - actual;
    return { planned, actual, diff, label: `شهر ${monthIdx + 1}` };
  }, [selectedMonth, currentMonth, plannedMonthly, actualMonthly, project.durationMonths]);

  const budgetPieData = [
    { name: 'مصروف', value: summary.totalActual, fill: 'hsl(0, 72%, 51%)' },
    { name: 'ملتزم', value: Math.max(0, totalCommitted - summary.totalActual), fill: 'hsl(38, 92%, 50%)' },
    { name: 'متاح', value: Math.max(0, summary.totalPlanned - totalCommitted), fill: 'hsl(160, 60%, 42%)' },
  ].filter(d => d.value > 0);

  const milestoneData = [
    { name: 'مكتمل', value: milestones.filter(m => m.status === 'completed').length, fill: 'hsl(160, 60%, 42%)' },
    { name: 'جاري', value: milestones.filter(m => m.status === 'in_progress').length, fill: 'hsl(210, 70%, 50%)' },
    { name: 'متأخر', value: milestones.filter(m => m.status === 'delayed').length, fill: 'hsl(0, 72%, 51%)' },
    { name: 'مخطط', value: milestones.filter(m => m.status === 'planned').length, fill: 'hsl(220, 9%, 60%)' },
  ].filter(d => d.value > 0);

  const SectionCard = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <div className={`rounded-xl border border-border bg-card p-4 ${className}`}>{children}</div>
  );

  const SectionTitle = ({ icon: Icon, children, actions }: { icon: typeof DollarSign; children: React.ReactNode; actions?: React.ReactNode }) => (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Icon className="w-4 h-4 text-primary" />
        {children}
      </h3>
      {actions}
    </div>
  );

  // Build month options
  const monthOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [
      { value: 'current', label: `الشهر الحالي (${currentMonth})` },
      { value: 'all', label: 'إجمالي الأشهر' },
    ];
    const elapsed = Math.min(project.durationMonths, currentMonth);
    for (let i = 1; i <= elapsed; i++) {
      if (i !== currentMonth) {
        opts.push({ value: String(i), label: `شهر ${i}` });
      }
    }
    return opts;
  }, [currentMonth, project.durationMonths]);

  return (
    <div className="space-y-4" dir="rtl">
      {/* ═══ 1. أداء الشهر ═══ */}
      <SectionCard>
        <SectionTitle
          icon={Calendar}
          actions={
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        >
          الأداء المالي — {monthPerformance.label}
        </SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="text-center p-3 rounded-lg bg-muted/40">
            <p className="text-[10px] text-muted-foreground">المخطط</p>
            <p className="text-sm font-mono font-bold mt-1">{formatCurrency(monthPerformance.planned)}</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/40">
            <p className="text-[10px] text-muted-foreground">المصروف</p>
            <p className="text-sm font-mono font-bold mt-1">{formatCurrency(monthPerformance.actual)}</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/40">
            <p className="text-[10px] text-muted-foreground">{monthPerformance.diff >= 0 ? 'وفر' : 'تجاوز'}</p>
            <p className={`text-sm font-mono font-bold mt-1 ${monthPerformance.diff >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
              {formatCurrency(Math.abs(monthPerformance.diff))}
            </p>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/40">
            <p className="text-[10px] text-muted-foreground">الحكم</p>
            <p className={`text-sm font-bold mt-1 ${monthPerformance.diff >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
              {monthPerformance.actual === 0 ? 'لا صرف بعد' : monthPerformance.diff > 0 ? 'وفر 👍' : monthPerformance.diff < 0 ? 'تجاوز ⚠️' : 'مطابق ✓'}
            </p>
          </div>
        </div>
        {/* Spending progress bar */}
        {monthPerformance.planned > 0 && (
          <div className="mt-3">
            <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
              <span>نسبة الصرف</span>
              <span>{((monthPerformance.actual / monthPerformance.planned) * 100).toFixed(0)}%</span>
            </div>
            <Progress value={Math.min(150, (monthPerformance.actual / monthPerformance.planned) * 100)} className="h-1.5" />
          </div>
        )}
      </SectionCard>

      {/* ═══ 2. EVM ═══ */}
      {evm && (
        <SectionCard>
          <SectionTitle icon={BarChart3}>مؤشرات الأداء (EVM)</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="text-center p-3 rounded-lg bg-muted/40">
              <p className="text-[10px] text-muted-foreground">أداء التكلفة (CPI)</p>
              <p className={`text-lg font-mono font-bold ${evm.cpi >= 1 ? 'text-emerald-600' : evm.cpi >= 0.9 ? 'text-amber-600' : 'text-destructive'}`}>{evm.cpi.toFixed(2)}</p>
              <p className="text-[10px] text-muted-foreground">{evm.cpi >= 1 ? 'ضمن الميزانية' : 'تجاوز'}</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/40">
              <p className="text-[10px] text-muted-foreground">أداء الجدول (SPI)</p>
              <p className={`text-lg font-mono font-bold ${evm.spi >= 1 ? 'text-emerald-600' : evm.spi >= 0.9 ? 'text-amber-600' : 'text-destructive'}`}>{evm.spi.toFixed(2)}</p>
              <p className="text-[10px] text-muted-foreground">{evm.spi >= 1 ? 'في الموعد' : 'متأخر'}</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/40">
              <p className="text-[10px] text-muted-foreground">التكلفة المتوقعة (EAC)</p>
              <p className="text-sm font-mono font-bold">{formatCurrency(evm.eac)}</p>
              <p className={`text-[10px] ${evm.vac >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                {evm.vac >= 0 ? `وفر: ${formatCurrency(evm.vac)}` : `تجاوز: ${formatCurrency(Math.abs(evm.vac))}`}
              </p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/40">
              <p className="text-[10px] text-muted-foreground">الأداء المطلوب (TCPI)</p>
              <p className="text-lg font-mono font-bold">{evm.tcpiBAC.toFixed(2)}</p>
              <p className="text-[10px] text-muted-foreground">{evm.tcpiBAC <= 1.0 ? 'مريح' : evm.tcpiBAC <= 1.2 ? 'يحتاج تحسين' : 'راجع الخطة'}</p>
            </div>
          </div>
        </SectionCard>
      )}

      {/* ═══ 3. الموازنة + المراحل ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SectionCard>
          <SectionTitle icon={DollarSign}>توزيع الموازنة</SectionTitle>
          {budgetPieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={budgetPieData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {budgetPieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-xs text-muted-foreground text-center py-8">لا توجد بيانات</p>}
        </SectionCard>

        <SectionCard>
          <SectionTitle icon={CheckCircle2}>المراحل ({completedMilestones}/{milestones.length} مكتمل)</SectionTitle>
          {milestoneData.length > 0 ? (
            <ResponsiveContainer width="100%" height={140}>
              <PieChart>
                <Pie data={milestoneData} cx="50%" cy="50%" innerRadius={35} outerRadius={55} paddingAngle={3} dataKey="value" label={({ name, value }) => `${name} (${value})`}>
                  {milestoneData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-xs text-muted-foreground text-center py-8">لا توجد مراحل</p>}
          {nextMilestone && (
            <div className="mt-2 p-2 rounded-lg bg-muted/40 text-xs">
              <p className="font-medium">القادم: {nextMilestone.name}</p>
              {nextMilestone.plannedEnd && <p className="text-muted-foreground">الموعد: {new Date(nextMilestone.plannedEnd).toLocaleDateString('ar-SA', { calendar: 'gregory', year: 'numeric', month: 'short', day: 'numeric' })}</p>}
            </div>
          )}
        </SectionCard>
      </div>

      {/* ═══ 4. التحصيل ═══ */}
      <SectionCard>
        <SectionTitle icon={Receipt}>التحصيل</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground">العقد</p>
            <p className="text-sm font-mono font-bold">{formatCurrency(summary.effectiveContractValue)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground">محصّل</p>
            <p className="text-sm font-mono font-bold text-emerald-600">{formatCurrency(summary.collectedRevenue)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground">مفوتر</p>
            <p className="text-sm font-mono font-bold text-amber-600">{formatCurrency(summary.accountsReceivable)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground">لم يُفوتر</p>
            <p className="text-sm font-mono font-bold">{formatCurrency(Math.max(0, summary.effectiveContractValue - summary.collectedRevenue - summary.accountsReceivable))}</p>
          </div>
        </div>
        <div className="space-y-1">
          <Progress value={collectedPct} className="h-2" />
          {summary.accountsReceivable > 0 && <Progress value={(summary.collectedRevenue + summary.accountsReceivable) / summary.effectiveContractValue * 100} className="h-1 opacity-40" />}
        </div>
        <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
          <span>■ محصّل {collectedPct.toFixed(0)}%</span>
          <span>□ مفوتر</span>
          <span>○ لم يُفوتر</span>
        </div>
      </SectionCard>

      {/* ═══ 5. المخاطر ═══ */}
      <SectionCard>
        <SectionTitle icon={Shield}>المخاطر</SectionTitle>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="text-center p-2 rounded-lg bg-muted/40">
            <p className="text-lg font-bold">{openRisks.length}</p>
            <p className="text-[10px] text-muted-foreground">مفتوحة</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/40">
            <p className="text-lg font-bold text-destructive">{highRisks.length}</p>
            <p className="text-[10px] text-muted-foreground">عالية</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/40">
            <p className="text-sm font-mono font-bold">{formatCurrency(riskExposure)}</p>
            <p className="text-[10px] text-muted-foreground">التعرض</p>
          </div>
        </div>
        {highRisks.slice(0, 3).map(r => (
          <div key={r.id} className="flex items-center justify-between text-xs py-1.5 border-t border-border">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 text-destructive" />
              <span>{r.title}</span>
            </div>
            <span className="font-mono text-muted-foreground">{formatCurrency(r.financialImpact)}</span>
          </div>
        ))}
        {project.managementReserve > 0 && (
          <div className="mt-2 p-2 rounded-lg bg-muted/40 text-xs flex items-center justify-between">
            <span>الاحتياطي: {formatCurrency(project.managementReserve)}</span>
            <span className={riskExposure > project.managementReserve ? 'text-destructive' : 'text-emerald-600'}>
              {riskExposure > project.managementReserve ? '⚠️ التعرض يتجاوز الاحتياطي' : '✓ كافٍ'}
            </span>
          </div>
        )}
      </SectionCard>

      {/* ═══ 6. يحتاج تدخل ═══ */}
      {(pendingExpenses.length > 0 || pendingCOs.length > 0 || delayedMilestones > 0 || summary.budgetRemaining < 0) && (
        <SectionCard className="border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/10">
          <SectionTitle icon={AlertTriangle}>يحتاج تدخل</SectionTitle>
          <div className="space-y-2">
            {pendingExpenses.length > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span>{pendingExpenses.length} مصروف بانتظار الاعتماد ({formatCurrency(pendingExpenses.reduce((s, e) => s + e.amount, 0))})</span>
              </div>
            )}
            {pendingCOs.length > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span>{pendingCOs.length} أمر تغيير مقترح</span>
              </div>
            )}
            {delayedMilestones > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <XCircle className="w-3.5 h-3.5 text-destructive" />
                <span>{delayedMilestones} مرحلة متأخرة</span>
              </div>
            )}
            {summary.budgetRemaining < 0 && (
              <div className="flex items-center gap-2 text-xs">
                <TrendingDown className="w-3.5 h-3.5 text-destructive" />
                <span>تجاوز الموازنة بـ {formatCurrency(Math.abs(summary.budgetRemaining))}</span>
              </div>
            )}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
