/**
 * Fund Service (initial extraction)
 * ---------------------------------------------------------------
 * Read-side wrappers for project_funds + cash_transfers. Write
 * paths still live in `fundSlice.ts` / `cashTransferSlice.ts` and
 * will migrate here incrementally.
 */

import { supabase } from '@/integrations/supabase/client';

export interface FundRow {
  id: string;
  project_id: string;
  fund_number: number;
  amount: number;
  status: string;
  transfer_date: string | null;
  notes: string | null;
}

export interface CashTransferRow {
  id: string;
  from_fund_id: string;
  to_custody_id: string;
  amount: number;
  transfer_date: string;
  notes: string | null;
}

export async function listFundsForProject(projectId: string): Promise<FundRow[]> {
  const { data, error } = await (supabase as any)
    .from('project_funds')
    .select('*')
    .eq('project_id', projectId)
    .order('fund_number', { ascending: true });
  if (error) throw new Error(error.message || 'فشل تحميل الدفعات');
  return (data ?? []) as FundRow[];
}

export async function getFundById(id: string): Promise<FundRow | null> {
  const { data, error } = await (supabase as any)
    .from('project_funds')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message || 'فشل تحميل الدفعة');
  return (data ?? null) as FundRow | null;
}

export async function listCashTransfersForFund(fundId: string): Promise<CashTransferRow[]> {
  const { data, error } = await (supabase as any)
    .from('cash_transfers')
    .select('*')
    .eq('from_fund_id', fundId)
    .order('transfer_date', { ascending: false });
  if (error) throw new Error(error.message || 'فشل تحميل التحويلات النقدية');
  return (data ?? []) as CashTransferRow[];
}
