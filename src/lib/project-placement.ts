/**
 * Where a project sits: its company and, optionally, one of that company's
 * portfolios. One function decides whether a move is allowed and how to say
 * it, for the drag-and-drop board and the "move to" menu alike. The
 * database enforces the same rules (migration 20261016120000): a portfolio
 * of the same company, edit rights on both companies, and no ledger links
 * left in the old company.
 */
import type { Portfolio, Project } from '@/types/project';

export interface Placement { companyId: string; portfolioId: string | null }

export type MovePlan =
  | { kind: 'noop' }
  | { kind: 'blocked'; reason: string }
  | { kind: 'within'; to: Placement; summary: string; warnings: string[] }
  | { kind: 'across'; to: Placement; summary: string; warnings: string[] };

interface Context {
  portfolios: Portfolio[];
  companyName: (id: string) => string;
  canEditCompany: (id: string) => boolean;
}

export const placementOf = (p: Project): Placement => ({ companyId: p.companyId, portfolioId: p.portfolioId ?? null });
export const placementKey = (p: Placement) => `${p.companyId}/${p.portfolioId ?? 'standalone'}`;

export function planMove(project: Project, to: Placement, ctx: Context): MovePlan {
  const from = placementOf(project);
  if (from.companyId === to.companyId && from.portfolioId === to.portfolioId) return { kind: 'noop' };

  if (to.portfolioId) {
    const pf = ctx.portfolios.find((x) => x.id === to.portfolioId);
    if (!pf) return { kind: 'blocked', reason: 'المحفظة غير موجودة' };
    if (pf.companyId !== to.companyId) return { kind: 'blocked', reason: 'المحفظة لا تتبع الشركة المختارة' };
  }
  const where = (p: Placement) => {
    const pf = p.portfolioId ? ctx.portfolios.find((x) => x.id === p.portfolioId)?.name : null;
    return pf ? `محفظة «${pf}»` : 'المشاريع المستقلة';
  };

  if (from.companyId === to.companyId) {
    if (!ctx.canEditCompany(to.companyId)) return { kind: 'blocked', reason: 'لا تملك صلاحية تعديل هذه الشركة' };
    return { kind: 'within', to, warnings: [], summary: `نقل «${project.name}» من ${where(from)} إلى ${where(to)}` };
  }

  if (!ctx.canEditCompany(from.companyId) || !ctx.canEditCompany(to.companyId)) {
    return { kind: 'blocked', reason: 'نقل المشروع بين الشركات يتطلب صلاحية تعديل على الشركتين' };
  }
  return {
    kind: 'across',
    to,
    summary: `نقل «${project.name}» من ${ctx.companyName(from.companyId)} إلى ${ctx.companyName(to.companyId)} — ${where(to)}`,
    warnings: [
      'تنتقل مع المشروع كل بياناته: الموازنة، المصروفات، الدفعات، العُهد، والمخاطر.',
      'تُحسب أرقامه بعد النقل ضمن الشركة الجديدة، وتخرج من إجماليات الشركة الحالية.',
      'إن كان عليه تحميل من مصاريف الشركة الحالية أو ذمم معها، يُرفض النقل حتى تُسوّى.',
      'من كانت صلاحيته على الشركة الحالية فقط يفقد الوصول إلى المشروع.',
    ],
  };
}
