import { StatCard } from '@/components/StatCard';
import { formatCurrency } from '@/lib/finance';
import { DollarSign, TrendingUp, Briefcase } from 'lucide-react';
import { motion } from 'framer-motion';

const stagger = {
  container: { hidden: {}, show: { transition: { staggerChildren: 0.08 } } },
  item: { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } } },
};

interface DashboardStatsProps {
  effectiveTotalContract: number;
  totalContractValue: number;
  approvedChangeImpact: number;
  totalExpenses: number;
  expenseChange: number | null;
  plannedProfit: number;
  plannedProfitMargin: number;
  collectedRevenue: number;
  revenueChange: number | null;
  timePeriod: string;
  filteredProjectsCount: number;
  activeCompaniesCount: number;
  archivedCompaniesCount: number;
  portfoliosCount: number;
}

export function DashboardStats(props: DashboardStatsProps) {
  const {
    effectiveTotalContract, totalContractValue, approvedChangeImpact,
    totalExpenses, expenseChange, plannedProfit, plannedProfitMargin,
    collectedRevenue, revenueChange, timePeriod, filteredProjectsCount,
    activeCompaniesCount, archivedCompaniesCount, portfoliosCount,
  } = props;

  return (
    <motion.div
      variants={stagger.container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
    >
      <motion.div variants={stagger.item}>
        <StatCard
          title="إجمالي قيمة العقود"
          value={formatCurrency(effectiveTotalContract)}
          icon={<DollarSign className="w-4 h-4" />}
          subtitle={approvedChangeImpact !== 0 ? `الأصلية: ${formatCurrency(totalContractValue)}` : undefined}
        />
      </motion.div>
      <motion.div variants={stagger.item}>
        <StatCard
          title="إجمالي المصروفات"
          value={formatCurrency(totalExpenses)}
          icon={<TrendingUp className="w-4 h-4" />}
          trend={expenseChange !== null ? (expenseChange > 0 ? 'up' : 'down') : undefined}
          subtitle={expenseChange !== null ? `${expenseChange > 0 ? '↑' : '↓'} ${Math.abs(expenseChange).toFixed(1)}% عن الفترة السابقة` : undefined}
        />
      </motion.div>
      <motion.div variants={stagger.item}>
        <StatCard
          title="الربح المخطط"
          value={formatCurrency(plannedProfit)}
          icon={<TrendingUp className="w-4 h-4" />}
          trend={plannedProfit >= 0 ? 'up' : 'down'}
          subtitle={`هامش: ${plannedProfitMargin.toFixed(1)}%`}
        />
      </motion.div>
      <motion.div variants={stagger.item}>
        <StatCard
          title={timePeriod !== 'all' ? 'الإيرادات المحصّلة' : 'المشاريع'}
          value={timePeriod !== 'all' ? formatCurrency(collectedRevenue) : filteredProjectsCount.toString()}
          icon={<Briefcase className="w-4 h-4" />}
          trend={revenueChange !== null ? (revenueChange > 0 ? 'up' : 'down') : undefined}
          subtitle={
            timePeriod !== 'all' && revenueChange !== null
              ? `${revenueChange > 0 ? '↑' : '↓'} ${Math.abs(revenueChange).toFixed(1)}% عن الفترة السابقة`
              : collectedRevenue > 0 ? `محصّل: ${formatCurrency(collectedRevenue)}` : `${activeCompaniesCount} نشطة${archivedCompaniesCount > 0 ? ` · ${archivedCompaniesCount} مؤرشفة` : ''} · ${portfoliosCount} محفظة`
          }
        />
      </motion.div>
    </motion.div>
  );
}
