/**
 * The three charts under the comparison table: spend by project, planned
 * profit by project, and the cumulative cash flow across the portfolio.
 * Every series is computed by the page from the same ranked summaries the
 * table shows, so the charts cannot disagree with it.
 */
import { formatCurrency } from '@/lib/finance';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend,
} from 'recharts';
import type { CashFlowPoint } from './portfolioFigures';
import { labelledSlices, pieLegendText } from '@/components/charts/labelled-sector';

const COLORS = ['hsl(40, 55%, 55%)', 'hsl(160, 60%, 42%)', 'hsl(38, 92%, 50%)', 'hsl(0, 72%, 51%)', 'hsl(280, 60%, 50%)', 'hsl(200, 70%, 50%)'];

interface Props {
  pieData: { name: string; value: number }[];
  barData: { name: string; 'الربح المخطط': number }[];
  cashFlowData: CashFlowPoint[];
}

export function PortfolioCharts({ pieData, barData, cashFlowData }: Props) {
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {pieData.length > 0 && (
          <div className="stat-card">
            <h3 className="text-sm font-semibold mb-4">توزيع المصروفات حسب المشروع</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie {...labelledSlices} data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value">
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                <Legend formatter={pieLegendText('share')} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {barData.length > 0 && (
          <div className="stat-card">
            <h3 className="text-sm font-semibold mb-4">الربح المخطط لكل مشروع</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                <Bar dataKey="الربح المخطط" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Cash flow chart */}
      {cashFlowData.length > 0 && (
        <div className="stat-card mb-6">
          <h3 className="text-sm font-semibold mb-4">التدفق النقدي المجمّع (تراكمي)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={cashFlowData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tickFormatter={v => `${v}`} />
              <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
              <Legend />
              <Line type="monotone" dataKey="مخطط" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="فعلي" stroke="hsl(160, 60%, 42%)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  );
}
