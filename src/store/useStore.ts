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

export interface AuditLogEntry {
  id: string; userId: string; action: string; tableName: string;
  recordId: string; recordData: any; projectId?: string; createdAt: string;
}

export type AppState = LoadSlice & CompanySlice & ProjectSlice & BudgetSlice & TrackingSlice & BaselineSlice & BudgetAmendmentSlice & FundSlice & ResourcePayableSlice;

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
}));
