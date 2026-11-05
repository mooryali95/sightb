/**
 * Advance Settlement Service
 * ---------------------------------------------------------------
 * Single source of truth for settling outstanding advances against
 * concrete expenses. Wraps the `split_settle_advance` Postgres RPC
 * and normalises server errors into Arabic user-facing messages.
 *
 * Modes (documented for callers — enforced server-side):
 *  - "exact"   : invoice equals outstanding → normal settlement event
 *                (documented) — callers use paymentRequestService instead.
 *  - "split"   : invoice > outstanding → this service. The outstanding
 *                amount closes the advance; the overflow is booked as
 *                an approved expense against the chosen fund/custody.
 */

import { db } from './db';
import { todayLocal } from '@/lib/utils';

export interface SplitSettleAdvanceInput {
  paymentRequestId: string;
  /** Amount that closes the advance (typically = outstanding). */
  settleAmount: number;
  /** Amount booked as an extra expense on top of the advance. */
  overflowAmount: number;
  /** Where the overflow is drawn from. Provide exactly one of fundId/custodyId. */
  overflowSource: { fundId?: string | null; custodyId?: string | null };
  expenseCategory: string;
  description: string;
  /** ISO date (yyyy-mm-dd). Defaults to today when omitted. */
  date?: string;
  /** 1-12. Defaults to current month when omitted. */
  month?: number;
  budgetItemId?: string | null;
  notes?: string | null;
}

export interface SplitSettleAdvanceResult {
  eventId: string;
  expenseId: string;
  overflowAmount: number;
  settleAmount: number;
}

/**
 * Split-settle an outstanding advance:
 *   - closes the advance with a `documented` settlement event
 *   - creates one approved expense for the overflow
 *   - all in a single server transaction (SSOT preserved)
 */
export async function splitSettle(
  input: SplitSettleAdvanceInput,
): Promise<SplitSettleAdvanceResult> {
  const fundId = input.overflowSource.fundId ?? null;
  const custodyId = input.overflowSource.custodyId ?? null;

  if (!fundId && !custodyId) {
    throw new Error('اختر دفعة أو عهدة لتغطية الجزء الفائض من الفاتورة');
  }
  if (fundId && custodyId) {
    throw new Error('لا يمكن اختيار دفعة وعهدة معاً — اختر مصدراً واحداً للفائض');
  }
  if (input.settleAmount <= 0 || input.overflowAmount <= 0) {
    throw new Error('مبلغ التسوية أو الفائض غير صحيح');
  }

  const today = new Date();
  const date = input.date ?? todayLocal(today);
  const month = input.month ?? today.getMonth() + 1;

  const { data, error } = await db.rpc<Record<string, unknown>>('split_settle_advance', {
    _payment_request_id: input.paymentRequestId,
    _settle_amount: input.settleAmount,
    _overflow_amount: input.overflowAmount,
    _overflow_source: custodyId ? 'custody' : 'fund',
    _overflow_fund_id: custodyId ? null : fundId,
    _overflow_custody_id: custodyId,
    _category: input.expenseCategory,
    _description: input.description,
    _date: date,
    _month: month,
    _budget_item_id: input.budgetItemId ?? null,
    _notes: input.notes ?? null,
  });

  if (error) {
    throw mapSplitSettleError(error as { message?: string });
  }
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    eventId: String(d.event_id ?? ''),
    expenseId: String(d.expense_id ?? ''),
    overflowAmount: Number(d.overflow_amount ?? input.overflowAmount),
    settleAmount: Number(d.settle_amount ?? input.settleAmount),
  };
}

function mapSplitSettleError(error: { message?: string }): Error {
  const raw = error?.message ?? '';
  const msg = raw.toLowerCase();
  if (msg.includes('insufficient_permission')) return new Error('لا تملك صلاحية التسوية');
  if (msg.includes('advance_not_outstanding')) return new Error('السلفة مسوّاة بالفعل');
  if (msg.includes('payment_request_not_found')) return new Error('طلب الصرف غير موجود');
  if (msg.includes('invalid_amounts') || msg.includes('settle_exceeds_outstanding')) {
    return new Error('مبلغ التسوية غير صحيح');
  }
  if (msg.includes('invalid_overflow_source')) return new Error('مصدر الفائض غير صحيح');
  if (msg.includes('fund_required')) return new Error('يجب اختيار دفعة للفائض');
  if (msg.includes('custody_required')) return new Error('يجب اختيار عهدة للفائض');
  if (msg.includes('يتجاوز رصيد') || msg.includes('يتجاوز الرصيد')) return new Error(raw);
  return new Error(raw || 'فشل تنفيذ التسوية');
}
