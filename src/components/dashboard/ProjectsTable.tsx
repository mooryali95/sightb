import { formatCurrency, getProjectSummary } from '@/lib/finance';
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS } from '@/types/project';
import { ArrowLeft, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

interface ProjectsTableProps {
  filteredProjects: any[];
  expenses: any[];
  budgetItems: any[];
  revenues: any[];
  changeOrders: any[];
  companies: any[];
  hasActiveFilters: boolean;
  clearFilters: () => void;
}

export function ProjectsTable({
  filteredProjects, expenses, budgetItems, revenues, changeOrders, companies,
  hasActiveFilters, clearFilters,
}: ProjectsTableProps) {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
      className="stat-card"
    >
      <h3 className="text-sm font-semibold mb-4">
        {hasActiveFilters ? `المشاريع المصفاة (${filteredProjects.length})` : 'جميع المشاريع'}
      </h3>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>المشروع</th>
              <th>الحالة</th>
              <th>قيمة العقد</th>
              <th className="hidden md:table-cell">المصروفات</th>
              <th className="hidden md:table-cell">نسبة الصرف</th>
              <th>الربح المخطط</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence mode="popLayout">
              {filteredProjects.map((project, idx) => {
                const pExpenses = expenses.filter((e: any) => e.projectId === project.id);
                const pRevenues = revenues.filter((r: any) => r.projectId === project.id);
                const pBudget = budgetItems.filter((b: any) => b.projectId === project.id);
                const pCO = changeOrders.filter((co: any) => co.projectId === project.id);
                const summary = getProjectSummary(project, pBudget, pExpenses, pRevenues, pCO);
                const company = companies.find((c: any) => c.id === project.companyId);
                const spendRate = summary.contractSpendRate;

                return (
                  <motion.tr
                    key={project.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.25, delay: idx * 0.03 }}
                    className="cursor-pointer"
                    onClick={() => navigate(`/project/${project.id}`)}
                  >
                    <td>
                      <div className="flex flex-col">
                        <span className="font-medium">{project.name}</span>
                        {company && (
                          <span className="text-[11px] text-muted-foreground mt-0.5">{company.name}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${PROJECT_STATUS_COLORS[project.status]}`}>
                        {PROJECT_STATUS_LABELS[project.status]}
                      </span>
                    </td>
                    <td className="font-mono text-sm">{formatCurrency(summary.effectiveContractValue)}</td>
                    <td className="font-mono text-sm hidden md:table-cell">{formatCurrency(summary.totalActual)}</td>
                    <td className="hidden md:table-cell">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.min(spendRate, 100)}%`,
                              backgroundColor: spendRate > 90 ? 'hsl(var(--destructive))' : 'hsl(var(--primary))',
                            }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">{spendRate.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td>
                      <span className={summary.plannedProfit >= 0 ? 'badge-profit' : 'badge-loss'}>
                        {formatCurrency(summary.plannedProfit)}
                      </span>
                    </td>
                    <td>
                      <ArrowLeft className="w-4 h-4 text-muted-foreground" />
                    </td>
                  </motion.tr>
                );
              })}
            </AnimatePresence>
          </tbody>
        </table>

        {filteredProjects.length === 0 && hasActiveFilters && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center py-12 text-muted-foreground"
          >
            <Search className="w-8 h-8 mb-3 opacity-40" />
            <p className="text-sm">لا توجد مشاريع تطابق التصفية</p>
            <Button variant="ghost" size="sm" onClick={clearFilters} className="mt-2 text-xs">
              مسح الفلاتر
            </Button>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
