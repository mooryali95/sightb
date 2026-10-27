import { formatCurrency, removeVAT } from '@/lib/finance';
import type { BudgetItem, Expense, ProjectFund } from '@/types/project';

/** What a budget item still holds after the spend counted against it; rejected rows count nowhere. */
export function budgetItemRemaining(item: BudgetItem, expenses: Expense[]): number {
  const spent = expenses
    .filter((e) => e.budgetItemId === item.id && e.approvalStatus !== 'rejected')
    .reduce((s, e) => s + e.amount, 0);
  return item.plannedAmount - spent;
}

/** The amount booked: net of VAT when the figure typed included it and the row is not exempt. */
export function bookedAmount(raw: number, inputInclusive: boolean, isVatExempt: boolean, taxPercent: number): number {
  return inputInclusive && !isVatExempt ? removeVAT(raw, taxPercent) : raw;
}

/** A select value of '' or 'none' means nothing chosen. */
export const chosen = (value: string): string | undefined => (value && value !== 'none' ? value : undefined);

export interface SourceInput {
  /** Editing an existing row: the source rules apply to new rows only. */
  editing: boolean;
  activeFund: ProjectFund | null | undefined;
  /** The fund chosen in the form, '' or 'none' for nothing. */
  fundId: string;
  /** The custody chosen in the form, '' or 'none' for nothing. */
  custodyId: string;
  amount: number;
  activeFundRemaining: number;
  custodyRemaining: (custodyId: string) => number;
}

export interface SourceResolution {
  /** The fund the row is booked against, if any. */
  effectiveFundId: string | undefined;
  custodyId: string | undefined;
  /** Why the row cannot be booked as it stands; null when it can. */
  error: string | null;
  /** The message deserves a longer toast. */
  long?: boolean;
  /** The amount is more than the source holds: what it still holds, and the rest. */
  over?: { available: number; excess: number };
}

/**
 * The single-source rule: a new expense draws from exactly one of the active
 * fund or a custody, never neither and never both, and never more than that
 * source still holds. An edit keeps whatever source the row had.
 */
export function resolveExpenseSource(i: SourceInput): SourceResolution {
  const custodyId = chosen(i.custodyId);
  const hasCustody = !!custodyId;
  const fundIsRequired = !!i.activeFund;
  const fundBlocksSubmit = !i.editing && !!i.activeFund && i.activeFund.status === 'transferred' && !hasCustody;
  const effectiveFundId = hasCustody
    ? undefined
    : (chosen(i.fundId) ?? (fundIsRequired && !i.editing ? i.activeFund?.id : undefined));
  const done = (error: string | null, long?: boolean, over?: SourceResolution['over']): SourceResolution => ({ effectiveFundId, custodyId, error, long, over });
  const overOf = (available: number) => ({ available: Math.max(0, available), excess: Math.round((i.amount - Math.max(0, available)) * 100) / 100 });

  if (fundBlocksSubmit) {
    return done(`الدفعة #${i.activeFund!.fundNumber} لم يُقَرّ باستلامها بعد. اضغط "إقرار الاستلام" أعلى النموذج.`);
  }
  if (fundIsRequired && !i.editing && !hasCustody && !effectiveFundId) {
    return done('يجب ربط المصروف بالدفعة النشطة أو اختيار عهدة');
  }
  if (!i.editing && !hasCustody && !effectiveFundId) {
    return done('يجب اختيار مصدر الصرف: دفعة أو عهدة.');
  }
  if (hasCustody && chosen(i.fundId)) {
    return done('لا يمكن ربط المصروف بعهدة ودفعة في آن واحد. اختر مصدراً واحداً فقط.');
  }
  if (!i.editing && custodyId) {
    const remaining = i.custodyRemaining(custodyId);
    if (i.amount > remaining) {
      return done(
        `المبلغ (${formatCurrency(i.amount)}) يتجاوز المتبقي في العهدة (${formatCurrency(remaining)}). قسّم المصروف لجزأين: الأول من هذه العهدة بالمبلغ المتاح، والباقي من عهدة/دفعة أخرى.`,
        true, overOf(remaining),
      );
    }
  }
  if (!i.editing && !hasCustody && effectiveFundId && effectiveFundId === i.activeFund?.id && i.amount > i.activeFundRemaining) {
    return done(
      `المبلغ (${formatCurrency(i.amount)}) يتجاوز المتبقي في الدفعة #${i.activeFund!.fundNumber} (${formatCurrency(i.activeFundRemaining)}). قسّم المصروف، أو سجّل دفعة جديدة، أو حرّر سلفة قائمة.`,
      true, overOf(i.activeFundRemaining),
    );
  }
  return done(null);
}

/** Whether the form's submit must be held: a new row on a fund not yet acknowledged, with no custody chosen. */
export function fundBlocksSubmit(editing: boolean, activeFund: ProjectFund | null | undefined, custodyId: string): boolean {
  return !editing && !!activeFund && activeFund.status === 'transferred' && !chosen(custodyId);
}
