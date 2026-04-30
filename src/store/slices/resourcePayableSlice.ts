import { StateCreator } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import type {
  ResourceReimbursement,
  PaymentRequest,
  ResourceSettlement,
  ReceiptAttachment,
  ReimbursementStatus,
  PaymentRequestStatus,
  PaymentRequestType,
  PaymentPriority,
  PaymentMethod,
  ResourceSettlementStatus,
} from '@/types/project';
import { getUserId } from '../helpers';
import type { AppState } from '../useStore';

export interface ResourcePayableSlice {
  reimbursements: ResourceReimbursement[];
  paymentRequests: PaymentRequest[];
  resourceSettlements: ResourceSettlement[];

  loadResourcePayablesForProject: (projectId: string) => Promise<void>;

  // Reimbursements
  createReimbursement: (input: {
    projectId: string;
    resourceId: string;
    category: string;
    description: string;
    amount: number;
    expenseDate: string;
    receiptAttachments?: ReceiptAttachment[];
    budgetItemId?: string;
    notes?: string;
  }) => Promise<string>;
  updateReimbursement: (id: string, updates: Partial<ResourceReimbursement>) => Promise<void>;
  approveReimbursement: (id: string) => Promise<void>;
  rejectReimbursement: (id: string, reason: string) => Promise<void>;
  deleteReimbursement: (id: string) => Promise<void>;

  // Payment Requests
  createPaymentRequest: (input: {
    projectId: string;
    resourceId: string;
    requestType: PaymentRequestType;
    amount: number;
    description: string;
    justification?: string;
    linkedReimbursementIds?: string[];
    priority?: PaymentPriority;
  }) => Promise<string>;
  submitPaymentRequest: (id: string) => Promise<void>;
  reviewPaymentRequest: (id: string, notes?: string) => Promise<void>;
  approvePaymentRequest: (id: string, notes?: string) => Promise<void>;
  rejectPaymentRequest: (id: string, reason: string) => Promise<void>;
  schedulePaymentRequest: (id: string, scheduledDate: string) => Promise<void>;
  payPaymentRequest: (id: string, input: {
    paidDate: string;
    paymentMethod: PaymentMethod;
    paymentReference?: string;
    paymentAttachments?: ReceiptAttachment[];
  }) => Promise<void>;
  cancelPaymentRequest: (id: string) => Promise<void>;
  deletePaymentRequest: (id: string) => Promise<void>;

  // Settlements
  createResourceSettlement: (input: {
    resourceId: string;
    projectId?: string;
    periodFrom?: string;
    periodTo?: string;
    linkedReimbursementIds: string[];
    linkedPaymentIds: string[];
    totalOwed: number;
    totalPaid: number;
    settlementTextAr?: string;
    notes?: string;
  }) => Promise<string>;
  updateResourceSettlement: (id: string, updates: Partial<ResourceSettlement>) => Promise<void>;
  signResourceSettlement: (id: string, signatureAttachment?: string) => Promise<void>;
  cancelResourceSettlement: (id: string) => Promise<void>;
  deleteResourceSettlement: (id: string) => Promise<void>;
}

function mapReimb(d: any): ResourceReimbursement {
  return {
    id: d.id,
    projectId: d.project_id,
    resourceId: d.resource_id,
    category: d.category,
    description: d.description,
    amount: Number(d.amount),
    expenseDate: d.expense_date,
    receiptAttachments: Array.isArray(d.receipt_attachments) ? d.receipt_attachments : [],
    budgetItemId: d.budget_item_id || undefined,
    status: d.status as ReimbursementStatus,
    notes: d.notes || undefined,
    rejectionReason: d.rejection_reason || undefined,
    approvedBy: d.approved_by || undefined,
    approvedAt: d.approved_at || undefined,
    paymentRequestId: d.payment_request_id || undefined,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  };
}

