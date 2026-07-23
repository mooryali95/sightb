/**
 * Payment Request Service (initial extraction)
 * ---------------------------------------------------------------
 * Thin, read-focused wrappers over payment_requests + settlement_events.
 * Write mutations remain in `resourcePayableSlice` until the full
 * migration lands.
 */

import { supabase } from '@/integrations/supabase/client';

export async function getPaymentRequestRaw(id: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await (supabase as any)
    .from('payment_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message || 'فشل تحميل طلب الصرف');
  return (data ?? null) as Record<string, unknown> | null;
}

export async function listSettlementEventsRaw(
  paymentRequestId: string,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await (supabase as any)
    .from('settlement_events')
    .select('*')
    .eq('payment_request_id', paymentRequestId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message || 'فشل تحميل أحداث التسوية');
  return (data ?? []) as Record<string, unknown>[];
}

export async function getExpenseRaw(id: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await (supabase as any)
    .from('expenses')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message || 'فشل تحميل المصروف');
  return (data ?? null) as Record<string, unknown> | null;
}
