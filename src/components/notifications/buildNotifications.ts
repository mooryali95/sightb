/**
 * What the bell says, kept pure: every finding on the live projects, and
 * how the findings group and order.
 */
import { getProjectSummary } from '@/lib/finance';
import type {
  BudgetItem, ChangeOrder, Expense, Milestone, PaymentRequest, Project, Revenue, Risk,
} from '@/types/project';
import { countAr } from '@/lib/plural';

export interface Notification {
  id: string;
  type: string;
  title: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
  link: string;
}

export interface NotificationInput {
  projects: Project[];
  budgetItems: BudgetItem[];
  expenses: Expense[];
  revenues: Revenue[];
  changeOrders: ChangeOrder[];
  milestones: Milestone[];
  risks: Risk[];
  paymentRequests: PaymentRequest[];
}

export const SEVERITY_RANK: Record<Notification['severity'], number> = { critical: 0, warning: 1, info: 2 };

export const TYPE_LABELS: Record<string, string> = {
  budget: 'تحذيرات الميزانية',
  approval: 'بانتظار الاعتماد',
  milestone: 'مراحل متأخرة',
  deadline: 'تجاوز المواعيد',
  risk: 'مخاطر مفتوحة',
  advance: 'سلف متقادمة',
};

export const TYPE_ORDER = ['deadline', 'budget', 'advance', 'risk', 'milestone', 'approval'];

export function buildNotifications(
  { projects, budgetItems, expenses, revenues, changeOrders, milestones, risks, paymentRequests }: NotificationInput,
  now = Date.now(),
): Notification[] {
  const items: Notification[] = [];
  for (const p of projects) {
    if (['completed', 'archived', 'cancelled'].includes(p.status)) continue;
    const pB = budgetItems.filter(b => b.projectId === p.id);
    const pE = expenses.filter(e => e.projectId === p.id);
    const pR = revenues.filter(r => r.projectId === p.id);
    const pC = changeOrders.filter(c => c.projectId === p.id);
    const s = getProjectSummary(p, pB, pE, pR, pC);
    const util = s.totalPlanned > 0 ? (s.totalActual / s.totalPlanned) * 100 : 0;

    if (util > 100)
      items.push({ id: `bo-${p.id}`, type: 'budget', severity: 'critical', title: `تجاوز الميزانية: ${p.name}`, description: `${util.toFixed(0)}% من الموازنة`, link: `/project/${p.id}` });
    else if (util > 90)
      items.push({ id: `bw-${p.id}`, type: 'budget', severity: 'warning', title: `قارب الميزانية: ${p.name}`, description: `${util.toFixed(0)}%`, link: `/project/${p.id}` });

    const pending = pE.filter(e => e.approvalStatus === 'pending').length;
    if (pending > 0)
      items.push({ id: `pe-${p.id}`, type: 'approval', severity: 'warning', title: `${countAr(pending, 'expense')} بانتظار الاعتماد`, description: p.name, link: `/project/${p.id}` });

    const pendingCO = pC.filter(c => c.status === 'proposed').length;
    if (pendingCO > 0)
      items.push({ id: `pc-${p.id}`, type: 'approval', severity: 'info', title: `${pendingCO} أمر تغيير مقترح`, description: p.name, link: `/project/${p.id}` });

    const delayed = milestones.filter(m => m.projectId === p.id && m.status === 'delayed').length;
    if (delayed > 0)
      items.push({ id: `dm-${p.id}`, type: 'milestone', severity: 'warning', title: `${delayed} مرحلة متأخرة`, description: p.name, link: `/project/${p.id}` });

    if (p.endDate && new Date(p.endDate) < new Date() && p.percentComplete < 100)
      items.push({ id: `od-${p.id}`, type: 'deadline', severity: 'critical', title: `تجاوز الموعد: ${p.name}`, description: 'تجاوز تاريخ الانتهاء', link: `/project/${p.id}` });

    const hr = risks.filter(r => r.projectId === p.id && r.status === 'open' && (r.impact === 'high' || r.impact === 'very_high')).length;
    if (hr > 0)
      items.push({ id: `hr-${p.id}`, type: 'risk', severity: 'warning', title: `مخاطر عالية: ${hr}`, description: p.name, link: `/project/${p.id}` });

    // سلف قائمة متقادمة (> 60 يوم حرج، 30-60 تحذير)
    const outstandingAdv = paymentRequests.filter((r) =>
      r.projectId === p.id && r.requestType === 'advance' && r.status === 'paid' && r.isAdvanceOutstanding
    );
    let oldestDays = 0;
    for (const adv of outstandingAdv) {
      const ref = adv.paidDate || adv.createdAt;
      if (!ref) continue;
      const days = Math.floor((now - new Date(ref).getTime()) / 86400000);
      if (days > oldestDays) oldestDays = days;
    }
    if (oldestDays > 60)
      items.push({ id: `ao-${p.id}`, type: 'advance', severity: 'critical',
        title: `سلفة قائمة عمرها ${oldestDays} يوم`, description: `${p.name} · ${outstandingAdv.length} سلفة`, link: `/project/${p.id}` });
    else if (oldestDays > 30)
      items.push({ id: `aw-${p.id}`, type: 'advance', severity: 'warning',
        title: `سلفة قائمة عمرها ${oldestDays} يوم`, description: `${p.name} · ${outstandingAdv.length} سلفة`, link: `/project/${p.id}` });
  }
  return items;
}

/** The notifications by kind, in the canonical order, each group sorted by severity. */
export function groupNotifications(items: Notification[]): { type: string; items: Notification[] }[] {
  const map = new Map<string, Notification[]>();
  for (const n of items) {
    if (!map.has(n.type)) map.set(n.type, []);
    map.get(n.type)!.push(n);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  }
  return TYPE_ORDER
    .filter(t => map.has(t))
    .map(t => ({ type: t, items: map.get(t)! }));
}
