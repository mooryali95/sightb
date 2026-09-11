/**
 * usePayablesScope
 * ---------------------------------------------------------------
 * Every derived slice the payables section renders from, in one place.
 *
 * The section used to recompute ~10 memos inline, which made it easy for
 * a resource-only aggregate to silently pick up vendor rows. Here the
 * resource ledger and the vendor ledger stay separated by construction,
 * and `scope` decides which one the UI shows.
 */

import { useMemo, useState } from 'react';
import { useStore } from '@/store/useStore';
import {
  getProjectPayablesSummary,
  getVendorPayablesSummary,
  filterResourceReimbursements,
  filterVendorReimbursements,
} from '@/lib/resource-payables';

export type PayablesScope = 'resource' | 'vendor';

export function usePayablesScope(projectId: string) {
  const { resources, reimbursements, paymentRequests, resourceSettlements, budgetItems } = useStore();

  const [scope, setScope] = useState<PayablesScope>('resource');

  const projBudgetItems = useMemo(
    () => budgetItems.filter((b) => b.projectId === projectId),
    [budgetItems, projectId],
  );

  const projResources = useMemo(
    () => resources.filter((r) => r.projectId === projectId),
    [resources, projectId],
  );

  const projAllReimbs = useMemo(
    () => reimbursements.filter((r) => r.projectId === projectId),
    [reimbursements, projectId],
  );
  const projReimbs = useMemo(() => filterResourceReimbursements(projAllReimbs), [projAllReimbs]);
  const projVendorReimbs = useMemo(() => filterVendorReimbursements(projAllReimbs), [projAllReimbs]);

  const projReqs = useMemo(
    () => paymentRequests.filter((p) => p.projectId === projectId),
    [paymentRequests, projectId],
  );
  const projSettles = useMemo(
    () => resourceSettlements.filter((s) => s.projectId === projectId),
    [resourceSettlements, projectId],
  );

  const resourceSummary = useMemo(
    () => getProjectPayablesSummary(projectId, projResources, projReimbs, projReqs, projSettles),
    [projectId, projResources, projReimbs, projReqs, projSettles],
  );
  const vendorSummary = useMemo(
    () => getVendorPayablesSummary(projectId, projVendorReimbs),
    [projectId, projVendorReimbs],
  );

  return {
    scope,
    setScope,
    projBudgetItems,
    projResources,
    projAllReimbs,
    projReimbs,
    projVendorReimbs,
    projReqs,
    projSettles,
    resourceSummary,
    vendorSummary,
    summary: scope === 'resource' ? resourceSummary : vendorSummary,
    scopedReimbs: scope === 'resource' ? projReimbs : projVendorReimbs,
  };
}
