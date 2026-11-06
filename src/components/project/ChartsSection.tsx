import { formatCurrency, getPlannedMonthlyCashFlow, getMonthlyBreakdown } from '@/lib/finance';
import { getSpendTrend } from '@/lib/finance/trend';
import { EXPENSE_CATEGORY_LABELS, type ExpenseCategory, type Expense, type BudgetItem } from '@/types/project';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, ReferenceLine, Legend,
} from 'recharts';
import { labelledSlices, pieLegendText } from '@/components/charts/labelled-sector';

const COLORS = [
  'hsl(40, 55%, 55%)', 'hsl(160, 60%, 42%)', 'hsl(38, 92%, 50%)',
  'hsl(0, 72%, 51%)', 'hsl(280, 60%, 50%)', 'hsl(190, 80%, 42%)',
  'hsl(330, 70%, 50%)', 'hsl(50, 80%, 45%)',
];

interface ChartsSectionProps {
  pieData: { name: string; value: number }[];
  barData: { month: string; مصروفات: number }[];
  expenses?: Expense[];
  totalPlanned?: number;
  durationMonths?: number;
  budgetItems?: BudgetItem[];
}

export function ChartsSection({ pieData, barData, expenses = [], totalPlanned = 0, durationMonths = 0, budgetItems = [] }: ChartsSectionProps) {
  // Cost Trend data: the same counted spend the bars and the variance table read.
  const trendData = getSpendTrend(expenses, totalPlanned, durationMonths);

  // Monthly Variance data
  const varianceData = (budgetItems.length > 0 && durationMonths > 0) ? (() => {
    const plannedMonthly = getPlannedMonthlyCashFlow(budgetItems, durationMonths);
    const actualMonthly = getMonthlyBreakdown(expenses, durationMonths);

    let cumulativeVariance = 0;
    return Array.from({ length: durationMonths }, (_, i) => {
      const planned = plannedMonthly[i];
      const actual = actualMonthly[i];
      const variance = planned - actual;
      const variancePct = planned > 0 ? (variance / planned) * 100 : 0;
      cumulativeVariance += variance;
      return {
        month: i + 1,
        planned,
        actual,
        variance,
        variancePct,
        cumulativeVariance,
        hasData: actual > 0,
      };
    });
  })() : [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {pieData.length > 0 && (
          <div className="stat-card">
            <h3 className="text-sm font-semibold mb-4">المصروفات حسب الفئة</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie {...labelledSlices} data={pieData} cx="50%" cy="50%" outerRadius={100} dataKey="value">
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Legend formatter={pieLegendText('share')} />
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
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                <Bar dataKey="مصروفات" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {trendData.length > 0 && (
        <div className="stat-card">
          <h3 className="text-sm font-semibold mb-4">اتجاه الصرف الشهري</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
              <Legend />
              <Line type="monotone" dataKey="الفعلي" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="معدل الحرق" stroke="hsl(38, 92%, 50%)" strokeWidth={2} strokeDasharray="5 5" dot={false} />
              <Line type="monotone" dataKey="المتوسط المخطط" stroke="hsl(160, 60%, 42%)" strokeWidth={1} strokeDasharray="8 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Monthly Variance Table */}
      {varianceData.length > 0 && varianceData.some(v => v.hasData) && (
        <div className="stat-card">
          <h3 className="text-sm font-semibold mb-1">تحليل الانحراف الشهري</h3>
          <p className="text-xs text-muted-foreground mb-4">المخطط مقابل الفعلي لكل شهر — موجب = وفر، سالب = تجاوز</p>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>الشهر</th>
                  <th>المخطط</th>
                  <th>الفعلي</th>
                  <th>الانحراف</th>
                  <th>%</th>
                  <th>التراكمي</th>
                  <th>الحكم</th>
                </tr>
              </thead>
              <tbody>
                {varianceData.map((v) => (
                  <tr key={v.month}>
                    <td className="font-medium">شهر {v.month}</td>
                    <td className="font-mono text-sm">{formatCurrency(v.planned)}</td>
                    <td className="font-mono text-sm">{v.hasData ? formatCurrency(v.actual) : '—'}</td>
                    <td className={`font-mono text-sm ${v.hasData ? (v.variance >= 0 ? 'text-success' : 'text-destructive') : ''}`}>
                      {v.hasData ? `${v.variance >= 0 ? '+' : ''}${formatCurrency(v.variance)}` : '—'}
                    </td>
                    <td className="text-xs text-muted-foreground">
                      {v.hasData ? `${v.variancePct >= 0 ? '+' : ''}${v.variancePct.toFixed(1)}%` : '—'}
                    </td>
                    <td className={`font-mono text-sm ${v.hasData ? (v.cumulativeVariance >= 0 ? 'text-success' : 'text-destructive') : ''}`}>
                      {v.hasData ? formatCurrency(v.cumulativeVariance) : '—'}
                    </td>
                    <td>
                      {v.hasData ? (
                        v.variance > 0 ? <span className="text-xs px-1.5 py-0.5 rounded-full bg-success/10 text-success">وفر 👍</span> :
                        v.variance < 0 ? <span className="text-xs px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive">تجاوز ⚠️</span> :
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">مطابق</span>
                      ) : <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">لم يحل</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
