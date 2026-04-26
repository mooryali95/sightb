import { create } from 'zustand';
import { createLoadSlice, LoadSlice } from './slices/loadSlice';
import { createCompanySlice, CompanySlice } from './slices/companySlice';
import { createProjectSlice, ProjectSlice } from './slices/projectSlice';
import { createBudgetSlice, BudgetSlice } from './slices/budgetSlice';
import { createTrackingSlice, TrackingSlice } from './slices/trackingSlice';
import { createBaselineSlice, BaselineSlice } from './slices/baselineSlice';
import { createBudgetAmendmentSlice, BudgetAmendmentSlice } from './slices/budgetAmendmentSlice';

export interface AuditLogEntry {
  id: string; userId: string; action: string; tableName: string;
  recordId: string; recordData: any; projectId?: string; createdAt: string;
}

export type AppState = LoadSlice & CompanySlice & ProjectSlice & BudgetSlice & TrackingSlice & BaselineSlice & BudgetAmendmentSlice;

export const useStore = create<AppState>()((...a) => ({
  ...createLoadSlice(...a),
  ...createCompanySlice(...a),
  ...createProjectSlice(...a),
  ...createBudgetSlice(...a),
  ...createTrackingSlice(...a),
  ...createBaselineSlice(...a),
  ...createBudgetAmendmentSlice(...a),
}));
