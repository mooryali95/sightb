/**
 * Company Ledger Service
 * ---------------------------------------------------------------
 * Owns all remote I/O for the company ledger: parties, company_expenses,
 * company_expense_allocations and intercompany_entries
 * (migration 20261016120000_company_ledger.sql).
 *
 * Until the owner applies that migration on Lovable Cloud the tables do not
 * exist; reads then throw `LedgerNotReady`, which the page shows as "waiting
 * for activation" instead of an error.
 */

import { supabase } from '@/integrations/supabase/client';
import type {
  CompanyExpense, CompanyExpenseKind, ExpenseAllocation, IntercompanyEntry, LedgerNode, NodeKind, Party, PartyKind,
} from '@/lib/finance/company-ledger';

// The tables are not in the generated types until Lovable regenerates them
// after the migration is applied; every row is mapped to a typed value below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export class LedgerNotReady extends Error {
  constructor() { super('دفتر الشركة بانتظار تفعيل قاعدة البيانات'); }
}

interface DbError { message?: string; code?: string }
const isMissingTable = (e: DbError | null) => !!e && (e.code === 'PGRST205' || e.code === '42P01' || /does not exist|schema cache/i.test(e.message ?? ''));

function fail(error: DbError | null, fallback: string): never {
  if (isMissingTable(error)) throw new LedgerNotReady();
  throw new Error(error?.message || fallback);
}

type Row = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0);
const node = (kind: unknown, id: unknown): LedgerNode => ({ kind: kind as NodeKind, id: (id as string | null) ?? null });

const toParty = (r: Row): Party => ({
  id: r.id as string, companyId: r.company_id as string, name: r.name as string, kind: r.kind as PartyKind, archived: !!r.archived,
  role: (r.role as string | null | undefined) ?? null, aliases: Array.isArray(r.aliases) ? (r.aliases as string[]) : [],
});
const toExpense = (r: Row): CompanyExpense => ({
  id: r.id as string, companyId: r.company_id as string, date: r.date as string, amount: num(r.amount), description: (r.description as string) ?? '',
  kind: r.kind as CompanyExpenseKind, partyId: (r.party_id as string | null) ?? null, paidByPartyId: (r.paid_by_party_id as string | null) ?? null,
});
const toAllocation = (r: Row): ExpenseAllocation => ({
  id: r.id as string, expenseId: r.expense_id as string, projectId: r.project_id as string, amount: num(r.amount),
  settledInProject: r.settled_in_project === true,
});
const toEntry = (r: Row): IntercompanyEntry => ({
  id: r.id as string, companyId: r.company_id as string, date: r.date as string, amount: num(r.amount), type: r.type as IntercompanyEntry['type'],
  from: node(r.from_kind, r.from_id), to: node(r.to_kind, r.to_id), note: (r.note as string) ?? '',
  dueDate: (r.due_date as string | null) ?? null, salaryExpenseId: (r.salary_expense_id as string | null) ?? null,
});

export interface CompanyLedger { parties: Party[]; expenses: CompanyExpense[]; allocations: ExpenseAllocation[]; entries: IntercompanyEntry[] }

export async function loadCompanyLedger(companyId: string): Promise<CompanyLedger> {
  const [parties, expenses, entries] = await Promise.all([
    db.from('parties').select('*').eq('company_id', companyId).order('name'),
    db.from('company_expenses').select('*').eq('company_id', companyId).order('date', { ascending: false }),
    db.from('intercompany_entries').select('*').eq('company_id', companyId).order('date', { ascending: false }),
  ]);
  for (const r of [parties, expenses, entries]) if (r.error) fail(r.error, 'فشل تحميل دفتر الشركة');
  const ids = (expenses.data as Row[]).map((e) => e.id as string);
  let allocations: Row[] = [];
  if (ids.length > 0) {
    const a = await db.from('company_expense_allocations').select('*').in('expense_id', ids);
    if (a.error) fail(a.error, 'فشل تحميل التحميل على المشاريع');
    allocations = a.data as Row[];
  }
  return {
    parties: (parties.data as Row[]).map(toParty),
    expenses: (expenses.data as Row[]).map(toExpense),
    allocations: allocations.map(toAllocation),
    entries: (entries.data as Row[]).map(toEntry),
  };
}

export async function createParty(input: { companyId: string; name: string; kind: PartyKind; role?: string | null; aliases?: string[] }): Promise<Party> {
  const row: Row = { company_id: input.companyId, name: input.name.trim(), kind: input.kind };
  // Sent only when given, so a database before 20261027090000 still accepts a plain party.
  if (input.role?.trim()) row.role = input.role.trim();
  if (input.aliases?.length) row.aliases = input.aliases;
  const { data, error } = await db.from('parties').insert(row).select().single();
  if (error) fail(error, 'فشل إضافة الطرف');
  return toParty(data);
}

