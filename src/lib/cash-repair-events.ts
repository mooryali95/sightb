/**
 * cash-repair-events
 * ------------------------------------------------------------------
 * مخزن خفيف (in-memory) لأحدث عمليات إصلاح التحويلات اليتيمة داخل الجلسة،
 * يسمح لشريط الحالة في ProjectDetail ولوحة الفروقات في FundsSection
 * بقراءة نفس الحقيقة دون تمرير props عبر الشجرة.
 */
import { useSyncExternalStore } from 'react';

export interface CashRepairBalanceSnapshot {
  activeFundRemaining: number;
  managerRemaining: number;
  custodyAvailable: number;
  custodySpent: number;
  custodyRemaining: number;
}

export interface CashRepairEvent {
  projectId: string;
  at: string; // ISO
  transferId: string;
  custodyId: string;
  custodyName: string;
  amount: number;
  before: CashRepairBalanceSnapshot;
  after: CashRepairBalanceSnapshot;
}

export interface CashRepairStatus {
  last: CashRepairEvent | null;
  repairedCount: number;
}

const EMPTY: CashRepairStatus = { last: null, repairedCount: 0 };

const state = new Map<string, CashRepairStatus>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function recordCashRepairEvent(event: CashRepairEvent) {
  const prev = state.get(event.projectId) ?? EMPTY;
  state.set(event.projectId, { last: event, repairedCount: prev.repairedCount + 1 });
  emit();
}

export function getCashRepairStatus(projectId: string): CashRepairStatus {
  return state.get(projectId) ?? EMPTY;
}

export function clearCashRepairStatus(projectId: string) {
  state.delete(projectId);
  emit();
}

export function subscribeCashRepairs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCashRepairStatus(projectId: string): CashRepairStatus {
  return useSyncExternalStore(
    subscribeCashRepairs,
    () => getCashRepairStatus(projectId),
    () => EMPTY,
  );
}

export function diffSnapshot(
  before: CashRepairBalanceSnapshot,
  after: CashRepairBalanceSnapshot,
): Record<keyof CashRepairBalanceSnapshot, number> {
  return {
    activeFundRemaining: after.activeFundRemaining - before.activeFundRemaining,
    managerRemaining: after.managerRemaining - before.managerRemaining,
    custodyAvailable: after.custodyAvailable - before.custodyAvailable,
    custodySpent: after.custodySpent - before.custodySpent,
    custodyRemaining: after.custodyRemaining - before.custodyRemaining,
  };
}
