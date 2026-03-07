import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { formatCurrency } from '@/lib/finance';

interface BudgetAlertsProps {
  totalPlanned: number;
  totalActual: number;
  contractValue: number;
  budgetItems: { id: string; description: string; plannedAmount: number; category: string }[];
  expenses: { budgetItemId?: string; amount: number }[];
}

const THRESHOLDS = [
  { pct: 100, label: 'تجاوز', variant: 'destructive' as const },
  { pct: 90, label: 'بلغ 90% من', variant: 'warning' as const },
  { pct: 75, label: 'بلغ 75% من', variant: 'info' as const },
];

export function BudgetAlerts({ totalPlanned, totalActual, contractValue, budgetItems, expenses }: BudgetAlertsProps) {
  const alerted = useRef(new Set<string>());

  useEffect(() => {
    if (totalPlanned <= 0 && contractValue <= 0) return;

    // Overall budget alert
    const overallPct = totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0;
    for (const t of THRESHOLDS) {
      const key = `overall-${t.pct}`;
      if (overallPct >= t.pct && !alerted.current.has(key)) {
        alerted.current.add(key);
        toast.warning(`⚠️ الصرف الفعلي ${t.label} الموازنة المخططة (${overallPct.toFixed(1)}%)`, {
          description: `${formatCurrency(totalActual)} من ${formatCurrency(totalPlanned)}`,
          duration: 8000,
        });
        break; // show highest threshold only
      }
    }

    // Contract value alert
    const contractPct = contractValue > 0 ? (totalActual / contractValue) * 100 : 0;
    for (const t of THRESHOLDS) {
      const key = `contract-${t.pct}`;
      if (contractPct >= t.pct && !alerted.current.has(key)) {
        alerted.current.add(key);
        toast.error(`🚨 الصرف الفعلي ${t.label} قيمة العقد (${contractPct.toFixed(1)}%)`, {
          description: `${formatCurrency(totalActual)} من ${formatCurrency(contractValue)}`,
          duration: 10000,
        });
        break;
      }
    }

    // Per-item alerts
    budgetItems.forEach(item => {
      const itemActual = expenses
        .filter(e => e.budgetItemId === item.id)
        .reduce((s, e) => s + e.amount, 0);
      const itemPct = item.plannedAmount > 0 ? (itemActual / item.plannedAmount) * 100 : 0;

      for (const t of THRESHOLDS) {
        const key = `item-${item.id}-${t.pct}`;
        if (itemPct >= t.pct && !alerted.current.has(key)) {
          alerted.current.add(key);
          if (t.pct >= 90) { // only alert for 90%+ on individual items
            toast.warning(`⚠️ بند "${item.description}" ${t.label} المخطط (${itemPct.toFixed(0)}%)`, {
              description: `${formatCurrency(itemActual)} من ${formatCurrency(item.plannedAmount)}`,
              duration: 6000,
            });
          }
          break;
        }
      }
    });
  }, [totalPlanned, totalActual, contractValue, budgetItems, expenses]);

  // Render inline warnings for visibility
  const overallPct = totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0;
  const contractPct = contractValue > 0 ? (totalActual / contractValue) * 100 : 0;

  const warnings: string[] = [];
  if (overallPct >= 90) warnings.push(`الصرف بلغ ${overallPct.toFixed(1)}% من الموازنة المخططة`);
  if (contractPct >= 90) warnings.push(`الصرف بلغ ${contractPct.toFixed(1)}% من قيمة العقد`);

  if (warnings.length === 0) return null;

  return (
    <div className="p-3 rounded-lg border border-destructive/40 bg-destructive/5 flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
      <div className="space-y-1">
        {warnings.map((w, i) => (
          <p key={i} className="text-sm text-destructive font-medium">{w}</p>
        ))}
      </div>
    </div>
  );
}
