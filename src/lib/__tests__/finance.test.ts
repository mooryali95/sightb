import { describe, it, expect } from 'vitest';
import type { BaselineItem, ChangeOrder, Expense } from '@/types/project';
import { getTotalPlanned, calculateEVM, getEffectiveContractValue, getCurrentMonth, calcVAT, addVAT, removeVAT } from '../finance';

describe('getTotalPlanned', () => {
  it('should sum fixed items normally', () => {
    const items = [
      { plannedAmount: 30000, costType: 'fixed' },
      { plannedAmount: 20000, costType: 'one_time' },
    ];
    expect(getTotalPlanned(items)).toBe(50000);
  });

  it('should multiply recurring items by month count', () => {
    const items = [
      { plannedAmount: 15000, costType: 'recurring', startMonth: 1, endMonth: 4 },
    ];
    expect(getTotalPlanned(items)).toBe(60000);
  });

  it('should handle mixed items correctly', () => {
    const items = [
      { plannedAmount: 15000, costType: 'recurring', startMonth: 1, endMonth: 6 },
      { plannedAmount: 30000, costType: 'one_time', startMonth: 1 },
      { plannedAmount: 20000, costType: 'fixed', startMonth: 1, endMonth: 2 },
    ];
    expect(getTotalPlanned(items)).toBe(90000 + 30000 + 20000);
  });

  it('should handle recurring without endMonth', () => {
    const items = [
      { plannedAmount: 10000, costType: 'recurring', startMonth: 3 },
    ];
    expect(getTotalPlanned(items)).toBe(10000);
  });
});

describe('calculateEVM', () => {
  const baselineItems: BaselineItem[] = [
    { id: '1', baselineId: 'b1', category: 'salary', description: 'Test', plannedAmount: 25000, costType: 'fixed' },
  ];
  const spend = (amount: number): Expense[] => [
    { projectId: 'p1', amount, month: 1, category: 'salary', id: '1', description: '', date: '', approvalStatus: 'approved', isVatExempt: false },
  ];

  it('should compute EV independently from AC', () => {
    const result = calculateEVM(baselineItems, spend(30000), 4, 1, 50, 0);
    expect(result.ev).toBe(12500);
    expect(result.ac).toBe(30000);
    expect(result.cpi).toBeCloseTo(0.417, 2);
  });

  it('should subtract managementReserve from BAC', () => {
    const withReserve = calculateEVM(baselineItems, spend(10000), 4, 1, 40, 5000);
    const withoutReserve = calculateEVM(baselineItems, spend(10000), 4, 1, 40, 0);
    expect(withReserve.bac).toBe(20000);
    expect(withoutReserve.bac).toBe(25000);
  });

  it('should return CPI=1 when AC=0 and EV=0', () => {
    const result = calculateEVM(baselineItems, [], 4, 1, 0, 0);
    expect(result.cpi).toBe(1); // no spend, no work → no deviation
    // SPI: EV=0, PV>0 → SPI=0 (behind schedule)
    expect(result.spi).toBe(0);
  });
});

describe('getEffectiveContractValue', () => {
  it('should only include approved change orders', () => {
    const co = (status: ChangeOrder['status'], amountImpact: number): ChangeOrder => ({
      id: `${status}-${amountImpact}`, projectId: 'p1', description: '', changeType: 'other',
      amountImpact, durationImpact: 0, status, createdAt: '',
    });
    const cos = [co('approved', 20000), co('rejected', -5000), co('proposed', 10000)];
    expect(getEffectiveContractValue(250000, cos)).toBe(270000);
  });
});

describe('getCurrentMonth', () => {
  it('should return 1 for future start date', () => {
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 3);
    expect(getCurrentMonth(futureDate.toISOString(), 12)).toBe(1);
  });

  it('should cap at durationMonths', () => {
    const pastDate = new Date();
    pastDate.setFullYear(pastDate.getFullYear() - 2);
    expect(getCurrentMonth(pastDate.toISOString(), 6)).toBe(6);
  });
});

describe('calcVAT', () => {
  it('should calculate 15% VAT correctly', () => {
    expect(calcVAT(100000, 15)).toBe(15000);
    expect(calcVAT(250000, 15)).toBe(37500);
  });

  it('should calculate non-standard VAT rates', () => {
    expect(calcVAT(100000, 20)).toBe(20000);
    expect(calcVAT(100000, 5)).toBe(5000);
    expect(calcVAT(100000, 0)).toBe(0);
  });

  it('should handle zero amounts', () => {
    expect(calcVAT(0, 15)).toBe(0);
  });
});

describe('addVAT', () => {
  it('should add VAT to exclusive amount', () => {
    expect(addVAT(100000, 15)).toBe(115000);
    expect(addVAT(250000, 15)).toBe(287500);
  });

  it('should return same amount when rate is 0', () => {
    expect(addVAT(100000, 0)).toBe(100000);
  });
});

describe('removeVAT', () => {
  it('should extract exclusive from inclusive amount', () => {
    expect(removeVAT(115000, 15)).toBe(100000);
    expect(removeVAT(287500, 15)).toBe(250000);
  });

  it('should be inverse of addVAT', () => {
    const original = 173500;
    const withVAT = addVAT(original, 15);
    const backToOriginal = removeVAT(withVAT, 15);
    expect(backToOriginal).toBe(original);
  });

  it('should return same amount when rate is 0', () => {
    expect(removeVAT(100000, 0)).toBe(100000);
  });
});

describe('getTotalPlanned with VAT context', () => {
  it('should not include VAT in totalPlanned', () => {
    const items = [
      { plannedAmount: 50000, costType: 'fixed' },
      { plannedAmount: 10000, costType: 'recurring', startMonth: 1, endMonth: 3 },
    ];
    const total = getTotalPlanned(items);
    expect(total).toBe(80000); // 50000 + 10000×3
  });
});
