// CSV of exactly the rows the finance screen shows (same filter and order).
export interface CsvRow {
  name: string; parent: string; currency: string;
  contract: number; planned: number; actual: number; collected: number;
  profit: number; margin: number; actualProfit: number; actualMargin: number;
}

/** Text cells starting with a spreadsheet formula character get an apostrophe; numbers stay numeric. */
export function csvCell(v: string | number): string {
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 100) / 100) : '0';
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildOverviewCsv(rows: CsvRow[], parentLabel: string): string {
  const head = ['الاسم', parentLabel, 'العملة', 'قيمة العقود الفعّالة', 'الموازنة المخططة', 'المصروف الفعلي',
    'نسبة الصرف %', 'المحصّل', 'الربح المخطط', 'الهامش %', 'الربح الفعلي', 'الهامش الفعلي %'];
  const lines = rows.map((r) => [r.name, r.parent, r.currency, r.contract, r.planned, r.actual,
    r.planned > 0 ? (r.actual / r.planned) * 100 : 0, r.collected, r.profit, r.margin, r.actualProfit, r.actualMargin]
    .map(csvCell).join(','));
  return '\uFEFF' + [head.map(csvCell).join(','), ...lines].join('\r\n');
}

export function downloadCsv(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
