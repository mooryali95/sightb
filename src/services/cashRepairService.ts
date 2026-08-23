/**
 * cashRepairService
 * ---------------------------------------------------------------
 * إصلاح التحويلات النقدية بلا دفعة أصل، وقراءة سجل التدقيق الخاص بها.
 * الحذف يتم حصراً عبر دالة خادم `repair_orphan_cash_transfer` التي تتحقق
 * من الصلاحية ومن يُتم التحويل، وتُخزّن صورة الأرقام قبل/بعد.
 */
import { db, unwrap } from './db';

export interface CustodySnapshot {
  custody_id: string;
  base_amount: number;
  transfers_in: number;
  available: number;
  spent: number;
  outstanding_advances: number;
  remaining: number;
}

export interface CashTransferRepair {
  id: string;
  projectId: string;
  transferId: string;
  custodyId: string | null;
  custodyName: string | null;
  amount: number;
  transferDate: string | null;
  missingFundId: string | null;
  reason: string;
  before: { transfer?: Record<string, unknown>; custody?: CustodySnapshot } | null;
  after: { custody?: CustodySnapshot } | null;
  performedBy: string;
  performedByEmail: string | null;
  createdAt: string;
}

/**
 * The row as `cash_transfer_repairs` returns it. Naming the shape instead of
 * taking `any` means a column renamed in a migration fails the typecheck here
 * rather than silently mapping to undefined at runtime.
 */
interface CashTransferRepairRow {
  id: string;
  project_id: string;
  transfer_id: string;
  custody_id: string | null;
  custody_name: string | null;
  amount: number | string;
  transfer_date: string | null;
  missing_fund_id: string | null;
  reason: string;
  before_snapshot: CashTransferRepair['before'];
  after_snapshot: CashTransferRepair['after'];
  performed_by: string;
  performed_by_email: string | null;
  created_at: string;
}

function mapRow(r: CashTransferRepairRow): CashTransferRepair {
  return {
    id: r.id,
    projectId: r.project_id,
    transferId: r.transfer_id,
    custodyId: r.custody_id,
    custodyName: r.custody_name,
    amount: Number(r.amount),
    transferDate: r.transfer_date,
    missingFundId: r.missing_fund_id,
    reason: r.reason,
    before: r.before_snapshot ?? null,
    after: r.after_snapshot ?? null,
    performedBy: r.performed_by,
    performedByEmail: r.performed_by_email,
    createdAt: r.created_at,
  };
}

export async function listCashTransferRepairs(projectId: string): Promise<CashTransferRepair[]> {
  const res = await db
    .from('cash_transfer_repairs')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  const rows = unwrap<CashTransferRepairRow[]>(res, 'تعذّر تحميل سجل إصلاح التحويلات');
  return (rows || []).map(mapRow);
}

export async function repairOrphanCashTransfer(
  transferId: string,
  reason: string,
): Promise<{ repair_id: string }> {
  const { data, error } = await db.rpc<{ repair_id: string }>('repair_orphan_cash_transfer', {
    _transfer_id: transferId,
    _reason: reason,
  });
  if (error) {
    throw new Error((error as { message?: string })?.message || 'تعذّر تنفيذ الإصلاح');
  }
  return data as { repair_id: string };
}
