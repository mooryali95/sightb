import { formatCurrency } from '@/lib/finance';
import { motion } from 'framer-motion';
import { Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { labelledSlices } from '@/components/charts/labelled-sector';

const COLORS = ['hsl(40, 55%, 55%)', 'hsl(160, 60%, 42%)', 'hsl(38, 92%, 50%)', 'hsl(0, 72%, 51%)', 'hsl(280, 60%, 50%)'];

interface DashboardChartsProps {
  companyData: { name: string; value: number }[];
  statusData: { name: string; value: number }[];
}

export function DashboardCharts({ companyData, statusData }: DashboardChartsProps) {
  if (companyData.length === 0 && statusData.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8"
    >
      {companyData.length > 0 && (
        <div className="stat-card">
          <h3 className="text-sm font-semibold mb-4">المصروفات حسب الشركة</h3>
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
              <Legend formatter={(name: string, entry) => <span className="text-xs text-foreground">{name} ({(entry.payload as { value?: number })?.value ?? 0})</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.div>
  );
}
