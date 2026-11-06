import { formatCurrency } from '@/lib/finance';
import { Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { labelledSlices, pieLegendText } from '@/components/charts/labelled-sector';
import { SERIES } from '@/lib/chart-colors';

const COLORS = SERIES.slice(0, 5);

interface DashboardChartsProps {
  companyData: { name: string; value: number }[];
  statusData: { name: string; value: number }[];
}

export function DashboardCharts({ companyData, statusData }: DashboardChartsProps) {
  if (companyData.length === 0 && statusData.length === 0) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 animate-fade-in">
      {companyData.length > 0 && (
        <div className="stat-card">
          <h3 className="text-sm font-semibold mb-4">المصروفات حسب الشركة</h3>
          {/* SVG text anchors flip under rtl and pushed names off the edge; the axes do the mirroring instead. */}
          <div dir="ltr">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={companyData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              {/* Read from the right: names on the right edge, bars grow leftward. */}
              <XAxis type="number" reversed tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="name" orientation="right" width={128} tick={{ fontSize: 12 }} tickFormatter={(n: string) => (n.length > 18 ? `${n.slice(0, 17)}…` : n)} />
              <Tooltip
                formatter={(value: number) => formatCurrency(value)}
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
              />
              <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 0, 0, 4]} />
            </BarChart>
          </ResponsiveContainer>
          </div>
        </div>
      )}

      {statusData.length > 0 && (
        <div className="stat-card">
          <h3 className="text-sm font-semibold mb-4">حالة المشاريع</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie {...labelledSlices}
                data={statusData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={5}
                dataKey="value"
                nameKey="name"
              >
                {statusData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              {/* Names sit in the legend, not on the ring, where they clipped and overlapped. */}
              <Legend formatter={pieLegendText('count')} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
