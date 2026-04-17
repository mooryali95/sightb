import { Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { getProjectSummary } from '@/lib/finance';
import { getPortfolioSummary, getCompanySummary } from '@/lib/portfolio';

interface SnapshotControlsProps {
  projects: any[];
  portfolios: any[];
  companies: any[];
  budgetItems: any[];
  expenses: any[];
  revenues: any[];
  changeOrders: any[];
  milestones: any[];
  risks: any[];
  indirectCosts: any[];
  saveSnapshot: (data: any) => Promise<any>;
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
        onClick={async () => {
          const now = new Date();
          const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
          let count = 0;
          for (const p of projects) {
            const pBud = budgetItems.filter((b: any) => b.projectId === p.id);
            const pExp = expenses.filter((e: any) => e.projectId === p.id);
            const pRev = revenues.filter((r: any) => r.projectId === p.id);
            const pCO = changeOrders.filter((co: any) => co.projectId === p.id);
            const s = getProjectSummary(p, pBud, pExp, pRev, pCO);
            await saveSnapshot({ entityType: 'project', entityId: p.id, period, snapshotDate: now.toISOString(), metrics: s as any });
            count++;
          }
          for (const port of portfolios) {
            const ps = getPortfolioSummary(port, projects, budgetItems, expenses, revenues, changeOrders, milestones, risks);
            await saveSnapshot({ entityType: 'portfolio', entityId: port.id, period, snapshotDate: now.toISOString(), metrics: ps as any });
            count++;
          }
          for (const comp of companies) {
            const cs = getCompanySummary(comp, portfolios, projects, budgetItems, expenses, revenues, changeOrders, milestones, risks, indirectCosts);
            await saveSnapshot({ entityType: 'company', entityId: comp.id, period, snapshotDate: now.toISOString(), metrics: cs as any });
            count++;
          }
          toast.success(`تم حفظ ${count} لقطة للفترة ${period}`);
        }}
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
