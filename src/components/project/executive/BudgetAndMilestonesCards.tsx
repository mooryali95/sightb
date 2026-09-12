/** The budget split and the milestones by status, side by side. */
import { DollarSign, CheckCircle2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { formatCurrency } from '@/lib/finance';
import type { Milestone } from '@/types/project';
import { SectionCard, SectionTitle } from './SectionCard';
import type { BudgetSlice } from './executiveFigures';

export function BudgetSplitCard({ slices }: { slices: BudgetSlice[] }) {
  return (
    <SectionCard>
      <SectionTitle icon={DollarSign}>توزيع الموازنة</SectionTitle>
      {slices.length > 0 ? (
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie data={slices} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
              {slices.map((d, i) => <Cell key={i} fill={d.fill} />)}
            </Pie>
            <Tooltip formatter={(v: number) => formatCurrency(v)} />
          </PieChart>
        </ResponsiveContainer>
      ) : <p className="text-xs text-muted-foreground text-center py-8">لا توجد بيانات</p>}
    </SectionCard>
  );
}

export function MilestonesCard({ milestones }: { milestones: Milestone[] }) {
  const completedMilestones = milestones.filter(m => m.status === 'completed').length;
  const nextMilestone = milestones.find(m => m.status === 'planned' || m.status === 'in_progress');
  const milestoneData = [
    { name: 'مكتمل', value: milestones.filter(m => m.status === 'completed').length, fill: 'hsl(160, 60%, 42%)' },
    { name: 'جاري', value: milestones.filter(m => m.status === 'in_progress').length, fill: 'hsl(210, 70%, 50%)' },
    { name: 'متأخر', value: milestones.filter(m => m.status === 'delayed').length, fill: 'hsl(0, 72%, 51%)' },
    { name: 'مخطط', value: milestones.filter(m => m.status === 'planned').length, fill: 'hsl(220, 9%, 60%)' },
  ].filter(d => d.value > 0);

  return (
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
  );
}
