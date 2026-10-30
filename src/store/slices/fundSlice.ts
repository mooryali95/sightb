import { needsReason } from '@/components/project/funds/settlementFigures';
import { StateCreator } from 'zustand';
import { db } from '@/services/db';
import { logger } from '@/lib/logger';
import {
  ProjectFund,
  FundSettlement,
  FundSettlementAttachment,
  FundStatus,
  SettlementStatus,
} from '@/types/project';
import { getUserId } from '../helpers';
import type { AppState } from '../useStore';
import type { Tables } from '@/integrations/supabase/types';

export interface FundSlice {
  projectFunds: ProjectFund[];
  fundSettlements: FundSettlement[];

  loadFundsForProject: (projectId: string) => Promise<void>;

  /** إنشاء دفعة جديدة (إدارة فقط). يرفض إذا توجد دفعة غير مسوّاة */
  createFund: (
    projectId: string,
    amount: number,
    transferDate: string,
    notes?: string,
    options?: {
      emergency?: boolean; emergencyReason?: string;
      /** Company money: it may arrive while a fund is still open, and records the ledger movement it came from. */
      fromCompany?: { ledgerEntryId?: string };
    },
  ) => Promise<string>;

  /** إقرار الاستلام من مدير المشروع — يُنشئ تلقائياً تسوية بحالة draft */
  acknowledgeFund: (fundId: string) => Promise<void>;

  /** تحديث المسودة قبل الإرسال */
  updateSettlementDraft: (
    settlementId: string,
    updates: Partial<Pick<FundSettlement, 'remainingCash' | 'attachments' | 'differenceReason'>>,
  ) => Promise<void>;

  /** إرسال التسوية للاعتماد */
  submitSettlement: (
    fundId: string,
    remainingCash: number,
    attachments: FundSettlementAttachment[],
    differenceReason?: string,
  ) => Promise<void>;

  /** اعتماد التسوية (إدارة فقط) — يخصم المتبقي من الدفعة التالية إن وجدت */
  approveSettlement: (settlementId: string) => Promise<void>;

  /** رفض التسوية (إدارة فقط) — يعيد الدفعة لحالة acknowledged */
  rejectSettlement: (settlementId: string, reason: string) => Promise<void>;

  /** حذف دفعة (إدارة فقط) */
  deleteFund: (fundId: string) => Promise<void>;

  /** Settled cash waiting for a next fund goes back to the company instead (the project has finished). */
  markCarryReturned: (settlementId: string) => Promise<void>;
}

function mapFund(d: Tables<'project_funds'>): ProjectFund {
  return {
    id: d.id,
    projectId: d.project_id,
    fundNumber: d.fund_number,
    amount: Number(d.amount),
    transferDate: d.transfer_date,
    status: d.status as FundStatus,
    notes: d.notes || undefined,
    createdBy: d.created_by,
    acknowledgedAt: d.acknowledged_at || undefined,
    acknowledgedBy: d.acknowledged_by || undefined,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
    // Columns from 20261028090000; absent before it, read as none.
    carriedIn: Number((d as { carried_in?: number | null }).carried_in ?? 0),
    ledgerEntryId: (d as { ledger_entry_id?: string | null }).ledger_entry_id || undefined,
  };
}

function mapSettlement(d: Tables<'fund_settlements'>): FundSettlement {
  return {
    id: d.id,
    fundId: d.fund_id,
    projectId: d.project_id,
    totalReceived: Number(d.total_received ?? 0),
    totalSpent: Number(d.total_spent ?? 0),
    remainingCash: Number(d.remaining_cash ?? 0),
    difference: Number(d.difference ?? 0),
    settledBy: d.settled_by || undefined,
    approvedBy: d.approved_by || undefined,
    settlementDate: d.settlement_date || undefined,
    approvalDate: d.approval_date || undefined,
    status: d.status as SettlementStatus,
    rejectionReason: d.rejection_reason || undefined,
    differenceReason: d.difference_reason || undefined,
    carryStatus: ((d as { carry_status?: string | null }).carry_status || undefined) as FundSettlement['carryStatus'],
    carriedToFundId: (d as { carried_to_fund_id?: string | null }).carried_to_fund_id || undefined,
    attachments: Array.isArray(d.attachments) ? (d.attachments as unknown as FundSettlementAttachment[]) : [],
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  };
}

