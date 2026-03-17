import { describe, it, expect } from 'vitest';
import { getTotalPlanned, calculateEVM, getEffectiveContractValue, getCurrentMonth } from '../finance';

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
  const baselineItems = [
    { id: '1', baselineId: 'b1', category: 'salary', description: 'Test', plannedAmount: 25000, costType: 'fixed' as const },
  ];

  it('should compute EV independently from AC', () => {
    const expenses = [{ projectId: 'p1', amount: 30000, month: 1, category: 'salary', id: '1', description: '', date: '', approvalStatus: 'approved' as const }];
    const result = calculateEVM(baselineItems as any, expenses as any, 4, 1, 50, 0);
    expect(result.ev).toBe(12500);
    expect(result.ac).toBe(30000);
    expect(result.cpi).toBeCloseTo(0.417, 2);
  });

  it('should subtract managementReserve from BAC', () => {
    const expenses = [{ projectId: 'p1', amount: 10000, month: 1, category: 'salary', id: '1', description: '', date: '', approvalStatus: 'approved' as const }];
    const withReserve = calculateEVM(baselineItems as any, expenses as any, 4, 1, 40, 5000);
    const withoutReserve = calculateEVM(baselineItems as any, expenses as any, 4, 1, 40, 0);
    expect(withReserve.bac).toBe(20000);
    expect(withoutReserve.bac).toBe(25000);
  });

  it('should return CPI=1 when AC=0 and EV=0', () => {
    const result = calculateEVM(baselineItems as any, [] as any, 4, 1, 0, 0);
    expect(result.cpi).toBe(1); // no spend, no work → no deviation
    // SPI: EV=0, PV>0 → SPI=0 (behind schedule)
    expect(result.spi).toBe(0);
  });
});

describe('getEffectiveContractValue', () => {
  it('should only include approved change orders', () => {
    const cos = [
      { status: 'approved', amountImpact: 20000 },
      { status: 'rejected', amountImpact: -5000 },
      { status: 'proposed', amountImpact: 10000 },
    ];
    expect(getEffectiveContractValue(250000, cos as any)).toBe(270000);
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