function mapReq(d: any): PaymentRequest {
  return {
    id: d.id,
    projectId: d.project_id,
    resourceId: d.resource_id,
    requestType: d.request_type as PaymentRequestType,
    amount: Number(d.amount),
    currency: d.currency || 'ر.س',
    description: d.description,
    justification: d.justification || undefined,
    linkedReimbursementIds: Array.isArray(d.linked_reimbursement_ids) ? d.linked_reimbursement_ids : [],
    linkedFundId: d.linked_fund_id || undefined,
    priority: d.priority as PaymentPriority,
    status: d.status as PaymentRequestStatus,
    requestedBy: d.requested_by,
    requestedAt: d.requested_at || undefined,
    reviewedBy: d.reviewed_by || undefined,
    reviewedAt: d.reviewed_at || undefined,
    reviewNotes: d.review_notes || undefined,
    approvedBy: d.approved_by || undefined,
    approvedAt: d.approved_at || undefined,
    approvalNotes: d.approval_notes || undefined,
    scheduledDate: d.scheduled_date || undefined,
    paidDate: d.paid_date || undefined,
    paymentMethod: (d.payment_method as PaymentMethod) || undefined,
    paymentReference: d.payment_reference || undefined,
    paymentAttachments: Array.isArray(d.payment_attachments) ? d.payment_attachments : [],
    rejectionReason: d.rejection_reason || undefined,
    autoCreatedExpenseId: d.auto_created_expense_id || undefined,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  };
}

function mapSettle(d: any): ResourceSettlement {
  return {
    id: d.id,
    resourceId: d.resource_id,
    projectId: d.project_id || undefined,
    periodFrom: d.period_from || undefined,
    periodTo: d.period_to || undefined,
    totalOwed: Number(d.total_owed ?? 0),
    totalPaid: Number(d.total_paid ?? 0),
    balance: Number(d.balance ?? 0),
    linkedReimbursementIds: Array.isArray(d.linked_reimbursement_ids) ? d.linked_reimbursement_ids : [],
    linkedPaymentIds: Array.isArray(d.linked_payment_ids) ? d.linked_payment_ids : [],
    settlementTextAr: d.settlement_text_ar || undefined,
    status: d.status as ResourceSettlementStatus,
    signedByResource: !!d.signed_by_resource,
    signatureAttachment: d.signature_attachment || undefined,
    signedAt: d.signed_at || undefined,
    notes: d.notes || undefined,
    createdBy: d.created_by,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  };
}

