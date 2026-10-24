import { StatCard } from '@/components/StatCard';
import { formatCurrency } from '@/lib/finance';
import { DollarSign, TrendingDown, TrendingUp, Briefcase, Wallet } from 'lucide-react';
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
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6"
    >
      {/* Hero card — Total contract value */}
      <motion.div variants={stagger.item}>
        <StatCard
          variant="hero"
          title="قيمة العقود الفعّالة"
          value={formatCurrency(effectiveTotalContract)}
          icon={<DollarSign className="w-5 h-5" />}
          subtitle={approvedChangeImpact !== 0
            ? `الأصلية: ${formatCurrency(totalContractValue)}`
            : 'القيمة الفعّالة بعد أوامر التغيير'}
          tooltip="مجموع العقود الأصلية + صافي أوامر التغيير المعتمدة للمشاريع الظاهرة. رقم تراكمي لا يتغير مع فلتر الفترة."
        />
      </motion.div>

      <motion.div variants={stagger.item}>
        <StatCard
          title="الإيرادات المحصّلة"
          value={formatCurrency(collectedRevenue)}
          icon={<Wallet className="w-4 h-4" />}
          trend={revenueChange !== null ? (revenueChange > 0 ? 'up' : 'down') : undefined}
          subtitle={revenueChange !== null ? `${revenueChange > 0 ? '↑' : '↓'} ${Math.abs(revenueChange).toFixed(1)}% عن الفترة السابقة` : 'نقد مستلم فعلياً'}
          tooltip={timePeriod === 'all' ? 'كل الإيرادات التي حالتها «محصّل» للمشاريع الظاهرة.' : 'الإيرادات المحصّلة بتاريخ يقع داخل الفترة المحددة.'}
        />
      </motion.div>

      {/* Expenses — TrendingDown semantics (more spend = bad) */}
      <motion.div variants={stagger.item}>
        <StatCard
          title="إجمالي المصروفات"
          value={formatCurrency(totalExpenses)}
          icon={<TrendingDown className="w-4 h-4" />}
          trend={expenseChange !== null ? (expenseChange > 0 ? 'down' : 'up') : undefined}
          subtitle={expenseChange !== null
            ? `${expenseChange > 0 ? '↑' : '↓'} ${Math.abs(expenseChange).toFixed(1)}% عن الفترة السابقة`
            : undefined}
          tooltip={timePeriod === 'all' ? 'المصروفات المقبولة بعد استبعاد المرفوض والسلف القائمة.' : 'المصروفات المقبولة داخل الفترة المحددة، بعد استبعاد المرفوض والسلف القائمة.'}
        />
      </motion.div>

      {/* Planned Profit — TrendingUp for positive, TrendingDown for negative */}
      <motion.div variants={stagger.item}>
        <StatCard
          title="الربح المخطط"
          value={formatCurrency(plannedProfit)}
          icon={plannedProfit >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          trend={plannedProfit >= 0 ? 'up' : 'down'}
          subtitle={`هامش: ${plannedProfitMargin.toFixed(1)}%`}
          tooltip="قيمة العقود الفعّالة − الموازنة المعتمدة. رقم مخطط تراكمي وليس الربح النقدي المحقق."
        />
      </motion.div>

      {/* Total projects (always visible, neutral) */}
      <motion.div variants={stagger.item}>
        <StatCard
          title="إجمالي المشاريع"
          value={filteredProjectsCount.toString()}
          icon={<Briefcase className="w-4 h-4" />}
          trend="neutral"
          subtitle={`${activeCompaniesCount} شركة${archivedCompaniesCount > 0 ? ` · ${archivedCompaniesCount} مؤرشفة` : ''} · ${portfoliosCount} محفظة`}
          tooltip="عدد المشاريع التي تطابق فلاتر الشركة والحالة والبحث الحالية."
        />
      </motion.div>
    </motion.div>
  );
}
