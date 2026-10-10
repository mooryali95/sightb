/**
 * Component tests for the project stats grid, written before it is split.
 * Every figure comes from the summary and the EVM the page's hook computes
 * (tested there); what is pinned here is which card shows, under which
 * title, with which subtitle and verdict.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { EVMMetrics, Project, ProjectSummary } from '@/types/project';
import { ProjectStatsGrid } from '../ProjectStatsGrid';

const project: Project = {
  id: 'p-1', companyId: 'c-1', name: 'مشروع الوزارة', contractValue: 100000, currency: 'SAR',
  startDate: '2026-01-01', endDate: '2026-06-30', durationMonths: 6, resourceCount: 1,
  status: 'active', createdAt: '', percentComplete: 40,
  contractType: 'lump_sum', retentionPercent: 0, managementReserve: 0, taxPercent: 15, vatInclusive: false,
};

function summary(over: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    contractValue: 100000, effectiveContractValue: 100000, contractRemaining: 40000,
    totalPlanned: 60000, totalActual: 30000, budgetRemaining: 30000, budgetVariance: 50,
    plannedProfit: 40000, plannedProfitMargin: 40, collectedRevenue: 40000, invoicedRevenue: 20000,
    totalPlannedRevenue: 40000, realizedProfit: 10000, realizedProfitMargin: 25, accountsReceivable: 20000,
    spendRate: 50, contractSpendRate: 30, burnRate: 10000, percentComplete: 40, managementReserve: 0,
    bac: 60000, vatRate: 15, contractValueInclVAT: 115000, totalActualInclVAT: 34500,
    totalVATOnExpenses: 4500, totalVATOnRevenues: 6000, netVATPayable: 1500, ...over,
  };
}

const evm: EVMMetrics = {
  pv: 30000, ev: 24000, ac: 30000, bac: 60000, cv: -6000, sv: -6000, cpi: 0.8, spi: 0.8,
  eac: 75000, etc: 45000, vac: -15000, tcpiBAC: 1.2, tcpiEAC: 0.8, eacAtypical: 66000, eacCombined: 86000,
};

type Over = Partial<Parameters<typeof ProjectStatsGrid>[0]>;
function renderGrid(over: Over = {}) {
  return render(
    <ProjectStatsGrid
      project={project} summary={summary()} evm={null} currentMonth={3} daysRemaining={100} monthsRemaining={3}
      totalCommitted={0} availableBudget={30000} vatRate={15}
      healthScore={{ label: 'سليم', color: 'health-good', bg: 'bg-success/10' }}
      openRisksCount={0} pendingExpensesCount={0} pendingChangeOrders={0} invoicedCount={2}
      {...over}
    />,
  );
}

const card = (title: string) => screen.getByText(title).closest('.stat-card') as HTMLElement;

describe('the health strip', () => {
  it('shows the verdict, status, progress, month, days left, and the EVM indices and open risks when there are any', () => {
    renderGrid({ evm, openRisksCount: 2, daysRemaining: 12 });
    const strip = screen.getByText('سليم').parentElement as HTMLElement;
    expect(strip).toHaveTextContent('الإنجاز 40%');
    expect(strip).toHaveTextContent('الشهر 3 من 6');
    expect(screen.getByText('12 يوم متبقي')).toHaveClass('text-destructive');
    expect(strip).toHaveTextContent('CPI 0.80');
    expect(strip).toHaveTextContent('SPI 0.80');
    expect(strip).toHaveTextContent('2 خطر مفتوح');
  });
});

describe('the contract row', () => {
  it('names the contract with its VAT-inclusive figure, or as amended with the original when orders changed it', () => {
    const { unmount } = renderGrid();
    expect(card('قيمة العقد')).toHaveTextContent('100,000.00 ر.س');
    expect(card('قيمة العقد')).toHaveTextContent('شامل الضريبة: 115,000.00 ر.س');
    expect(card('الموازنة المعتمدة')).toHaveTextContent('60.0% من العقد');
    expect(card('الربح المخطط')).toHaveTextContent('هامش: 40.0%');
    expect(card('المتبقي من العقد')).toHaveTextContent('40% لم يُفوتر');
    unmount();
    renderGrid({ summary: summary({ effectiveContractValue: 120000 }) });
    expect(card('قيمة العقد المعدّلة')).toHaveTextContent('120,000.00 ر.س');
    expect(card('قيمة العقد المعدّلة')).toHaveTextContent('الأصلية: 100,000.00 ر.س');
  });
});

describe('the budget row', () => {
  it('shows what is left of the budget, or what is free to spend once commitments bind some of it', () => {
    const { unmount } = renderGrid();
    expect(card('المتبقي من الموازنة')).toHaveTextContent('30,000.00 ر.س');
    expect(screen.getByText('المصروف الفعلي').closest('.stat-card')).toHaveTextContent('50.0% من الموازنة (60,000.00 ر.س)');
    expect(card('معدل الحرق الشهري')).toHaveTextContent('يكفي لـ 3.0 شهر');
    unmount();
    renderGrid({ totalCommitted: 25000, availableBudget: 5000, monthsRemaining: null, summary: summary({ burnRate: 0 }) });
    expect(card('المتاح للصرف')).toHaveTextContent('5,000.00 ر.س');
    expect(card('المتاح للصرف')).toHaveTextContent('ملتزم بعقود: 25,000.00 ر.س');
    expect(card('معدل الحرق الشهري')).toHaveTextContent('لم يبدأ الصرف');
  });

  it('names an overrun as one, with a positive amount, instead of a trailing minus under "remaining"', () => {
    // The owner read "10,544.16-" under "المتبقي من الموازنة" as 10,000 left.
    const { unmount } = renderGrid({ summary: summary({ totalPlanned: 185000, totalActual: 195544.16, budgetRemaining: -10544.16 }) });
    expect(screen.queryByText('المتبقي من الموازنة')).not.toBeInTheDocument();
    expect(card('تجاوز الموازنة')).toHaveTextContent('10,544.16 ر.س');
    expect(card('تجاوز الموازنة')).not.toHaveTextContent('-');
    expect(card('تجاوز الموازنة')).toHaveTextContent('بنسبة 5.7% فوق الموازنة');
    unmount();
    renderGrid({ totalCommitted: 25000, availableBudget: -4000 });
    expect(card('تجاوز متوقّع للموازنة')).toHaveTextContent('4,000.00 ر.س');
    expect(card('تجاوز متوقّع للموازنة')).toHaveTextContent('ملتزم بعقود: 25,000.00 ر.س');
  });

  it('shows the EAC and the expected overrun with a baseline, and asks for one without', () => {
    const { unmount } = renderGrid({ evm });
    expect(card('التكلفة المتوقعة (EAC)')).toHaveTextContent('75,000.00 ر.س');
    expect(card('التكلفة المتوقعة (EAC)')).toHaveTextContent('تجاوز متوقع: 15,000.00 ر.س');
    expect(card('الأداء المطلوب (TCPI)')).toHaveTextContent('1.20');
    expect(card('الأداء المطلوب (TCPI)')).toHaveTextContent('صعب — يحتاج تدخل');
    unmount();
    renderGrid();
    expect(screen.getByText('EAC غير متاح')).toBeInTheDocument();
    expect(screen.getByText('CPI / SPI / TCPI')).toBeInTheDocument();
  });
});

describe('the collection row and the alerts', () => {
  it('shows the collected, the receivables with their invoice count, and the realised profit', () => {
    renderGrid();
    expect(card('المحصّل فعلياً')).toHaveTextContent('40% من العقد');
    expect(card('ذمم مدينة (مفوتر)')).toHaveTextContent('2 فاتورة قيد التحصيل');
    expect(card('الربح المحقق')).toHaveTextContent('10,000.00 ر.س');
    expect(card('الربح المحقق')).toHaveTextContent('المخطط: 40,000.00 ر.س');
  });

  it('hides the collection row and prompts for a baseline on an untouched project', () => {
    renderGrid({ summary: summary({ totalActual: 0, collectedRevenue: 0, accountsReceivable: 0 }) });
    expect(screen.queryByText('المحصّل فعلياً')).not.toBeInTheDocument();
    expect(screen.getByText(/اعتمد خط الأساس من تبويب/)).toBeInTheDocument();
  });

  it('flags pending expenses and proposed orders', () => {
    renderGrid({ pendingExpensesCount: 3, pendingChangeOrders: 1 });
    expect(screen.getByText('3 مصروف بانتظار الاعتماد')).toBeInTheDocument();
    expect(screen.getByText('1 أمر تغيير مقترح')).toBeInTheDocument();
  });
});
