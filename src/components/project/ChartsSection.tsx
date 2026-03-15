import { formatCurrency } from '@/lib/finance';
import { EXPENSE_CATEGORY_LABELS, type ExpenseCategory, type Expense } from '@/types/project';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, ReferenceLine, Legend,
} from 'recharts';

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
  budgetItems?: any[];
}

export function ChartsSection({ pieData, barData, expenses = [], totalPlanned = 0, durationMonths = 0, budgetItems = [] }: ChartsSectionProps) {
  // Cost Trend data
  const hasTrendData = expenses.length > 0 && durationMonths > 0;
  const trendData = hasTrendData ? (() => {
    const monthlyAvgPlanned = durationMonths > 0 ? totalPlanned / durationMonths : 0;
    const monthlyActual: number[] = Array(durationMonths).fill(0);
    expenses.forEach(e => {
      if (e.month >= 1 && e.month <= durationMonths) {
        monthlyActual[e.month - 1] += e.amount;
      }
    });

    let cumActual = 0;
    return Array.from({ length: durationMonths }, (_, i) => {
      cumActual += monthlyActual[i];
      const avgBurnRate = cumActual / (i + 1);
      return {
        month: `شهر ${i + 1}`,
        الفعلي: monthlyActual[i],
        'معدل الحرق': Math.round(avgBurnRate),
        'المتوسط المخطط': Math.round(monthlyAvgPlanned),
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
    </div>
  );
}
