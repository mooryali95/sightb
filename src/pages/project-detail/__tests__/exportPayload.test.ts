import { describe, expect, it } from 'vitest';
import { buildExcelPayload, buildExportPayload, buildPdfPayload } from '../exportPayload';

const data = {
  project: { name: 'مشروع الجسر', durationMonths: 12, taxPercent: 15 },
  summary: { effectiveContractValue: 110000, totalPlanned: 80000, totalActual: 30000, contractValueInclVAT: 126500, totalVATOnExpenses: 4500, totalVATOnRevenues: 3750, netVATPayable: -750, plannedProfit: 30000 },
  pBudget: [{ id: 'b1', plannedAmount: 1000 }, { id: 'b2', plannedAmount: 500 }],
  getActualForItem: (b: { id: string }) => (b.id === 'b1' ? 400 : 0),
  pExpenses: [{ id: 'e1' }], pRevenues: [{ id: 'r1' }], pChangeOrders: [{ id: 'co1' }],
  totalAllRevenue: 25000,
} as unknown as Parameters<typeof buildExportPayload>[0];

describe('export payloads', () => {
  it('carries the project figures and each budget item with its actual', () => {
    const p = buildExportPayload(data);
    expect(p).toMatchObject({ projectName: 'مشروع الجسر', contractValue: 110000, totalPlanned: 80000, totalActual: 30000, totalRevenue: 25000, durationMonths: 12 });
    expect(p.budgetItems.map((b) => [b.id, b.actual])).toEqual([['b1', 400], ['b2', 0]]);
    expect(p.expenses).toHaveLength(1);
    expect(p.revenues).toHaveLength(1);
    expect(p.changeOrders).toHaveLength(1);
  });

  it('adds the VAT figures for Excel and the planned profit for PDF', () => {
    expect(buildExcelPayload(data)).toMatchObject({ vatRate: 15, contractValueInclVAT: 126500, totalVATOnExpenses: 4500, totalVATOnRevenues: 3750, netVATPayable: -750 });
    expect(buildPdfPayload(data)).toMatchObject({ plannedProfit: 30000, projectName: 'مشروع الجسر' });
  });
});
