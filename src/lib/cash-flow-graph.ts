import type { CashTransfer, Custody, Expense, PaymentRequest, ProjectFund, Resource } from '@/types/project';

export interface CashFlowNode { name: string }
export interface CashFlowLink { source: number; target: number; value: number }
export interface CashFlowGraph { nodes: CashFlowNode[]; links: CashFlowLink[] }

export interface CashFlowInput {
  projectId: string;
  funds: ProjectFund[];
  expenses: Expense[];
  custodies: Custody[];
  paymentRequests: PaymentRequest[];
  cashTransfers: CashTransfer[];
  resources: Resource[];
}

/**
 * Where each riyal came from and where it went, as a directed graph the
 * Sankey draws. The graph must stay acyclic: a Sankey lays its nodes out
 * by depth, and one link back to a fund leaves every position NaN, so a
 * refund on an advance is drawn into its own "returned to" node rather
 * than back into the fund or custody it came from. The expense an
 * outstanding advance created is the advance already drawn, not a second
 * flow from the fund; a rejected expense is no flow at all.
 */
export function buildCashFlowGraph({ projectId, funds, expenses, custodies, paymentRequests, cashTransfers, resources }: CashFlowInput): CashFlowGraph | null {
  const projFunds = funds.filter(f => f.projectId === projectId);
  const projCustodies = custodies.filter(c => c.projectId === projectId);
  const projExpenses = expenses.filter(e => e.projectId === projectId && e.approvalStatus !== 'rejected');
  const projPRs = paymentRequests.filter(p => p.projectId === projectId);
  const projTransfers = (cashTransfers || []).filter(t => t.projectId === projectId);

  const nodes: CashFlowNode[] = [];
  const idx = new Map<string, number>();
  const getNode = (name: string) => {
    if (!idx.has(name)) { idx.set(name, nodes.length); nodes.push({ name }); }
    return idx.get(name)!;
  };
  const links: CashFlowLink[] = [];
  const addLink = (from: string, to: string, value: number) => {
    if (value <= 0 || from === to) return;
    links.push({ source: getNode(from), target: getNode(to), value });
  };
  const fundLabel = (f: ProjectFund) => `دفعة ${f.fundNumber}`;
  const custodyLabel = (c: Custody) => `عهدة: ${c.resourceName}`;

  // Funds to custodies, directly.
  for (const cu of projCustodies) {
    if (cu.sourceFundId) {
      const fund = projFunds.find(f => f.id === cu.sourceFundId);
      if (fund) addLink(fundLabel(fund), custodyLabel(cu), Number(cu.amount));
    }
  }
  // Funds to custodies, by cash transfer.
  for (const t of projTransfers) {
    const fund = projFunds.find(f => f.id === t.fromFundId);
    const cu = projCustodies.find(c => c.id === t.toCustodyId);
    if (fund && cu) addLink(fundLabel(fund), custodyLabel(cu), Number(t.amount));
  }
  // Funds to outstanding advances.
  for (const pr of projPRs) {
    if (pr.requestType === 'advance' && pr.isAdvanceOutstanding && pr.paidFromFundId) {
      const fund = projFunds.find(f => f.id === pr.paidFromFundId);
      const res = resources.find(r => r.id === pr.resourceId);
      if (fund) addLink(fundLabel(fund), `سلفة: ${res?.name || 'مورد'}`, Number(pr.amount));
    }
  }
  // Cash refunds on advances: into a node of their own, never back into the source.
  for (const pr of projPRs) {
    if (pr.requestType === 'advance' && (pr.refundedAmount ?? 0) > 0) {
      const res = resources.find(r => r.id === pr.resourceId);
      const fromLabel = `سلفة: ${res?.name || 'مورد'}`;
      if (pr.refundToFundId) {
        const fund = projFunds.find(f => f.id === pr.refundToFundId);
        if (fund) addLink(fromLabel, `مرتجع إلى ${fundLabel(fund)}`, Number(pr.refundedAmount));
      } else if (pr.refundToCustodyId) {
        const cu = projCustodies.find(c => c.id === pr.refundToCustodyId);
        if (cu) addLink(fromLabel, `مرتجع إلى ${custodyLabel(cu)}`, Number(pr.refundedAmount));
      }
    }
  }
  // Funds to direct expenses, custody-backed and advance-created ones aside.
  for (const e of projExpenses) {
    if (!e.fundId || e.custodyId || e.isOutstandingAdvance) continue;
    const fund = projFunds.find(f => f.id === e.fundId);
    if (fund) addLink(fundLabel(fund), `مصروف: ${e.category}`, Number(e.amount));
  }
  // Custodies to the expenses paid out of them.
  for (const e of projExpenses) {
    if (!e.custodyId) continue;
    const cu = projCustodies.find(c => c.id === e.custodyId);
    if (cu) addLink(custodyLabel(cu), `مصروف: ${e.category}`, Number(e.amount));
  }

  if (links.length === 0) return null;
  return { nodes, links };
}
