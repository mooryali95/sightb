/**
 * The company's registry of people, vendors and entities (public.parties,
 * extended by 20261027090000): editing an entry, and linking the expenses
 * that name someone to the entry that stands for them.
 */
import { supabase } from '@/integrations/supabase/client';
import { LedgerNotReady } from '@/services/companyLedgerService';
import type { Party, PartyKind } from '@/lib/finance/company-ledger';

// The generated types do not know party_id, role or aliases until Lovable regenerates them.
const db = supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

function fail(error: { code?: string; message?: string }, fallback: string): never {
  if (error.code === '42703' || error.code === 'PGRST204' || /column .* does not exist|schema cache/i.test(error.message ?? '')) {
    throw new LedgerNotReady();
  }
  throw new Error(error.message || fallback);
}

export async function updateParty(id: string, patch: { name?: string; kind?: PartyKind; role?: string | null; aliases?: string[]; archived?: boolean }): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.kind !== undefined) row.kind = patch.kind;
  if (patch.role !== undefined) row.role = patch.role?.trim() || null;
  if (patch.aliases !== undefined) row.aliases = [...new Set(patch.aliases.map((a) => a.trim()).filter(Boolean))];
  if (patch.archived !== undefined) row.archived = patch.archived;
  const { error } = await db.from('parties').update(row).eq('id', id);
  if (error) fail(error, 'فشل حفظ بيانات المورد');
}

/**
 * Links expenses to a registry entry and remembers the spellings they used,
 * so the next expense written the same way is recognised at once.
 */
export async function linkExpensesToParty(input: { party: Party; expenseIds: string[]; spellings: string[] }): Promise<void> {
  if (input.expenseIds.length === 0) return;
  for (let i = 0; i < input.expenseIds.length; i += 100) {
    const { error } = await db.from('expenses').update({ party_id: input.party.id }).in('id', input.expenseIds.slice(i, i + 100));
    if (error) fail(error, 'فشل ربط المصروفات');
  }
  const known = new Set([input.party.name, ...(input.party.aliases ?? [])].map((s) => s.trim()));
  const fresh = input.spellings.map((s) => s.trim()).filter((s) => s && !known.has(s));
  if (fresh.length) await updateParty(input.party.id, { aliases: [...(input.party.aliases ?? []), ...fresh] });
}

/** Undoes a link: the expenses keep their written name and lose the entry. */
export async function unlinkExpenses(expenseIds: string[]): Promise<void> {
  if (expenseIds.length === 0) return;
  const { error } = await db.from('expenses').update({ party_id: null }).in('id', expenseIds);
  if (error) fail(error, 'فشل فك الربط');
}
