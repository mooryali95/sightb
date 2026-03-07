import { formatCurrency } from '@/lib/finance';
import { EXPENSE_CATEGORY_LABELS, type ExpenseCategory } from '@/types/project';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = [
  'hsl(40, 55%, 55%)', 'hsl(160, 60%, 42%)', 'hsl(38, 92%, 50%)',
  'hsl(0, 72%, 51%)', 'hsl(280, 60%, 50%)', 'hsl(190, 80%, 42%)',
  'hsl(330, 70%, 50%)', 'hsl(50, 80%, 45%)',
];

interface ChartsSectionProps {
  pieData: { name: string; value: number }[];
  barData: { month: string; مصروفات: number }[];
}

export function ChartsSection({ pieData, barData }: ChartsSectionProps) {
  return (
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
  );
}
