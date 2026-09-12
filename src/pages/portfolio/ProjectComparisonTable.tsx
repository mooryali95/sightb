/**
 * The portfolio's projects side by side, worst health first (the page ranks
 * them), each row a link to the project.
 */
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '@/lib/finance';
import { HEALTH_STATUS_LABELS, HEALTH_STATUS_COLORS } from '@/types/project';
import { ArrowLeft } from 'lucide-react';
import type { RankedProject } from './portfolioFigures';

interface Props {
  rows: RankedProject[];
}

export function ProjectComparisonTable({ rows }: Props) {
  const navigate = useNavigate();
  if (rows.length === 0) return null;
  return (
      <div className="stat-card mb-6">
        <h3 className="text-sm font-semibold mb-4">مقارنة المشاريع</h3>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>المشروع</th>
                <th>القيمة</th>
                <th className="hidden md:table-cell">المخطط</th>
                <th>المصروف</th>
                <th>الربح المخطط</th>
                <th>الإنجاز%</th>
                <th>الصحة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ project, summary: ps, health }) => (
                <tr key={project.id} className="cursor-pointer" onClick={() => navigate(`/project/${project.id}`)}>
                  <td className="font-medium">{project.name}</td>
                  <td className="font-mono text-sm">{formatCurrency(ps.effectiveContractValue)}</td>
                  <td className="font-mono text-sm hidden md:table-cell">{formatCurrency(ps.totalPlanned)}</td>
                  <td className="font-mono text-sm">{formatCurrency(ps.totalActual)}</td>
                  <td><span className={ps.plannedProfit >= 0 ? 'badge-profit' : 'badge-loss'}>{formatCurrency(ps.plannedProfit)}</span></td>
                  <td className="text-sm">{project.percentComplete}%</td>
                  <td>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${HEALTH_STATUS_COLORS[health]}`}>
                      {HEALTH_STATUS_LABELS[health]}
                    </span>
                  </td>
                  <td><ArrowLeft className="w-4 h-4 text-muted-foreground" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
  );
}
