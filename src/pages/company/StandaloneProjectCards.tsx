/**
 * The company's projects that belong to no portfolio, as cards with the
 * contract, the spend the summary counts, and the two progress figures.
 */
import { useNavigate } from 'react-router-dom';
import { formatCurrency, getEffectiveContractValue } from '@/lib/finance';
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS, type ChangeOrder, type Expense, type Project } from '@/types/project';
import { Briefcase } from 'lucide-react';
import { projectSpend, spendBarClass } from './projectSpend';

interface Props {
  /** Already filtered by the page: the finished ones are hidden until asked. */
  projects: Project[];
  countedExpenses: Expense[];
  changeOrders: ChangeOrder[];
}

export function StandaloneProjectCards({ projects, countedExpenses, changeOrders }: Props) {
  const navigate = useNavigate();
  if (projects.length === 0) return null;
  return (
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Briefcase className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">مشاريع مستقلة ({projects.length})</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {projects.map(project => {
            const effectiveContract = getEffectiveContractValue(project.contractValue, changeOrders.filter((order) => order.projectId === project.id));
            const { totalSpent, spentPercent } = projectSpend({ ...project, contractValue: effectiveContract }, countedExpenses);
            return (
              <div
                key={project.id}
                className="rounded-xl border border-border bg-card p-4 cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all"
                onClick={() => navigate(`/project/${project.id}`)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Briefcase className="w-4 h-4 text-primary" />
                    </div>
                    <span className="text-sm font-semibold truncate">{project.name}</span>
                  </div>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${PROJECT_STATUS_COLORS[project.status]}`}>
                    {PROJECT_STATUS_LABELS[project.status]}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center mb-3">
                  <div className="p-1.5 rounded bg-muted/40">
                    <p className="text-xs text-muted-foreground">العقد الفعّال</p>
                    <p className="text-xs font-mono font-bold">{formatCurrency(effectiveContract)}</p>
                  </div>
                  <div className="p-1.5 rounded bg-muted/40">
                    <p className="text-xs text-muted-foreground">المصروف</p>
                    <p className="text-xs font-mono font-bold">{formatCurrency(totalSpent)}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                  <span>الإنجاز: {project.percentComplete}%</span>
                  <span>الصرف: {spentPercent.toFixed(0)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${spendBarClass(spentPercent)}`}
                    style={{ width: `${spentPercent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
  );
}
