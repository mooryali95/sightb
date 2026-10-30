/**
 * The company's net: the projects' profit less everything the company spent
 * on itself. Company expenses count whole, allocated or not: charging a
 * share to a project moves it between the company and its project, it does
 * not make it disappear. Indirect costs recorded the older way are still
 * subtracted until they move into company expenses.
 */
export interface CompanyNet {
  projectsProfit: number;
  indirectCosts: number;
  companyExpenses: number;
  net: number;
  margin: number;
}

export function companyNet(s: { totalPlannedProfit: number; totalIndirectCosts: number; totalContractValue: number }, companyExpenses: number): CompanyNet {
  const net = Math.round((s.totalPlannedProfit - s.totalIndirectCosts - companyExpenses) * 100) / 100;
  return {
    projectsProfit: s.totalPlannedProfit, indirectCosts: s.totalIndirectCosts, companyExpenses, net,
    margin: s.totalContractValue > 0 ? (net / s.totalContractValue) * 100 : 0,
  };
}
