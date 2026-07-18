import { StateCreator } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import {
  ProjectFund,
  FundSettlement,
  FundSettlementAttachment,
  FundStatus,
  SettlementStatus,
} from '@/types/project';
import { getUserId } from '../helpers';
import type { AppState } from '../useStore';

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
    options?: { emergency?: boolean; emergencyReason?: string },
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
}

function mapFund(d: any): ProjectFund {
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
  };
}

function mapSettlement(d: any): FundSettlement {
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
    attachments: Array.isArray(d.attachments) ? d.attachments : [],
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  };
}

export const createFundSlice: StateCreator<AppState, [], [], FundSlice> = (set, get) => ({
  projectFunds: [],
  fundSettlements: [],

  loadFundsForProject: async (projectId) => {
    const [fundsRes, settlementsRes] = await Promise.all([
      (supabase as any)
        .from('project_funds')
        .select('*')
        .eq('project_id', projectId)
        .order('fund_number', { ascending: true }),
      (supabase as any)
        .from('fund_settlements')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false }),
    ]);
    if (fundsRes.error) throw fundsRes.error;
    if (settlementsRes.error) throw settlementsRes.error;

    const funds = (fundsRes.data || []).map(mapFund);
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
  },

  createFund: async (projectId, amount, transferDate, notes, options) => {
    const userId = await getUserId();
    const isEmergency = !!options?.emergency;
    const emergencyReason = options?.emergencyReason?.trim();

    if (isEmergency && !emergencyReason) {
      throw new Error('سبب الدفعة الاستثنائية مطلوب');
    }

    // إعادة تحميل من DB لمنع state stale
    try { await get().loadFundsForProject(projectId); } catch {}

    const projectFunds = get().projectFunds.filter((f) => f.projectId === projectId);
    const unsettled = projectFunds.find((f) => f.status !== 'settled');
    if (unsettled && !isEmergency) {
      throw new Error(
        `لا يمكن إنشاء دفعة جديدة قبل تسوية الدفعة رقم ${unsettled.fundNumber}`,
      );
    }

    // احسب nextNumber من DB مباشرة (مصدر الحقيقة)
    const computeNext = async (): Promise<number> => {
      const { data, error } = await (supabase as any)
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
      return await (supabase as any)
        .from('project_funds')
        .insert({
          project_id: projectId,
          fund_number: n,
          amount,
          transfer_date: transferDate,
          notes: finalNotes,
          created_by: userId,
          status: 'transferred',
        })
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

    set((s) => ({ projectFunds: [...s.projectFunds, mapped] }));
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
    const { data: fundData, error: fundErr } = await (supabase as any)
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
    const { data: stData, error: stErr } = await (supabase as any)
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

    const { data, error } = await (supabase as any)
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

    const { data, error } = await (supabase as any)
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

    const now = new Date().toISOString();
    const [stRes, fundRes] = await Promise.all([
      (supabase as any)
        .from('fund_settlements')
        .update({
          status: 'approved',
          approved_by: userId,
          approval_date: now,
        })
        .eq('id', settlementId)
        .select()
        .single(),
      (supabase as any)
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
        f.id === settlement.fundId ? mapFund(fundRes.data) : f,
      ),
    }));
  },

  rejectSettlement: async (settlementId, reason) => {
    const settlement = get().fundSettlements.find((st) => st.id === settlementId);
    if (!settlement) throw new Error('التسوية غير موجودة');
    if (!reason.trim()) throw new Error('يجب كتابة سبب الرفض');

    const [stRes, fundRes] = await Promise.all([
      (supabase as any)
        .from('fund_settlements')
        .update({
          status: 'rejected',
          rejection_reason: reason.trim(),
        })
        .eq('id', settlementId)
        .select()
        .single(),
      (supabase as any)
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
        f.id === settlement.fundId ? mapFund(fundRes.data) : f,
      ),
    }));
  },

  deleteFund: async (fundId) => {
    // فك ربط المصروفات أولاً (لئلا تبقى fund_id يتيمة)
    const { error: unlinkErr } = await (supabase as any)
      .from('expenses')
      .update({ fund_id: null })
      .eq('fund_id', fundId);
    if (unlinkErr) throw unlinkErr;

    // فك ربط العهد المرتبطة بالدفعة
    const { error: unlinkCust } = await (supabase as any)
      .from('custodies')
      .update({ source_fund_id: null })
      .eq('source_fund_id', fundId);
    if (unlinkCust) throw unlinkCust;

    const { error } = await (supabase as any)
      .from('project_funds')
      .delete()
      .eq('id', fundId);
    if (error) throw error;

    set((s) => ({
      projectFunds: s.projectFunds.filter((f) => f.id !== fundId),
      fundSettlements: s.fundSettlements.filter((st) => st.fundId !== fundId),
      expenses: s.expenses.map((e) => (e.fundId === fundId ? { ...e, fundId: undefined } : e)),
      custodies: s.custodies.map((c) => (c.sourceFundId === fundId ? { ...c, sourceFundId: undefined } as any : c)),
    }));
  },
});