export const createResourcePayableSlice: StateCreator<AppState, [], [], ResourcePayableSlice> = (set, get) => ({
  reimbursements: [],
  paymentRequests: [],
  resourceSettlements: [],

  loadResourcePayablesForProject: async (projectId) => {
    const [rRes, pRes, sRes] = await Promise.all([
      (supabase as any).from('resource_reimbursements').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      (supabase as any).from('payment_requests').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      (supabase as any).from('resource_settlements').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
    ]);
    if (rRes.error) throw rRes.error;
    if (pRes.error) throw pRes.error;
    if (sRes.error) throw sRes.error;

    set((s) => ({
      reimbursements: [
        ...s.reimbursements.filter((r) => r.projectId !== projectId),
        ...(rRes.data || []).map(mapReimb),
      ],
      paymentRequests: [
        ...s.paymentRequests.filter((r) => r.projectId !== projectId),
        ...(pRes.data || []).map(mapReq),
      ],
      resourceSettlements: [
        ...s.resourceSettlements.filter((r) => r.projectId !== projectId),
        ...(sRes.data || []).map(mapSettle),
      ],
    }));
  },

  // ─── Reimbursements ───
  createReimbursement: async (input) => {
    const userId = await getUserId();
    const { data, error } = await (supabase as any)
      .from('resource_reimbursements')
      .insert({
        project_id: input.projectId,
        resource_id: input.resourceId,
        category: input.category,
        description: input.description.trim(),
        amount: input.amount,
        expense_date: input.expenseDate,
        receipt_attachments: input.receiptAttachments || [],
        budget_item_id: input.budgetItemId || null,
        notes: input.notes?.trim() || null,
        user_id: userId,
        status: 'pending_review',
      })
      .select()
      .single();
    if (error) throw error;
    const m = mapReimb(data);
    set((s) => ({ reimbursements: [m, ...s.reimbursements] }));
    return m.id;
  },

  updateReimbursement: async (id, updates) => {
    const payload: Record<string, unknown> = {};
    if (updates.category !== undefined) payload.category = updates.category;
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.amount !== undefined) payload.amount = updates.amount;
    if (updates.expenseDate !== undefined) payload.expense_date = updates.expenseDate;
    if (updates.receiptAttachments !== undefined) payload.receipt_attachments = updates.receiptAttachments;
    if (updates.notes !== undefined) payload.notes = updates.notes || null;
    if (updates.budgetItemId !== undefined) payload.budget_item_id = updates.budgetItemId || null;

    const { data, error } = await (supabase as any)
      .from('resource_reimbursements').update(payload).eq('id', id).select().single();
    if (error) throw error;
    set((s) => ({ reimbursements: s.reimbursements.map((r) => r.id === id ? mapReimb(data) : r) }));
  },

  approveReimbursement: async (id) => {
    const userId = await getUserId();
    const { data, error } = await (supabase as any)
      .from('resource_reimbursements')
      .update({ status: 'approved', approved_by: userId, approved_at: new Date().toISOString(), rejection_reason: null })
      .eq('id', id).select().single();
    if (error) throw error;
    set((s) => ({ reimbursements: s.reimbursements.map((r) => r.id === id ? mapReimb(data) : r) }));
  },

  rejectReimbursement: async (id, reason) => {
    if (!reason.trim()) throw new Error('سبب الرفض مطلوب');
    const userId = await getUserId();
    const { data, error } = await (supabase as any)
      .from('resource_reimbursements')
      .update({ status: 'rejected', rejection_reason: reason.trim(), approved_by: userId, approved_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) throw error;
    set((s) => ({ reimbursements: s.reimbursements.map((r) => r.id === id ? mapReimb(data) : r) }));
  },

  deleteReimbursement: async (id) => {
    const { error } = await (supabase as any).from('resource_reimbursements').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({ reimbursements: s.reimbursements.filter((r) => r.id !== id) }));
  },

  // ─── Payment Requests ───
  createPaymentRequest: async (input) => {
    const userId = await getUserId();
    const { data, error } = await (supabase as any)
      .from('payment_requests')
      .insert({
        project_id: input.projectId,
        resource_id: input.resourceId,
        request_type: input.requestType,
        amount: input.amount,
        description: input.description.trim(),
        justification: input.justification?.trim() || null,
        linked_reimbursement_ids: input.linkedReimbursementIds || [],
        priority: input.priority || 'normal',
        status: 'draft',
        requested_by: userId,
        user_id: userId,
      })
      .select().single();
    if (error) throw error;
    const m = mapReq(data);
    set((s) => ({ paymentRequests: [m, ...s.paymentRequests] }));
    return m.id;
  },

  submitPaymentRequest: async (id) => {
    const { data, error } = await (supabase as any)
      .from('payment_requests')
      .update({ status: 'submitted', requested_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) throw error;
    set((s) => ({ paymentRequests: s.paymentRequests.map((r) => r.id === id ? mapReq(data) : r) }));
  },

  reviewPaymentRequest: async (id, notes) => {
    const userId = await getUserId();
    const { data, error } = await (supabase as any)
      .from('payment_requests')
      .update({ status: 'under_review', reviewed_by: userId, reviewed_at: new Date().toISOString(), review_notes: notes?.trim() || null })
      .eq('id', id).select().single();
    if (error) throw error;
    set((s) => ({ paymentRequests: s.paymentRequests.map((r) => r.id === id ? mapReq(data) : r) }));
  },

  approvePaymentRequest: async (id, notes) => {
    const userId = await getUserId();
    const { data, error } = await (supabase as any)
      .from('payment_requests')
      .update({ status: 'approved', approved_by: userId, approved_at: new Date().toISOString(), approval_notes: notes?.trim() || null })
      .eq('id', id).select().single();
    if (error) throw error;
    set((s) => ({ paymentRequests: s.paymentRequests.map((r) => r.id === id ? mapReq(data) : r) }));
  },

  rejectPaymentRequest: async (id, reason) => {
    if (!reason.trim()) throw new Error('سبب الرفض مطلوب');
    const userId = await getUserId();
    const { data, error } = await (supabase as any)
      .from('payment_requests')
      .update({ status: 'rejected', rejection_reason: reason.trim(), approved_by: userId, approved_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) throw error;
    set((s) => ({ paymentRequests: s.paymentRequests.map((r) => r.id === id ? mapReq(data) : r) }));
  },

  schedulePaymentRequest: async (id, scheduledDate) => {
    const { data, error } = await (supabase as any)
      .from('payment_requests')
      .update({ status: 'scheduled', scheduled_date: scheduledDate })
      .eq('id', id).select().single();
    if (error) throw error;
    set((s) => ({ paymentRequests: s.paymentRequests.map((r) => r.id === id ? mapReq(data) : r) }));
  },

  payPaymentRequest: async (id, input) => {
    const { data, error } = await (supabase as any)
      .from('payment_requests')
      .update({
        status: 'paid',
        paid_date: input.paidDate,
        payment_method: input.paymentMethod,
        payment_reference: input.paymentReference?.trim() || null,
        payment_attachments: input.paymentAttachments || [],
      })
      .eq('id', id).select().single();
    if (error) throw error;
    // Reload reimbursements for this project — DB trigger may have changed them
    const req = mapReq(data);
    set((s) => ({ paymentRequests: s.paymentRequests.map((r) => r.id === id ? req : r) }));
    try { await get().loadResourcePayablesForProject(req.projectId); } catch (e) { console.warn(e); }
  },

  cancelPaymentRequest: async (id) => {
    const { data, error } = await (supabase as any)
      .from('payment_requests').update({ status: 'cancelled' }).eq('id', id).select().single();
    if (error) throw error;
    set((s) => ({ paymentRequests: s.paymentRequests.map((r) => r.id === id ? mapReq(data) : r) }));
  },

  deletePaymentRequest: async (id) => {
    const { error } = await (supabase as any).from('payment_requests').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({ paymentRequests: s.paymentRequests.filter((r) => r.id !== id) }));
  },

  // ─── Settlements ───
  createResourceSettlement: async (input) => {
    const userId = await getUserId();
    const balance = input.totalOwed - input.totalPaid;
    const { data, error } = await (supabase as any)
      .from('resource_settlements')
      .insert({
        resource_id: input.resourceId,
        project_id: input.projectId || null,
        period_from: input.periodFrom || null,
        period_to: input.periodTo || null,
        total_owed: input.totalOwed,
        total_paid: input.totalPaid,
        balance,
        linked_reimbursement_ids: input.linkedReimbursementIds,
        linked_payment_ids: input.linkedPaymentIds,
        settlement_text_ar: input.settlementTextAr || null,
        notes: input.notes?.trim() || null,
        status: 'draft',
        created_by: userId,
        user_id: userId,
      })
      .select().single();
    if (error) throw error;
    const m = mapSettle(data);
    set((s) => ({ resourceSettlements: [m, ...s.resourceSettlements] }));
    return m.id;
  },

  updateResourceSettlement: async (id, updates) => {
    const payload: Record<string, unknown> = {};
    if (updates.periodFrom !== undefined) payload.period_from = updates.periodFrom || null;
    if (updates.periodTo !== undefined) payload.period_to = updates.periodTo || null;
    if (updates.totalOwed !== undefined) payload.total_owed = updates.totalOwed;
    if (updates.totalPaid !== undefined) payload.total_paid = updates.totalPaid;
    if (updates.totalOwed !== undefined || updates.totalPaid !== undefined) {
      const cur = get().resourceSettlements.find((s) => s.id === id);
      const owed = updates.totalOwed ?? cur?.totalOwed ?? 0;
      const paid = updates.totalPaid ?? cur?.totalPaid ?? 0;
      payload.balance = owed - paid;
    }
    if (updates.settlementTextAr !== undefined) payload.settlement_text_ar = updates.settlementTextAr || null;
    if (updates.notes !== undefined) payload.notes = updates.notes || null;
    if (updates.linkedReimbursementIds !== undefined) payload.linked_reimbursement_ids = updates.linkedReimbursementIds;
    if (updates.linkedPaymentIds !== undefined) payload.linked_payment_ids = updates.linkedPaymentIds;

    const { data, error } = await (supabase as any)
      .from('resource_settlements').update(payload).eq('id', id).select().single();
    if (error) throw error;
    set((s) => ({ resourceSettlements: s.resourceSettlements.map((r) => r.id === id ? mapSettle(data) : r) }));
  },

  signResourceSettlement: async (id, signatureAttachment) => {
    const { data, error } = await (supabase as any)
      .from('resource_settlements')
      .update({
        status: 'signed',
        signed_by_resource: true,
        signature_attachment: signatureAttachment || null,
        signed_at: new Date().toISOString(),
      })
      .eq('id', id).select().single();
    if (error) throw error;
    set((s) => ({ resourceSettlements: s.resourceSettlements.map((r) => r.id === id ? mapSettle(data) : r) }));
  },

  cancelResourceSettlement: async (id) => {
    const { data, error } = await (supabase as any)
      .from('resource_settlements').update({ status: 'cancelled' }).eq('id', id).select().single();
    if (error) throw error;
    set((s) => ({ resourceSettlements: s.resourceSettlements.map((r) => r.id === id ? mapSettle(data) : r) }));
  },

  deleteResourceSettlement: async (id) => {
    const { error } = await (supabase as any).from('resource_settlements').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({ resourceSettlements: s.resourceSettlements.filter((r) => r.id !== id) }));
  },
});
