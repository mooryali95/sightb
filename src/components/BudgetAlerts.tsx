import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { formatCurrency, calculateEVM, getCurrentMonth } from '@/lib/finance';
import type { BaselineItem, Expense } from '@/types/project';

interface BudgetAlertsProps {
  totalPlanned: number;
  totalActual: number;
  contractValue: number;
  budgetItems: { id: string; description: string; plannedAmount: number; category: string }[];
  expenses: { budgetItemId?: string; amount: number }[];
  // Optional EVM props
  baselineItems?: BaselineItem[];
  allExpenses?: Expense[];
  durationMonths?: number;
  startDate?: string;
  percentComplete?: number;
}

const THRESHOLDS = [
  { pct: 100, label: 'تجاوز', variant: 'destructive' as const },
  { pct: 90, label: 'بلغ 90% من', variant: 'warning' as const },
  { pct: 75, label: 'بلغ 75% من', variant: 'info' as const },
];

export function BudgetAlerts({ totalPlanned, totalActual, contractValue, budgetItems, expenses, baselineItems, allExpenses, durationMonths, startDate, percentComplete }: BudgetAlertsProps) {
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
        break;
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

    // CPI alert (if EVM data available)
    if (baselineItems && allExpenses && durationMonths && percentComplete !== undefined && percentComplete > 0) {
      const cm = getCurrentMonth(startDate || '', durationMonths);
      const evm = calculateEVM(baselineItems, allExpenses, durationMonths, cm, percentComplete);
      const cpiKey = 'cpi-low';
      if (evm.cpi > 0 && evm.cpi < 0.85 && !alerted.current.has(cpiKey)) {
        alerted.current.add(cpiKey);
        toast.warning(`📉 مؤشر أداء التكلفة (CPI = ${evm.cpi.toFixed(2)}) أقل من المستوى الصحي`, {
          description: 'CPI < 0.85 يعني أن المشروع ينفق أكثر من القيمة المكتسبة',
          duration: 10000,
        });
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
          if (t.pct >= 90) {
            toast.warning(`⚠️ بند "${item.description}" ${t.label} المخطط (${itemPct.toFixed(0)}%)`, {
              description: `${formatCurrency(itemActual)} من ${formatCurrency(item.plannedAmount)}`,
              duration: 6000,
            });
          }
          break;
        }
      }
    });
  }, [totalPlanned, totalActual, contractValue, budgetItems, expenses, baselineItems, allExpenses, durationMonths, startDate, percentComplete]);

  // Render inline warnings
  const overallPct = totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0;
  const contractPct = contractValue > 0 ? (totalActual / contractValue) * 100 : 0;

  const warnings: string[] = [];
  if (overallPct >= 90) warnings.push(`الصرف بلغ ${overallPct.toFixed(1)}% من الموازنة المخططة`);
  if (contractPct >= 90) warnings.push(`الصرف بلغ ${contractPct.toFixed(1)}% من قيمة العقد`);

  if (warnings.length === 0) return null;

  return (
    <div className="p-3 rounded-lg border border-destructive/40 bg-destructive/5 flex items-start gap-2 mb-4">
      <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
      <div className="space-y-1">
        {warnings.map((w, i) => (
          <p key={i} className="text-sm text-destructive font-medium">{w}</p>
        ))}
      </div>
    </div>
  );
}
