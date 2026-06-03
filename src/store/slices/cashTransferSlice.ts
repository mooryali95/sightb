import { StateCreator } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import type { CashTransfer } from '@/types/project';
import { getUserId } from '../helpers';
import type { AppState } from '../useStore';

export interface CashTransferSlice {
  cashTransfers: CashTransfer[];
  loadCashTransfersForProject: (projectId: string) => Promise<void>;
  createCashTransfer: (input: {
    projectId: string;
    fromFundId: string;
    toCustodyId: string;
    amount: number;
    transferDate: string;
    notes?: string;
  }) => Promise<string>;
  deleteCashTransfer: (id: string) => Promise<void>;
}

function mapCashTransfer(d: any): CashTransfer {
  return {
    id: d.id,
    projectId: d.project_id,
    fromFundId: d.from_fund_id,
    toCustodyId: d.to_custody_id,
    amount: Number(d.amount),
    transferDate: d.transfer_date,
    notes: d.notes || undefined,
    createdAt: d.created_at,
  };
}

export const createCashTransferSlice: StateCreator<AppState, [], [], CashTransferSlice> = (set, get) => ({
  cashTransfers: [],

  loadCashTransfersForProject: async (projectId) => {
    const { data, error } = await (supabase as any)
      .from('cash_transfers')
      .select('*')
      .eq('project_id', projectId)
      .order('transfer_date', { ascending: false });
    if (error) throw error;
    const mapped = (data || []).map(mapCashTransfer);
    set((s) => ({
      cashTransfers: [
        ...s.cashTransfers.filter((t) => t.projectId !== projectId),
        ...mapped,
      ],
    }));
  },

  createCashTransfer: async (input) => {
    const userId = await getUserId();
    const { data, error } = await (supabase as any)
      .from('cash_transfers')
      .insert({
        project_id: input.projectId,
        from_fund_id: input.fromFundId,
        to_custody_id: input.toCustodyId,
        amount: input.amount,
        transfer_date: input.transferDate,
        notes: input.notes?.trim() || null,
        user_id: userId,
      })
      .select()
      .single();
    if (error) throw error;
    const mapped = mapCashTransfer(data);
    set((s) => ({ cashTransfers: [mapped, ...s.cashTransfers] }));
    return mapped.id;
  },

  deleteCashTransfer: async (id) => {
    const { error } = await (supabase as any)
      .from('cash_transfers')
      .delete()
      .eq('id', id);
    if (error) throw error;
    set((s) => ({ cashTransfers: s.cashTransfers.filter((t) => t.id !== id) }));
  },
});
