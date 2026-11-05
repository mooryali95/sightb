import { Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { runOrToast } from '@/lib/run-or-toast';
import { getProjectSummary } from '@/lib/finance';
import { getPortfolioSummary, getCompanySummary } from '@/lib/portfolio';
import type {
  BudgetItem, ChangeOrder, Company, Expense, IndirectCost, Milestone, PeriodicSnapshot, Portfolio, Project, Revenue, Risk,
} from '@/types/project';

interface SnapshotControlsProps {
  projects: Project[];
  portfolios: Portfolio[];
  companies: Company[];
  budgetItems: BudgetItem[];
  expenses: Expense[];
  revenues: Revenue[];
  changeOrders: ChangeOrder[];
  milestones: Milestone[];
  risks: Risk[];
  indirectCosts: IndirectCost[];
  saveSnapshot: (data: Omit<PeriodicSnapshot, 'id' | 'createdAt'>) => Promise<string>;
}

export function SnapshotControls({
  projects, portfolios, companies, budgetItems, expenses, revenues,
  changeOrders, milestones, risks, indirectCosts, saveSnapshot,
}: SnapshotControlsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.335 }}
      className="flex gap-2 mb-8"
    >
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-xs"
        onClick={() => runOrToast(async () => {
          const now = new Date();
          const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
          let count = 0;
          for (const p of projects) {
            const pBud = budgetItems.filter((b) => b.projectId === p.id);
            const pExp = expenses.filter((e) => e.projectId === p.id);
            const pRev = revenues.filter((r) => r.projectId === p.id);
            const pCO = changeOrders.filter((co) => co.projectId === p.id);
            const s = getProjectSummary(p, pBud, pExp, pRev, pCO);
            await saveSnapshot({ entityType: 'project', entityId: p.id, period, snapshotDate: now.toISOString(), metrics: { ...s } });
            count++;
          }
          for (const port of portfolios) {
            const ps = getPortfolioSummary(port, projects, budgetItems, expenses, revenues, changeOrders, milestones, risks);
            await saveSnapshot({ entityType: 'portfolio', entityId: port.id, period, snapshotDate: now.toISOString(), metrics: { ...ps } });
            count++;
          }
          for (const comp of companies) {
            const cs = getCompanySummary(comp, portfolios, projects, budgetItems, expenses, revenues, changeOrders, milestones, risks, indirectCosts);
            await saveSnapshot({ entityType: 'company', entityId: comp.id, period, snapshotDate: now.toISOString(), metrics: { ...cs } });
            count++;
          }
          toast.success(`تم حفظ ${count} لقطة للفترة ${period}`);
        }, 'تعذّر حفظ لقطة الشهر')}
      >
        <Camera className="w-3.5 h-3.5" />
        حفظ لقطة الشهر الحالي
      </Button>
      <p className="text-xs text-muted-foreground max-w-xs self-center">
        يحفظ نسخة من جميع المؤشرات المالية الحالية لمقارنتها لاحقاً مع الأشهر القادمة
      </p>
    </motion.div>
  );
}