/** Repayments to the company out of these funds, by fund. Empty before 20261028090000. */
async function returnsByFund(fundIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (fundIds.length === 0) return out;
  const { data, error } = await db.from('intercompany_entries').select('source_fund_id, amount').in('source_fund_id' as never, fundIds);
  if (error) return out;
  for (const r of (data ?? []) as unknown as { source_fund_id: string; amount: number }[]) {
    out.set(r.source_fund_id, (out.get(r.source_fund_id) ?? 0) + Number(r.amount));
  }
  return out;
}

export const createFundSlice: StateCreator<AppState, [], [], FundSlice> = (set, get) => {
  /**
   * Cash left at approved settlements and waiting for a next fund joins
   * `fundId`: its amount grows by it, recorded as carried in, and the
   * settlements say where it went. Returns the amount carried.
   */
  const carryPendingInto = async (projectId: string, fundId: string): Promise<number> => {
    const pending = get().fundSettlements.filter((st) => st.projectId === projectId && st.status === 'approved'
      && st.carryStatus === 'pending' && st.remainingCash > 0.005 && st.fundId !== fundId);
    const total = Math.round(pending.reduce((sum, st) => sum + st.remainingCash, 0) * 100) / 100;
    if (total <= 0) return 0;
    const fund = get().projectFunds.find((f) => f.id === fundId);
    if (!fund) return 0;
    const { data, error } = await db.from('project_funds')
      .update({ amount: fund.amount + total, carried_in: (fund.carriedIn ?? 0) + total } as never)
      .eq('id', fundId).select().single();
    if (error) throw error;
    const { error: stErr } = await db.from('fund_settlements')
      .update({ carry_status: 'carried', carried_to_fund_id: fundId } as never)
      .in('id', pending.map((st) => st.id));
    if (stErr) throw stErr;
    // The fund's own open settlement was drafted for its old amount.
    const newAmount = Number((data as { amount: number }).amount);
    const { error: draftErr } = await db.from('fund_settlements').update({ total_received: newAmount })
      .eq('fund_id', fundId).neq('status', 'approved');
    if (draftErr) throw draftErr;
    set((s) => ({
      projectFunds: s.projectFunds.map((f) => (f.id === fundId ? { ...mapFund(data), returnedOut: f.returnedOut } : f)),
      fundSettlements: s.fundSettlements.map((st) => {
        if (pending.some((p) => p.id === st.id)) return { ...st, carryStatus: 'carried' as const, carriedToFundId: fundId };
        if (st.fundId === fundId && st.status !== 'approved') return { ...st, totalReceived: newAmount };
        return st;
      }),
    }));
    return total;
  };

  const loadFunds = async (projectId: string, withReturns: boolean) => {
    const [fundsRes, settlementsRes] = await Promise.all([
      db
        .from('project_funds')
        .select('*')
        .eq('project_id', projectId)
        .order('fund_number', { ascending: true }),
      db
        .from('fund_settlements')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false }),
    ]);
    if (fundsRes.error) throw fundsRes.error;
    if (settlementsRes.error) throw settlementsRes.error;

    // A reload that only checks for open funds (createFund) skips the repayments.
    const returned = withReturns ? await returnsByFund((fundsRes.data || []).map((f: { id: string }) => f.id)) : new Map<string, number>();
    const funds = (fundsRes.data || []).map((d: Tables<'project_funds'>) => ({ ...mapFund(d), returnedOut: returned.get(d.id) ?? 0 }));
    const settlements = (settlementsRes.data || []).map(mapSettlement);

    set((s) => ({
      projectFunds: [
        ...s.projectFunds.filter((f) => f.projectId !== projectId),
        ...funds,
      ],
      fundSettlements: [
        ...s.fundSettlements.filter((st) => st.projectId !== projectId),
        ...settlements,
      ],
    }));
  };

  return {
  projectFunds: [],
  fundSettlements: [],

  loadFundsForProject: (projectId) => loadFunds(projectId, true),


  createFund: async (projectId, amount, transferDate, notes, options) => {
    const userId = await getUserId();
    const isEmergency = !!options?.emergency;
    const emergencyReason = options?.emergencyReason?.trim();

    if (isEmergency && !emergencyReason) {
      throw new Error('سبب الدفعة الاستثنائية مطلوب');
    }

    // إعادة تحميل من DB لمنع state stale
    try { await loadFunds(projectId, false); }
    catch (err) { logger.warn('store.fund', 'تعذّرت إعادة تحميل العهد قبل التسوية — قد تكون الحالة قديمة', { projectId, err: String(err) }); }

    const projectFunds = get().projectFunds.filter((f) => f.projectId === projectId);
    const unsettled = projectFunds.find((f) => f.status !== 'settled');
    if (unsettled && !isEmergency && !options?.fromCompany) {
      throw new Error(
        `لا يمكن إنشاء دفعة جديدة قبل تسوية الدفعة رقم ${unsettled.fundNumber}`,
      );
    }

    // احسب nextNumber من DB مباشرة (مصدر الحقيقة)
    const computeNext = async (): Promise<number> => {
      const { data, error } = await db
        .from('project_funds')
        .select('fund_number')
        .eq('project_id', projectId)
        .order('fund_number', { ascending: false })
        .limit(1);
      if (error) throw error;
      const last = data && data.length > 0 ? Number(data[0].fund_number) : 0;
      return last + 1;
    };

    const finalNotes = isEmergency
      ? `[دفعة استثنائية] ${emergencyReason}${notes?.trim() ? ` — ${notes.trim()}` : ''}`
      : (notes?.trim() || null);

    const tryInsert = async (n: number) => {
      return await db
        .from('project_funds')
        .insert({
          project_id: projectId,
          fund_number: n,
          amount,
          transfer_date: transferDate,
          notes: finalNotes,
          created_by: userId,
          status: 'transferred',
          ...(options?.fromCompany?.ledgerEntryId ? { ledger_entry_id: options.fromCompany.ledgerEntryId } : {}),
        } as never)
        .select()
        .single();
    };

    let nextNumber = await computeNext();
    let { data, error } = await tryInsert(nextNumber);

    if (error && (error.code === '23505' || /duplicate key/i.test(error.message || ''))) {
      nextNumber = await computeNext();
      ({ data, error } = await tryInsert(nextNumber));
    }
    if (error) {
      const msg = (error.code === '23505' || /duplicate key/i.test(error.message || ''))
        ? 'تعذّر إنشاء الدفعة بسبب تعارض في الترقيم. حدّث الصفحة وأعد المحاولة.'
        : (error.message || 'تعذّر إنشاء الدفعة');
      throw new Error(msg);
    }

    const mapped = mapFund(data);

    // ملاحظة: تسجيل الدفعات الاستثنائية يتم تلقائياً على مستوى قاعدة البيانات
    // عبر trigger `trg_audit_emergency_fund_create` (SECURITY DEFINER) لضمان عدم تجاوز الحدث.

    set((s) => ({ projectFunds: [...s.projectFunds, { ...mapped, returnedOut: 0 }] }));
    // Cash a settled fund left with the project arrives with the next fund.
    try { await carryPendingInto(projectId, mapped.id); }
    catch (err) { logger.warn('store.fund', 'تعذّر ترحيل المتبقي إلى الدفعة الجديدة', { projectId, err: String(err) }); }
    return mapped.id;
  },

  acknowledgeFund: async (fundId) => {
    const userId = await getUserId();
    const fund = get().projectFunds.find((f) => f.id === fundId);
    if (!fund) throw new Error('الدفعة غير موجودة');
    if (fund.status !== 'transferred') {
      throw new Error('هذه الدفعة لا يمكن إقرار استلامها');
    }

    const now = new Date().toISOString();
    const { data: fundData, error: fundErr } = await db
      .from('project_funds')
      .update({
        status: 'acknowledged',
        acknowledged_at: now,
        acknowledged_by: userId,
      })
      .eq('id', fundId)
      .select()
      .single();
    if (fundErr) throw fundErr;

    // إنشاء تسوية مسودة تلقائياً
    const { data: stData, error: stErr } = await db
      .from('fund_settlements')
      .insert({
        fund_id: fundId,
        project_id: fund.projectId,
        total_received: fund.amount,
        total_spent: 0,
        remaining_cash: 0,
        status: 'draft',
        settled_by: userId,
        attachments: [],
      })
      .select()
      .single();
    if (stErr) throw stErr;

    set((s) => ({
      projectFunds: s.projectFunds.map((f) => (f.id === fundId ? mapFund(fundData) : f)),
      fundSettlements: [...s.fundSettlements, mapSettlement(stData)],
    }));
  },

  updateSettlementDraft: async (settlementId, updates) => {
    const payload: Record<string, unknown> = {};
    if (updates.remainingCash !== undefined) payload.remaining_cash = updates.remainingCash;
    if (updates.attachments !== undefined) payload.attachments = updates.attachments;
    if (updates.differenceReason !== undefined) {
      payload.difference_reason = updates.differenceReason || null;
    }

    const { data, error } = await db
      .from('fund_settlements')
      .update(payload)
      .eq('id', settlementId)
      .select()
      .single();
    if (error) throw error;

    set((s) => ({
      fundSettlements: s.fundSettlements.map((st) =>
        st.id === settlementId ? mapSettlement(data) : st,
      ),
    }));
  },

  submitSettlement: async (fundId, remainingCash, attachments, differenceReason) => {
    const settlement = get().fundSettlements.find((st) => st.fundId === fundId);
    if (!settlement) throw new Error('التسوية غير موجودة');

    const { data, error } = await db
      .from('fund_settlements')
      .update({
        remaining_cash: remainingCash,
        attachments,
        difference_reason: differenceReason?.trim() || null,
        status: 'submitted',
        settlement_date: new Date().toISOString(),
      })
      .eq('id', settlement.id)
      .select()
      .single();
    if (error) throw error;

    set((s) => ({
      fundSettlements: s.fundSettlements.map((st) =>
        st.id === settlement.id ? mapSettlement(data) : st,
      ),
    }));
  },

  approveSettlement: async (settlementId) => {
    const userId = await getUserId();
    const settlement = get().fundSettlements.find((st) => st.id === settlementId);
    if (!settlement) throw new Error('التسوية غير موجودة');
    if (settlement.status !== 'submitted') {
      throw new Error('لا يمكن اعتماد تسوية ليست في حالة "مُرسلة"');
    }
    // A gap between what the fund received, what it spent and the cash
    // returned is never approved silently: fund 4 of Albania was, and 3,211
    // left no trace.
    if (needsReason(settlement.difference) && !settlement.differenceReason?.trim()) {
      throw new Error(`لا يمكن اعتماد تسوية فيها فرق ${settlement.difference.toLocaleString('en-US')} دون سبب مكتوب. أعدها لمعدّها ليوضح أين ذهب المبلغ.`);
    }

    const now = new Date().toISOString();
    const [stRes, fundRes] = await Promise.all([
      db
        .from('fund_settlements')
        .update({
          status: 'approved',
          approved_by: userId,
          approval_date: now,
        })
        .eq('id', settlementId)
        .select()
        .single(),
      db
        .from('project_funds')
        .update({ status: 'settled' })
        .eq('id', settlement.fundId)
        .select()
        .single(),
    ]);
    if (stRes.error) throw stRes.error;
    if (fundRes.error) throw fundRes.error;

    set((s) => ({
      fundSettlements: s.fundSettlements.map((st) =>
        st.id === settlementId ? mapSettlement(stRes.data) : st,
      ),
      projectFunds: s.projectFunds.map((f) =>
        f.id === settlement.fundId ? { ...mapFund(fundRes.data), returnedOut: f.returnedOut } : f,
      ),
    }));

    // The cash left in hand is never dropped: it joins the project's next open
    // fund, or waits for one. Best effort: before 20261028090000 there is
    // nowhere to record it, and the approval itself already stands.
    if (settlement.remainingCash > 0.005) {
      try {
        const { error: pendErr } = await db.from('fund_settlements').update({ carry_status: 'pending' } as never).eq('id', settlementId);
        if (pendErr) throw pendErr;
        set((s) => ({ fundSettlements: s.fundSettlements.map((st) => (st.id === settlementId ? { ...st, carryStatus: 'pending' } : st)) }));
        const fund = get().projectFunds.find((f) => f.id === settlement.fundId);
        const next = get().projectFunds
          .filter((f) => f.projectId === settlement.projectId && f.status !== 'settled' && fund && f.fundNumber > fund.fundNumber)
          .sort((a, b) => a.fundNumber - b.fundNumber)[0];
        if (next) await carryPendingInto(settlement.projectId, next.id);
      } catch (err) {
        logger.warn('store.fund', 'تعذّر ترحيل المتبقي بعد اعتماد التسوية', { settlementId, err: String(err) });
      }
    }
  },

  rejectSettlement: async (settlementId, reason) => {
    const settlement = get().fundSettlements.find((st) => st.id === settlementId);
    if (!settlement) throw new Error('التسوية غير موجودة');
    if (!reason.trim()) throw new Error('يجب كتابة سبب الرفض');

    const [stRes, fundRes] = await Promise.all([
      db
        .from('fund_settlements')
        .update({
          status: 'rejected',
          rejection_reason: reason.trim(),
        })
        .eq('id', settlementId)
        .select()
        .single(),
      db
        .from('project_funds')
        .update({ status: 'acknowledged' })
        .eq('id', settlement.fundId)
        .select()
        .single(),
    ]);
    if (stRes.error) throw stRes.error;
    if (fundRes.error) throw fundRes.error;

    set((s) => ({
      fundSettlements: s.fundSettlements.map((st) =>
        st.id === settlementId ? mapSettlement(stRes.data) : st,
      ),
      projectFunds: s.projectFunds.map((f) =>
        f.id === settlement.fundId ? { ...mapFund(fundRes.data), returnedOut: f.returnedOut } : f,
      ),
    }));
  },

  deleteFund: async (fundId) => {
    // فك ربط المصروفات أولاً (لئلا تبقى fund_id يتيمة)
    const { error: unlinkErr } = await db
      .from('expenses')
      .update({ fund_id: null })
      .eq('fund_id', fundId);
    if (unlinkErr) throw unlinkErr;

    // فك ربط العهد المرتبطة بالدفعة
    const { error: unlinkCust } = await db
      .from('custodies')
      .update({ source_fund_id: null })
      .eq('source_fund_id', fundId);
    if (unlinkCust) throw unlinkCust;

    const linked = get().projectFunds.find((f) => f.id === fundId)?.ledgerEntryId;
    const { error } = await db
      .from('project_funds')
      .delete()
      .eq('id', fundId);
    if (error) throw error;
    // A fund the company sent goes with its ledger movement, or the project
    // would still owe for money it never had.
    if (linked) {
      const { error: entryErr } = await db.from('intercompany_entries').delete().eq('id', linked);
      if (entryErr) logger.warn('store.fund', 'حُذفت الدفعة وبقيت حركة التمويل في حساب المنظومة', { fundId, err: String(entryErr.message) });
    }

    set((s) => ({
      projectFunds: s.projectFunds.filter((f) => f.id !== fundId),
      fundSettlements: s.fundSettlements.filter((st) => st.fundId !== fundId),
      expenses: s.expenses.map((e) => (e.fundId === fundId ? { ...e, fundId: undefined } : e)),
      custodies: s.custodies.map((c) => (c.sourceFundId === fundId ? { ...c, sourceFundId: undefined } : c)),
    }));
  },

  markCarryReturned: async (settlementId) => {
    const { error } = await db.from('fund_settlements').update({ carry_status: 'returned' } as never).eq('id', settlementId);
    if (error) throw error;
    set((s) => ({ fundSettlements: s.fundSettlements.map((st) => (st.id === settlementId ? { ...st, carryStatus: 'returned' } : st)) }));
  },
  };
};
