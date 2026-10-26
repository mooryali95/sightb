import { describe, it, expect } from 'vitest';
import { companyNet } from '../company-net';

describe('companyNet', () => {
  it('takes the company\'s own spend off the projects\' profit, with the older indirect costs', () => {
    const n = companyNet({ totalPlannedProfit: 300000, totalIndirectCosts: 20000, totalContractValue: 1000000 }, 100000);
    expect(n).toEqual({ projectsProfit: 300000, indirectCosts: 20000, companyExpenses: 100000, net: 180000, margin: 18 });
  });
  it('has no margin without contracts', () => {
    expect(companyNet({ totalPlannedProfit: 0, totalIndirectCosts: 0, totalContractValue: 0 }, 500).margin).toBe(0);
  });
});
