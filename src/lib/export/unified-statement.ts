/**
 * Writes «الكشف المالي الموحّد» in the owner's own layout: a combined sheet
 * (figures, the projects side by side, spend by party, nature and month), one
 * sheet per project, every counted movement in «مصدر_الحقيقة», and what was
 * collected. The figures come from buildUnifiedStatement, which uses the same
 * rules as the screens.
 */
import { bookNew, appendGrid, sheetName, writeWorkbook, type GridCell, type Workbook } from '../xlsx-writer';
import type { Figures, Share, UnifiedStatement, StatementLine } from '../finance/unified-statement';

const MONEY = '#,##0.00';
const PCT = '0.0%';
const TITLE_FILL = '#1F2A44';
const SECTION_FILL = '#F3EBDD';
const HEAD_FILL = '#E8ECF2';

const title = (text: string, span: number): GridCell[] => [{ value: text, bold: true, size: 16, color: '#FFFFFF', fill: TITLE_FILL, span }];
const note = (text: string, span: number): GridCell[] => [{ value: text, color: '#555555', span }];
const section = (text: string, span: number): GridCell[] => [{ value: text, bold: true, fill: SECTION_FILL, span }];
const head = (labels: string[]): GridCell[] => labels.map((l) => ({ value: l, bold: true, fill: HEAD_FILL }));
const money = (n: number): GridCell => ({ value: n, format: MONEY });
const pct = (n: number): GridCell => ({ value: n, format: PCT });

function figureRows(f: Figures): GridCell[][] {
  return [
    head(['قيمة العقد', 'المحصّل', 'المصروف الفعلي', 'صافي المتبقي', 'الهامش', 'عدد الحركات', 'سلف قائمة']),
    [money(f.contract), money(f.collected), money(f.actual), money(f.net), pct(f.margin), f.movements, money(f.openAdvances)],
  ];
}

function shareRows(label: string, rows: Share[]): GridCell[][] {
  return [head([label, 'المبلغ', 'النسبة', 'حركات']), ...rows.map((r) => [r.label, money(r.amount), pct(r.share), r.count])];
}

const LINE_HEAD = ['#', 'المشروع', 'المورد', 'الطبيعة', 'الفئة', 'البيان', 'المبلغ', 'الشهر', 'التاريخ', 'الحالة'];
const lineRow = (l: StatementLine, i: number): GridCell[] =>
  [i + 1, l.project, l.party, l.nature, l.category, l.description, money(l.amount), `شهر ${l.month}`, l.date, l.status];

const WIDTHS = [6, 18, 24, 18, 16, 40, 16, 10, 12, 10];
const blank: GridCell[] = [];
const stamp = (d: Date) => d.toISOString().slice(0, 10);

const RULE = 'المصروف الفعلي: كل مصروف غير مرفوض، عدا السلف التي لم تُسوَّ بعد (تظهر في «سلف قائمة»). صافي المتبقي = المحصّل − المصروف الفعلي.';

export function buildStatementWorkbook(s: UnifiedStatement, now = new Date()): Workbook {
  const wb = bookNew();
  const names = s.projects.map((p) => p.name);

  // The combined sheet.
  const cols = Math.max(7, names.length + 2);
  const combined: GridCell[][] = [
    title(`الكشف المالي الموحّد — ${s.companyName}`, cols),
    note(`${names.join(' + ')} · مستخرج من النظام في ${stamp(now)}`, cols),
    note(RULE, cols),
    blank,
    section('المؤشرات', cols),
    ...figureRows(s.figures),
    blank,
    section('مقارنة المشاريع', cols),
    head(['المؤشر', ...names, 'المجمّع']),
    ['قيمة العقد', ...s.projects.map((p) => money(p.figures.contract)), money(s.figures.contract)],
    ['المحصّل', ...s.projects.map((p) => money(p.figures.collected)), money(s.figures.collected)],
    ['المصروف الفعلي', ...s.projects.map((p) => money(p.figures.actual)), money(s.figures.actual)],
    ['صافي المتبقي', ...s.projects.map((p) => money(p.figures.net)), money(s.figures.net)],
    ['الهامش', ...s.projects.map((p) => pct(p.figures.margin)), pct(s.figures.margin)],
    ['عدد الحركات', ...s.projects.map((p) => p.figures.movements), s.figures.movements],
    ['سلف قائمة', ...s.projects.map((p) => money(p.figures.openAdvances)), money(s.figures.openAdvances)],
    blank,
    section('حسب المورد', 4), ...shareRows('المورد', s.byParty),
    blank,
    section('حسب الطبيعة', 4), ...shareRows('الطبيعة', s.byNature),
    blank,
    section('حسب الشهر', 4), ...shareRows('الشهر', s.byMonth),
  ];
  appendGrid(wb, combined, sheetName(`${s.companyName} — المجمّع`), [24, ...Array(cols - 1).fill(18)]);

  // One sheet per project.
  for (const p of s.projects) {
    appendGrid(wb, [
      title(`الكشف المالي — ${p.name}`, 10),
      note(RULE, 10),
      blank,
      section('المؤشرات', 7),
      ...figureRows(p.figures),
      blank,
      section('حسب المورد', 4), ...shareRows('المورد', p.byParty),
      blank,
      section('حسب الطبيعة', 4), ...shareRows('الطبيعة', p.byNature),
      blank,
      section('الحركات', 10),
      head(LINE_HEAD),
      ...p.lines.map(lineRow),
      ['', 'الإجمالي', '', '', '', '', { value: p.figures.actual, format: MONEY, bold: true }],
    ], sheetName(p.name), WIDTHS);
  }

  appendGrid(wb, [
    head(LINE_HEAD),
    ...s.lines.map(lineRow),
    ['', 'الإجمالي', '', '', '', '', { value: s.figures.actual, format: MONEY, bold: true }],
  ], 'مصدر_الحقيقة', WIDTHS);

  appendGrid(wb, [
    head(['المشروع', 'البيان', 'المبلغ', 'الشهر', 'تاريخ التحصيل']),
    ...s.collections.map((c) => [c.project, c.description, money(c.amount), `شهر ${c.month}`, c.date]),
    ['الإجمالي', '', { value: s.figures.collected, format: MONEY, bold: true }],
  ], 'التحصيل', [18, 36, 16, 10, 14]);

  return wb;
}

export async function exportUnifiedStatement(s: UnifiedStatement): Promise<void> {
  await writeWorkbook(buildStatementWorkbook(s), `${s.companyName}_الكشف_المالي_الموحد.xlsx`);
}
