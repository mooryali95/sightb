import { formatCurrency, getProjectSummary } from '@/lib/finance';
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS, RISK_PROBABILITY_LABELS, RISK_PROBABILITY_COLORS } from '@/types/project';
import type {
  Project, Expense, BudgetItem, Revenue, ChangeOrder, Risk, Portfolio,
} from '@/types/project';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

interface AttentionProjectsProps {
  filteredProjects: Project[];
  expenses: Expense[];
  budgetItems: BudgetItem[];
  revenues: Revenue[];
  changeOrders: ChangeOrder[];
  risks: Risk[];
  projects: Project[];
  portfolios: Portfolio[];
}

export function AttentionProjects({
  filteredProjects, expenses, budgetItems, revenues, changeOrders, risks, projects, portfolios,
}: AttentionProjectsProps) {
  const navigate = useNavigate();

  const attentionProjects = filteredProjects.filter(p => {
    const pExp = expenses.filter((e) => e.projectId === p.id);
    const pBud = budgetItems.filter((b) => b.projectId === p.id);
    const pRev = revenues.filter((r) => r.projectId === p.id);
    const pCO = changeOrders.filter((co) => co.projectId === p.id);
    const s = getProjectSummary(p, pBud, pExp, pRev, pCO);
    return s.spendRate > 90 || p.status === 'on-hold' || p.status === 'cancelled';
  });

  const filteredProjectIds = new Set(filteredProjects.map((p) => p.id));
  const openRisks = risks
    .filter((r) =>
      (r.status === 'open' || r.status === 'mitigating') &&
      (r.projectId ? filteredProjectIds.has(r.projectId) : true)
    )
    .sort((a, b) => b.financialImpact - a.financialImpact)
    .slice(0, 5);

  return (
    <>
      {attentionProjects.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.33 }}
          className="stat-card mb-8 border-warning/40"
        >
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 health-warning" />
            <h3 className="text-sm font-semibold">مشاريع تحتاج انتباه ({attentionProjects.length})</h3>
          </div>
          <div className="space-y-2">
            {attentionProjects.slice(0, 5).map(p => {
              const s = getProjectSummary(
                p,
                budgetItems.filter((b) => b.projectId === p.id),
                expenses.filter((e) => e.projectId === p.id),
                revenues.filter((r) => r.projectId === p.id),
                changeOrders.filter((co) => co.projectId === p.id),
              );
              return (
                <div key={p.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate(`/project/${p.id}`)}>
                  <div>
                    <span className="text-sm font-medium">{p.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full mr-2 ${PROJECT_STATUS_COLORS[p.status]}`}>{PROJECT_STATUS_LABELS[p.status]}</span>
                  </div>
                  <span className="text-xs font-mono text-destructive">{s.spendRate.toFixed(0)}% صرف</span>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {openRisks.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.34 }}
          className="stat-card mb-8"
        >
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert className="w-4 h-4 text-destructive" />
            <h3 className="text-sm font-semibold">أعلى المخاطر المفتوحة</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>العنوان</th>
                  <th>المشروع</th>
                  <th>الاحتمال</th>
                  <th>الأثر المالي</th>
                </tr>
              </thead>
              <tbody>
                {openRisks.map((risk) => {
                  const project = risk.projectId ? projects.find((p) => p.id === risk.projectId) : null;
                  const portfolio = risk.portfolioId ? portfolios.find((p) => p.id === risk.portfolioId) : null;
                  return (
                    <tr key={risk.id}>
                      <td className="font-medium text-sm">{risk.title}</td>
                      <td className="text-xs text-muted-foreground">{project?.name || portfolio?.name || '-'}</td>
                      <td>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${RISK_PROBABILITY_COLORS[risk.probability]}`}>
                          {RISK_PROBABILITY_LABELS[risk.probability]}
                        </span>
                      </td>
                      <td className="font-mono text-sm text-destructive">{formatCurrency(risk.financialImpact)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </>
  );
}
