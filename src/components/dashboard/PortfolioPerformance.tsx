import { formatCurrency } from '@/lib/finance';
import { getPortfolioSummary } from '@/lib/portfolio';
import { HEALTH_STATUS_LABELS, HEALTH_STATUS_COLORS } from '@/types/project';
import { FolderKanban } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type {
  BudgetItem, ChangeOrder, Company, Expense, Milestone, Portfolio, Project, Revenue, Risk,
} from '@/types/project';

interface PortfolioPerformanceProps {
  portfolios: Portfolio[];
  companies: Company[];
  projects: Project[];
  budgetItems: BudgetItem[];
  expenses: Expense[];
  revenues: Revenue[];
  changeOrders: ChangeOrder[];
  milestones: Milestone[];
  risks: Risk[];
}

export function PortfolioPerformance({
  portfolios, companies, projects, budgetItems, expenses, revenues, changeOrders, milestones, risks,
}: PortfolioPerformanceProps) {
  const navigate = useNavigate();
  const activePortfolios = portfolios.filter(p => {
    const comp = companies.find((c) => c.id === p.companyId);
    const hasVisibleProjects = projects.some((project) => project.portfolioId === p.id);
    return comp && comp.status !== 'archived' && hasVisibleProjects;
  });

  if (activePortfolios.length === 0) return null;

  return (
    <div className="mb-8 animate-fade-in">
      <h3 className="text-sm font-semibold mb-3">أداء المحافظ</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {activePortfolios.map(portfolio => {
          const ps = getPortfolioSummary(portfolio, projects, budgetItems, expenses, revenues, changeOrders, milestones, risks);
          return (
            <div
              key={portfolio.id}
              className="stat-card cursor-pointer hover:border-primary/40 transition-colors"
              onClick={() => navigate(`/portfolio/${portfolio.id}`)}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <FolderKanban className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold">{portfolio.name}</span>
                </div>
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${HEALTH_STATUS_COLORS[ps.healthStatus]}`}>
                  {HEALTH_STATUS_LABELS[ps.healthStatus]}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-1.5 rounded bg-muted/30">
                  <p className="text-xs text-muted-foreground">المشاريع</p>
                  <p className="text-sm font-bold">{ps.projectCount}</p>
                </div>
                <div className="p-1.5 rounded bg-muted/30">
                  <p className="text-xs text-muted-foreground">العقود</p>
                  <p className="text-xs font-mono font-bold">{formatCurrency(ps.totalEffectiveValue)}</p>
                </div>
                <div className="p-1.5 rounded bg-muted/30">
                  <p className="text-xs text-muted-foreground">الإنجاز</p>
                  <p className="text-sm font-bold">{ps.weightedPercentComplete.toFixed(0)}%</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
