import { StatCard } from '@/components/StatCard';
import { formatCurrency } from '@/lib/finance';
import { DollarSign, TrendingUp, Briefcase, Wallet } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

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

  const showRevenueCard = timePeriod !== 'all';

  return (
    <motion.div
      variants={stagger.container}
      initial="hidden"
      animate="show"
      className={cn(
        'grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8',
        showRevenueCard ? 'lg:grid-cols-5' : 'lg:grid-cols-4'
      )}
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

      {/* Always-visible: Total projects card */}
      <motion.div variants={stagger.item}>
        <StatCard
          title="إجمالي المشاريع"
          value={filteredProjectsCount.toString()}
          icon={<Briefcase className="w-4 h-4" />}
          subtitle={`${activeCompaniesCount} شركة${archivedCompaniesCount > 0 ? ` · ${archivedCompaniesCount} مؤرشفة` : ''} · ${portfoliosCount} محفظة`}
        />
      </motion.div>

      {/* Conditional: Collected Revenue card (only when a time period is selected) */}
      <AnimatePresence>
        {showRevenueCard && (
          <motion.div
            key="revenue-card"
            initial={{ opacity: 0, scale: 0.9, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
          >
            <StatCard
              title="الإيرادات المحصّلة"
              value={formatCurrency(collectedRevenue)}
              icon={<Wallet className="w-4 h-4" />}
              trend={revenueChange !== null ? (revenueChange > 0 ? 'up' : 'down') : undefined}
              subtitle={
                revenueChange !== null
                  ? `${revenueChange > 0 ? '↑' : '↓'} ${Math.abs(revenueChange).toFixed(1)}% عن الفترة السابقة`
                  : 'خلال الفترة المحددة'
              }
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
