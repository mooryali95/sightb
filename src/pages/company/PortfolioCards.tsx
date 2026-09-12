/**
 * The company's portfolios, each with its four figures and, folded under
 * it, the projects it holds. Which projects appear is the page's call (the
 * finished ones are hidden until asked); the spend on each comes from the
 * expenses the summary counts.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { formatCurrency } from '@/lib/finance';
import {
  HEALTH_STATUS_LABELS, HEALTH_STATUS_COLORS, PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS,
  type Expense, type PortfolioSummary, type Project,
} from '@/types/project';
import { FolderKanban, ArrowLeft, Briefcase, ChevronDown } from 'lucide-react';
import { projectSpend, spendBarClass } from './projectSpend';

interface Props {
  summaries: PortfolioSummary[];
  /** The projects to list under their portfolios, already filtered by the page. */
  projects: Project[];
  countedExpenses: Expense[];
}

export function PortfolioCards({ summaries, projects, countedExpenses }: Props) {
  const navigate = useNavigate();
  const [expandedPortfolios, setExpandedPortfolios] = useState<Record<string, boolean>>({});
  const togglePortfolio = (portfolioId: string) => {
    setExpandedPortfolios(prev => ({ ...prev, [portfolioId]: !prev[portfolioId] }));
  };
  if (summaries.length === 0) return null;
  return (
          <div className="mb-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <FolderKanban className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">المحافظ ({summaries.length})</h3>
        </div>
        {summaries.map(ps => {
          const portfolioProjects = projects.filter(p => p.portfolioId === ps.portfolioId);
          return (
            <div key={ps.portfolioId} className="rounded-xl border border-border bg-card overflow-hidden">
              {/* Portfolio header */}
              <div className="p-4 border-b border-border/50">
                <div className="flex items-center justify-between mb-3">
                  <div
                    className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity flex-1"
                    onClick={() => navigate(`/portfolio/${ps.portfolioId}`)}
                  >
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FolderKanban className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold">{ps.portfolioName}</h4>
                      <p className="text-[11px] text-muted-foreground">{ps.projectCount} مشروع</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${HEALTH_STATUS_COLORS[ps.healthStatus]}`}>
                      {HEALTH_STATUS_LABELS[ps.healthStatus]}
                    </span>
                    {portfolioProjects.length > 0 && (
                      <button
                        onClick={() => togglePortfolio(ps.portfolioId)}
                        className="w-7 h-7 rounded-md hover:bg-muted flex items-center justify-center transition-colors"
                      >
                        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${expandedPortfolios[ps.portfolioId] ? 'rotate-180' : ''}`} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <div className="text-center p-2 rounded-lg bg-muted/40">
                    <p className="text-xs text-muted-foreground mb-0.5">العقود</p>
                    <p className="text-xs font-mono font-bold">{formatCurrency(ps.totalEffectiveValue)}</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-muted/40">
                    <p className="text-xs text-muted-foreground mb-0.5">المصروفات</p>
                    <p className="text-xs font-mono font-bold">{formatCurrency(ps.totalActual)}</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-muted/40">
                    <p className="text-xs text-muted-foreground mb-0.5">الإنجاز</p>
                    <p className="text-sm font-bold">{ps.weightedPercentComplete.toFixed(0)}%</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-muted/40">
                    <p className="text-xs text-muted-foreground mb-0.5">الربح</p>
                    <p className={`text-xs font-mono font-bold ${ps.aggregatePlannedProfit >= 0 ? 'health-good' : 'text-destructive'}`}>
                      {formatCurrency(ps.aggregatePlannedProfit)}
                    </p>
                  </div>
                </div>
              </div>
              {/* Collapsible nested projects */}
              {portfolioProjects.length > 0 && expandedPortfolios[ps.portfolioId] && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="divide-y divide-border/40"
                >
                  {portfolioProjects.map(project => {
                    const { totalSpent, spentPercent } = projectSpend(project, countedExpenses);
                    return (
                      <div
                        key={project.id}
                        className="px-4 py-3 hover:bg-muted/20 cursor-pointer transition-colors flex items-center gap-4"
                        onClick={() => navigate(`/project/${project.id}`)}
                      >
                        <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                          <Briefcase className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium truncate">{project.name}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${PROJECT_STATUS_COLORS[project.status]}`}>
                              {PROJECT_STATUS_LABELS[project.status]}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                            <span>العقد: {formatCurrency(project.contractValue)}</span>
                            <span>·</span>
                            <span>المصروف: {formatCurrency(totalSpent)}</span>
                            <span>·</span>
                            <span>الإنجاز: {project.percentComplete}%</span>
                          </div>
                          <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${spendBarClass(spentPercent)}`}
                              style={{ width: `${spentPercent}%` }}
                            />
                          </div>
                        </div>
                        <ArrowLeft className="w-4 h-4 text-muted-foreground shrink-0" />
                      </div>
                    );
                  })}
                </motion.div>
              )}
            </div>
          );
        })}
      </div>
  );
}
