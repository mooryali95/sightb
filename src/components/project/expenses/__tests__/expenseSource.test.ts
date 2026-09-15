import { describe, expect, it } from 'vitest';
import type { BudgetItem } from '@/types/project';
import { bookedAmount, budgetItemRemaining, chosen, fundBlocksSubmit, resolveExpenseSource } from '../expenseSource';
import { expense, fund } from '../../__tests__/expenses-fixtures';

const item = { id: 'b1', plannedAmount: 20000 } as BudgetItem;
const base = {
  editing: false, activeFund: fund(), fundId: '', custodyId: '', amount: 100, activeFundRemaining: 38000,
  custodyRemaining: () => 4000,
};

describe('budgetItemRemaining and bookedAmount and chosen', () => {
  it('leaves rejected rows and other items out of what an item still holds', () => {
    const rows = [expense({ amount: 7000, budgetItemId: 'b1' }), expense({ amount: 3000, budgetItemId: 'b1', approvalStatus: 'rejected' }), expense({ amount: 999, budgetItemId: 'b2' })];
    expect(budgetItemRemaining(item, rows)).toBe(13000);
  });

  it('strips VAT only from an inclusive, non-exempt amount', () => {
    expect(bookedAmount(1150, true, false, 15)).toBeCloseTo(1000, 6);
    expect(bookedAmount(1150, true, true, 15)).toBe(1150);
    expect(bookedAmount(1150, false, false, 15)).toBe(1150);
  });

  it('reads an empty or "none" select as nothing chosen', () => {
    expect(chosen('')).toBeUndefined();
    expect(chosen('none')).toBeUndefined();
    expect(chosen('c1')).toBe('c1');
  });
});

describe('resolveExpenseSource', () => {
  it('books a new row against the active fund by default, within what it holds', () => {
    expect(resolveExpenseSource(base)).toEqual({ effectiveFundId: 'fund-1', custodyId: undefined, error: null, long: undefined });
    expect(resolveExpenseSource({ ...base, amount: 38001 }).error).toMatch(/يتجاوز المتبقي في الدفعة #1/);
    expect(resolveExpenseSource({ ...base, amount: 38001 }).long).toBe(true);
  });

  it('holds a new row while the fund is only transferred, unless a custody carries it', () => {
    const transferred = { ...base, activeFund: fund({ status: 'transferred' }) };
    expect(resolveExpenseSource(transferred).error).toMatch(/لم يُقَرّ باستلامها/);
    expect(fundBlocksSubmit(false, transferred.activeFund, '')).toBe(true);
    expect(fundBlocksSubmit(false, transferred.activeFund, 'c1')).toBe(false);
    expect(fundBlocksSubmit(true, transferred.activeFund, '')).toBe(false);
    expect(resolveExpenseSource({ ...transferred, custodyId: 'c1' }).error).toBeNull();
  });

  it('books a custody row without a fund, refuses more than the custody holds, and refuses both sources', () => {
    expect(resolveExpenseSource({ ...base, custodyId: 'c1', fundId: '' })).toMatchObject({ effectiveFundId: undefined, custodyId: 'c1', error: null });
    expect(resolveExpenseSource({ ...base, custodyId: 'c1', amount: 4001 }).error).toMatch(/يتجاوز المتبقي في العهدة/);
    expect(resolveExpenseSource({ ...base, custodyId: 'c1', fundId: 'fund-1' }).error).toMatch(/بعهدة ودفعة في آن واحد/);
  });

  it('refuses a new row with no source at all, and lets an edit keep whatever it had', () => {
    expect(resolveExpenseSource({ ...base, activeFund: undefined }).error).toBe('يجب اختيار مصدر الصرف: دفعة أو عهدة.');
    expect(resolveExpenseSource({ ...base, editing: true, activeFund: undefined, fundId: 'fund-1', amount: 999999 })).toMatchObject({ effectiveFundId: 'fund-1', error: null });
    expect(resolveExpenseSource({ ...base, editing: true, custodyId: 'c1', amount: 999999 }).error).toBeNull();
  });
});
