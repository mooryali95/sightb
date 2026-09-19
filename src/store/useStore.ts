import { create } from 'zustand';
import { createLoadSlice, LoadSlice } from './slices/loadSlice';
import { createCompanySlice, CompanySlice } from './slices/companySlice';
import { createProjectSlice, ProjectSlice } from './slices/projectSlice';
import { createBudgetSlice, BudgetSlice } from './slices/budgetSlice';
import { createTrackingSlice, TrackingSlice } from './slices/trackingSlice';
import { createBaselineSlice, BaselineSlice } from './slices/baselineSlice';
import { createBudgetAmendmentSlice, BudgetAmendmentSlice } from './slices/budgetAmendmentSlice';
import { createFundSlice, FundSlice } from './slices/fundSlice';
import { createResourcePayableSlice, ResourcePayableSlice } from './slices/resourcePayableSlice';
import { createCashTransferSlice, CashTransferSlice } from './slices/cashTransferSlice';
import { flagOutstandingAdvances } from './outstandingAdvances';

/**
 * The row the audit trigger captured, as a loose bag: the fields the audit
 * section renders are named, the rest stay unknown.
 */
export interface AuditRecord {
  name?: string; title?: string; description?: string; resource_name?: string;
  amount?: number; planned_amount?: number; category?: string;
  old?: Record<string, unknown>; new?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AuditLogEntry {
  id: string; userId: string; action: string; tableName: string;
  recordId: string; recordData: AuditRecord | null; projectId?: string; createdAt: string;
}

export type AppState = LoadSlice & CompanySlice & ProjectSlice & BudgetSlice & TrackingSlice & BaselineSlice & BudgetAmendmentSlice & FundSlice & ResourcePayableSlice & CashTransferSlice;

export const useStore = create<AppState>()((...a) => ({
  ...createLoadSlice(...a),
  ...createCompanySlice(...a),
  ...createProjectSlice(...a),
  ...createBudgetSlice(...a),
  ...createTrackingSlice(...a),
  ...createBaselineSlice(...a),
  ...createBudgetAmendmentSlice(...a),
  ...createFundSlice(...a),
  ...createResourcePayableSlice(...a),
  ...createCashTransferSlice(...a),
}));

// The outstanding-advance flag on an expense is not a column: it follows the
// paid advance that created the expense. Whenever either side changes, the
// flags are re-derived; when nothing differs the rows keep their identity and
// no further update is made, so this cannot loop.
useStore.subscribe((state, prev) => {
  if (state.expenses === prev.expenses && state.paymentRequests === prev.paymentRequests) return;
  const flagged = flagOutstandingAdvances(state.expenses, state.paymentRequests);
  if (flagged.some((e, i) => e !== (state.expenses ?? [])[i])) useStore.setState({ expenses: flagged });
});
