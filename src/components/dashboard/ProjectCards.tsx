import { formatCurrency, getProjectSummary } from '@/lib/finance';
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS } from '@/types/project';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

interface ProjectCardsProps {
  filteredProjects: any[];
  expenses: any[];
  budgetItems: any[];
  revenues: any[];
  changeOrders: any[];
  companies: any[];
}

export function ProjectCards({ filteredProjects, expenses, budgetItems, revenues, changeOrders, companies }: ProjectCardsProps) {
  const navigate = useNavigate();

  if (filteredProjects.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.35 }}
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8"
    >
      {filteredProjects.slice(0, 6).map((project) => {
        const pExpenses = expenses.filter((e: any) => e.projectId === project.id);
        const pRevenues = revenues.filter((r: any) => r.projectId === project.id);
        const pBudget = budgetItems.filter((b: any) => b.projectId === project.id);
        const pCO = changeOrders.filter((co: any) => co.projectId === project.id);
        const summary = getProjectSummary(project, pBudget, pExpenses, pRevenues, pCO);
        const company = companies.find((c: any) => c.id === project.companyId);
        const spendRate = summary.contractSpendRate;
        const budgetUtilization = summary.effectiveContractValue > 0 ? (summary.totalPlanned / summary.effectiveContractValue) * 100 : 0;

        return (
          <div
            key={project.id}
            className="stat-card cursor-pointer hover:border-primary/40 transition-colors"
            onClick={() => navigate(`/project/${project.id}`)}
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-sm font-semibold">{project.name}</h4>
                <p className="text-xs text-muted-foreground">{company?.name}</p>
              </div>
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${PROJECT_STATUS_COLORS[project.status]}`}>
                {PROJECT_STATUS_LABELS[project.status]}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="text-center p-2 rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground">قيمة العقد</p>
                <p className="text-xs font-mono font-semibold">{formatCurrency(summary.effectiveContractValue)}</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground">المصروفات</p>
                <p className="text-xs font-mono font-semibold">{formatCurrency(summary.totalActual)}</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground">الربح المخطط</p>
                <p className={`text-xs font-mono font-semibold ${summary.plannedProfit >= 0 ? 'health-good' : 'text-destructive'}`}>
                  {formatCurrency(summary.plannedProfit)}
                </p>
              </div>
              <div className="text-center p-2 rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground">متبقي الموازنة</p>
                <p className={`text-xs font-mono font-semibold ${summary.budgetRemaining >= 0 ? 'health-good' : 'text-destructive'}`}>
                  {formatCurrency(summary.budgetRemaining)}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>نسبة الصرف من العقد</span>
                <span>{spendRate.toFixed(1)}%</span>
              </div>
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(spendRate, 100)}%`,
                    backgroundColor: spendRate > 100 ? 'hsl(var(--destructive))' : 'hsl(var(--primary))',
                  }}
                />
              </div>
              {budgetUtilization > 0 && (
                <>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>تخصيص الموازنة</span>
                    <span>{budgetUtilization.toFixed(1)}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all bg-primary/60"
                      style={{ width: `${Math.min(budgetUtilization, 100)}%` }}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}
    </motion.div>
  );
}