export interface NewCompanyExpense {
  companyId: string; date: string; amount: number; description: string; kind: CompanyExpenseKind;
  partyId: string | null; paidByPartyId: string | null;
  allocations: { projectId: string; amount: number; settledInProject?: boolean }[];
  /** An open advance repaid out of this salary. */
  deduction?: number;
}

/**
 * Records the expense, then its allocations, then the advance repayment
 * deducted from it. If a later step is refused the expense is removed again,
 * so a half-saved expense never stays behind.
 */
export async function createCompanyExpense(input: NewCompanyExpense): Promise<void> {
  const { data, error } = await db.from('company_expenses').insert({
    company_id: input.companyId, date: input.date, amount: input.amount, description: input.description.trim(), kind: input.kind,
    party_id: input.partyId, paid_by_party_id: input.paidByPartyId,
  }).select().single();
  if (error) fail(error, 'فشل حفظ المصروف');
  const id = (data as Row).id as string;
  try {
    const rows = input.allocations.filter((a) => a.amount > 0).map((a) => ({
      expense_id: id, project_id: a.projectId, amount: a.amount,
      // Sent only when set, so a database before 20261026090000 still accepts the row.
      ...(a.settledInProject ? { settled_in_project: true } : {}),
    }));
    if (rows.length > 0) {
      const r = await db.from('company_expense_allocations').insert(rows);
      if (r.error) fail(r.error, 'فشل حفظ التحميل على المشاريع');
    }
    if (input.deduction && input.deduction > 0 && input.partyId) {
      const r = await db.from('intercompany_entries').insert({
        company_id: input.companyId, date: input.date, amount: input.deduction, type: 'repayment',
        from_kind: 'party', from_id: input.partyId, to_kind: 'company', to_id: null,
        note: 'خصم من الراتب', salary_expense_id: id,
      });
      if (r.error) fail(r.error, 'فشل تسجيل خصم السلفة');
    }
  } catch (e) {
    await db.from('company_expenses').delete().eq('id', id);
    throw e;
  }
}

export async function deleteCompanyExpense(id: string): Promise<void> {
  const { error } = await db.from('company_expenses').delete().eq('id', id);
  if (error) fail(error, 'فشل حذف المصروف');
}

export interface NewEntry {
  companyId: string; date: string; amount: number; type: IntercompanyEntry['type'];
  from: LedgerNode; to: LedgerNode; note: string; dueDate: string | null;
}

export async function createEntry(input: NewEntry): Promise<void> {
  const { error } = await db.from('intercompany_entries').insert({
    company_id: input.companyId, date: input.date, amount: input.amount, type: input.type,
    from_kind: input.from.kind, from_id: input.from.id, to_kind: input.to.kind, to_id: input.to.id,
    note: input.note.trim(), due_date: input.dueDate,
  });
  if (error) fail(error, 'فشل حفظ الحركة');
}

export async function deleteEntry(id: string): Promise<void> {
  const { error } = await db.from('intercompany_entries').delete().eq('id', id);
  if (error) fail(error, 'فشل حذف الحركة');
}

export interface ChargedCost {
  allocationId: string; expenseId: string; date: string; kind: CompanyExpenseKind; description: string;
  /** The part charged to this project. */
  amount: number;
  /** The whole company expense it came from. */
  expenseAmount: number;
  /** Already paid by the project from its own spend: shown, not counted again. */
  settledInProject: boolean;
}

/** What the company charged to a project, readable by the project's own team (project_charged_costs). */
export async function listProjectChargedCosts(projectId: string): Promise<ChargedCost[]> {
  const { data, error } = await db.rpc('project_charged_costs', { _project_id: projectId });
  if (error) {
    if (error.code === 'PGRST202' || /function .* does not exist|schema cache/i.test(error.message ?? '')) throw new LedgerNotReady();
    fail(error, 'فشل تحميل التكاليف المحمّلة');
  }
  return ((data ?? []) as Row[]).map((r) => ({
    allocationId: r.allocation_id as string, expenseId: r.expense_id as string, date: r.date as string,
    kind: r.kind as CompanyExpenseKind, description: (r.description as string) ?? '', amount: num(r.amount), expenseAmount: num(r.expense_amount),
    settledInProject: r.settled_in_project === true,
  }));
}
