/**
 * Payment Request Service (initial extraction)
 * ---------------------------------------------------------------
 * Thin, read-focused wrappers over payment_requests + settlement_events.
 * Write mutations remain in `resourcePayableSlice` until the full
 * migration lands.
 */

import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export async function getPaymentRequestRaw(id: string): Promise<Tables<'payment_requests'> | null> {
  const { data, error } = await supabase
    .from('payment_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message || 'فشل تحميل طلب الصرف');
  return data ?? null;
}

export async function listSettlementEventsRaw(
  paymentRequestId: string,
): Promise<Tables<'settlement_events'>[]> {
  const { data, error } = await supabase
    .from('settlement_events')
    .select('*')
    .eq('payment_request_id', paymentRequestId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message || 'فشل تحميل أحداث التسوية');
  return data ?? [];
}

export async function getExpenseRaw(id: string): Promise<Tables<'expenses'> | null> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message || 'فشل تحميل المصروف');
  return data ?? null;
}
