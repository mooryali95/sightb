/**
 * projectSummaryService
 * ---------------------------------------------------------------
 * Server-computed financial truth for a project.
 *
 * The browser used to recompute every KPI from raw rows, which made it
 * possible for two screens to disagree. `project_financial_summary`
 * computes the same numbers inside Postgres — the same place the
 * integrity triggers live — so the UI can display *and verify* them.
 */

import { db } from './db';

export interface ServerProjectSummary {
  projectId: string;
  currency: string;
  computedAt: string;
  contractValue: number;
  approvedChangeOrders: number;
  revisedContractValue: number;
  collectedRevenue: number;
  invoicedRevenue: number;
  totalActualExpenses: number;
  rejectedExpenses: number;
  totalTransferredFunds: number;
  totalCustodyDraw: number;
  totalCashTransfersOut: number;
  outstandingAdvances: number;
  settledAmount: number;
  fundDirectSpent: number;
  outstandingPayablesResource: number;
  outstandingPayablesVendor: number;
  remainingFunds: number;
  custodyAvailable: number;
  custodySpent: number;
  custodyOutstandingAdvances: number;
  custodyInHand: number;
  profit: number;
  marginPercent: number;
}


const num = (v: unknown) => Number(v ?? 0);

function mapSummary(raw: Record<string, unknown>): ServerProjectSummary {
  return {
    projectId: String(raw.project_id ?? ''),
    currency: String(raw.currency ?? 'SAR'),
    computedAt: String(raw.computed_at ?? new Date().toISOString()),
    contractValue: num(raw.contract_value),
    approvedChangeOrders: num(raw.approved_change_orders),
    revisedContractValue: num(raw.revised_contract_value),
    collectedRevenue: num(raw.collected_revenue),
    invoicedRevenue: num(raw.invoiced_revenue),
    totalActualExpenses: num(raw.total_actual_expenses),
    rejectedExpenses: num(raw.rejected_expenses),
    totalTransferredFunds: num(raw.total_transferred_funds),
    totalCustodyDraw: num(raw.total_custody_draw),
    totalCashTransfersOut: num(raw.total_cash_transfers_out),
    outstandingAdvances: num(raw.outstanding_advances),
    settledAmount: num(raw.settled_amount),
    fundDirectSpent: num(raw.fund_direct_spent),
    outstandingPayablesResource: num(raw.outstanding_payables_resource),
    outstandingPayablesVendor: num(raw.outstanding_payables_vendor),
    remainingFunds: num(raw.remaining_funds),
    custodyAvailable: num(raw.custody_available),
    custodySpent: num(raw.custody_spent),
    custodyOutstandingAdvances: num(raw.custody_outstanding_advances),
    custodyInHand: num(raw.custody_in_hand),

    profit: num(raw.profit),
    marginPercent: num(raw.margin_percent),
  };
}

const ERROR_MAP: Record<string, string> = {
  unauthenticated: 'يجب تسجيل الدخول لعرض الملخص المالي.',
  insufficient_permission: 'لا تملك صلاحية عرض الملخص المالي لهذا المشروع.',
  project_not_found: 'المشروع غير موجود.',
};

export async function fetchProjectFinancialSummary(projectId: string): Promise<ServerProjectSummary> {
  const { data, error } = await db.rpc('project_financial_summary', { _project_id: projectId });
  if (error) {
    const message = (error as { message?: string })?.message ?? '';
    const key = Object.keys(ERROR_MAP).find((k) => message.includes(k));
    throw new Error(key ? ERROR_MAP[key] : (message || 'تعذّر حساب الملخص المالي.'));
  }
  return mapSummary((data ?? {}) as Record<string, unknown>);
}

