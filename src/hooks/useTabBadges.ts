import { useMemo } from 'react';
import { useStore } from '@/store/useStore';

export interface TabBadgeInfo {
  count: number;
  /** semantic intent — drives visual color */
  level: 'info' | 'warning' | 'critical';
  /** short tooltip explaining the badge */
  hint?: string;
}

export interface TabBadges {
  summary: TabBadgeInfo;
  planning: TabBadgeInfo;
  finance: TabBadgeInfo;
  tracking: TabBadgeInfo;
  management: TabBadgeInfo;
}

const empty = (): TabBadgeInfo => ({ count: 0, level: 'info' });

/**
 * Smart Information-Scent badges shown on the 5 main project tabs.
 * Counts always reflect items that demand the user's attention.
 */
export function useTabBadges(projectId?: string): TabBadges {
  const {
    expenses, budgetItems, baselines, milestones, risks, changeOrders,
  } = useStore();

  return useMemo(() => {
    if (!projectId) {
      return {
        summary: empty(), planning: empty(), finance: empty(),
        tracking: empty(), management: empty(),
      };
    }

    const pExp = expenses.filter(e => e.projectId === projectId);
    const pBud = budgetItems.filter(b => b.projectId === projectId);
    const pBaselines = baselines.filter(b => b.projectId === projectId);
    const pMil = milestones.filter(m => m.projectId === projectId);
    const pRisks = risks.filter(r => r.projectId === projectId);
    const pCO = changeOrders.filter(co => co.projectId === projectId);

    // === FINANCE ===
    const pendingExpenses = pExp.filter(e => e.approvalStatus === 'pending').length;
    // Spend against an item is what the finance tab counts as spend: not a
    // rejected expense, not an advance still outstanding.
    const countedExpenses = pExp.filter(e => e.approvalStatus !== 'rejected' && !e.isOutstandingAdvance);
    const overBudgetItems = pBud.filter(b => {
      const actual = countedExpenses
        .filter(e => e.budgetItemId === b.id)
        .reduce((s, e) => s + (e.amount || 0), 0);
      const planned = b.plannedAmount || 0;
      return planned > 0 && actual / planned >= 0.9;
    }).length;
    const financeCount = pendingExpenses + overBudgetItems;
    const financeLevel: TabBadgeInfo['level'] =
      overBudgetItems > 0 ? 'critical' : pendingExpenses > 0 ? 'warning' : 'info';

    // === PLANNING ===
    const hasActiveBaseline = pBaselines.some(b => b.isActive);
    const delayedMilestones = pMil.filter(m => m.status === 'delayed').length;
    const planningCount = (hasActiveBaseline ? 0 : 1) + delayedMilestones;
    const planningLevel: TabBadgeInfo['level'] =
      delayedMilestones > 0 ? 'warning' : !hasActiveBaseline ? 'info' : 'info';

    // === TRACKING ===
    const highRisks = pRisks.filter(r =>
      (r.status === 'open' || r.status === 'mitigating') &&
      (r.impact === 'high' || r.impact === 'very_high')
    ).length;
    const proposedCO = pCO.filter(co => co.status === 'proposed').length;
    const trackingCount = highRisks + proposedCO;
    const trackingLevel: TabBadgeInfo['level'] =
      highRisks > 0 ? 'critical' : proposedCO > 0 ? 'warning' : 'info';

    // === MANAGEMENT ===
    // recent change-order activity + pending CO
    const managementCount = proposedCO;
    const managementLevel: TabBadgeInfo['level'] =
      proposedCO > 0 ? 'warning' : 'info';

    return {
      summary: empty(),
      planning: {
        count: planningCount,
        level: planningLevel,
        hint: !hasActiveBaseline ? 'لم يُعتمد خط الأساس بعد' : `${delayedMilestones} مرحلة متأخرة`,
      },
      finance: {
        count: financeCount,
        level: financeLevel,
        hint: `${pendingExpenses} مصروف معلّق · ${overBudgetItems} بند تجاوز 90%`,
      },
      tracking: {
        count: trackingCount,
        level: trackingLevel,
        hint: `${highRisks} خطر عالٍ · ${proposedCO} أمر تغيير مقترح`,
      },
      management: {
        count: managementCount,
        level: managementLevel,
        hint: `${proposedCO} أمر تغيير بانتظار القرار`,
      },
    };
  }, [projectId, expenses, budgetItems, baselines, milestones, risks, changeOrders]);
}
