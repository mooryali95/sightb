import { getProjectSummary } from '@/lib/finance';
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import type { BudgetItem, ChangeOrder, Expense, Project, Revenue } from '@/types/project';
import { STATUS } from '@/lib/chart-colors';

interface HealthMatrixProps {
  filteredProjects: Project[];
  expenses: Expense[];
  budgetItems: BudgetItem[];
  revenues: Revenue[];
  changeOrders: ChangeOrder[];
}

export function HealthMatrix({ filteredProjects, expenses, budgetItems, revenues, changeOrders }: HealthMatrixProps) {
  const healthData = filteredProjects.map(p => {
    const pExp = expenses.filter((e) => e.projectId === p.id);
    const pBud = budgetItems.filter((b) => b.projectId === p.id);
    const pRev = revenues.filter((r) => r.projectId === p.id);
    const pCO = changeOrders.filter((co) => co.projectId === p.id);
    const s = getProjectSummary(p, pBud, pExp, pRev, pCO);
    return {
      name: p.name,
      x: Math.round(s.spendRate),
      y: p.percentComplete,
      z: s.effectiveContractValue,
      fill: p.percentComplete >= s.spendRate ? STATUS.good :
            p.percentComplete >= s.spendRate * 0.7 ? STATUS.watch : STATUS.bad,
    };
  }).filter(d => d.x > 0 || d.y > 0);

  if (healthData.length < 2) return null;

  return (
    <div className="stat-card mb-8 animate-fade-in">
      <h3 className="text-sm font-semibold mb-1">مصفوفة صحة المشاريع</h3>
      <p className="text-xs text-muted-foreground mb-4">المحور الأفقي: نسبة الصرف — المحور الرأسي: نسبة الإنجاز</p>
      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis type="number" dataKey="x" name="نسبة الصرف" unit="%" domain={[0, 'auto']} />
          <YAxis type="number" dataKey="y" name="نسبة الإنجاز" unit="%" domain={[0, 100]} />
          <ZAxis type="number" dataKey="z" range={[60, 400]} />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            content={({ payload }) => {
              if (!payload?.length) return null;
              const d = payload[0].payload;
              return (
                <div className="p-2 rounded-lg border border-border bg-card text-xs shadow-lg">
                  <p className="font-semibold">{d.name}</p>
                  <p>الصرف: {d.x}% · الإنجاز: {d.y}%</p>
                </div>
              );
            }}
          />
          <Scatter data={healthData}>
            {healthData.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
