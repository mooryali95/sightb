/**
 * expense-analytics.ts — تجميع وفرز المصروفات حسب بُعد محدّد (مورد / جهة مورّدة /
 * فئة / مسؤول / بند موازنة / عهدة).
 *
 * كل الدوال خالصة (pure) — لا تعرف بالـUI ولا بقاعدة البيانات، ما يجعل الأرقام
 * قابلة للاختبار ومصدراً واحداً للحقيقة لأي شاشة تعرض «كم صُرف على فلان وفي ماذا».
 */
import type { Expense, Resource, Custody, BudgetItem, ExpenseCategory } from '@/types/project';
import { EXPENSE_CATEGORY_LABELS } from '@/types/project';

export type SpendDimension =
  | 'resource'
  | 'vendor'
  | 'category'
  | 'responsible'
  | 'budgetItem'
  | 'custody';

export const SPEND_DIMENSION_LABELS: Record<SpendDimension, string> = {
  resource: 'المورد (الفريق)',
  vendor: 'الجهة المورّدة',
  category: 'الفئة',
  responsible: 'المسؤول',
  budgetItem: 'بند الموازنة',
  custody: 'العهدة',
};

export const UNASSIGNED_KEY = '__unassigned__';
export const UNASSIGNED_LABEL = 'غير محدّد';

export interface SpendLookups {
  resources?: Resource[];
  custodies?: Custody[];
  budgetItems?: BudgetItem[];
}

export interface SpendBreakdownEntry {
  key: string;
  label: string;
  total: number;
  count: number;
}

export interface SpendGroup {
  key: string;
  label: string;
  /** إجمالي المعتمد + قيد الاعتماد (يستثني المرفوض دائماً). */
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  count: number;
  /** نسبة المجموعة من إجمالي المصروفات المعروضة. */
  share: number;
  firstDate: string | null;
  lastDate: string | null;
  /** «في ماذا صُرف» — تفصيل داخلي حسب الفئة. */
  byCategory: SpendBreakdownEntry[];
  expenses: Expense[];
}

export interface SpendReport {
  dimension: SpendDimension;
  groups: SpendGroup[];
  grandTotal: number;
  grandCount: number;
  /** إجمالي المرفوض — معروض للشفافية وليس ضمن grandTotal. */
  rejectedTotal: number;
  /** السلف القائمة (لم تُسوَّ بعد): مال سُلِّم ولم يُصرف، خارج الإجمالي والمجموعات كما في كل ملخّص. */
  outstandingAdvanceTotal: number;
}

export interface SpendFilters {
  /** بحث نصي حر: يطابق الوصف/المورد/الجهة/المسؤول/مرجع الفاتورة. */
  query?: string;
  dateFrom?: string;
  dateTo?: string;
  category?: ExpenseCategory | 'all';
  approvalStatus?: string | 'all';
  /** حصر النتائج بمجموعة واحدة على نفس البُعد (drill-down). */
  groupKey?: string;
}

export type SpendSortKey = 'total' | 'count' | 'label' | 'recent';
export type SpendSortDir = 'asc' | 'desc';

export interface SpendSort {
  key: SpendSortKey;
  dir: SpendSortDir;
}

export const DEFAULT_SPEND_SORT: SpendSort = { key: 'total', dir: 'desc' };

export const SPEND_SORT_LABELS: Record<SpendSortKey, string> = {
  total: 'الإجمالي',
  count: 'عدد المصروفات',
  label: 'الاسم',
  recent: 'آخر تاريخ صرف',
};

/** فرز المجموعات حسب مفتاح واتجاه — نفس الفرز المستخدم في العرض والتصدير. */
export function sortSpendGroups<T extends SpendGroup>(groups: T[], sort: SpendSort = DEFAULT_SPEND_SORT): T[] {
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...groups].sort((a, b) => {
    switch (sort.key) {
      case 'count':
        return (a.count - b.count) * dir;
      case 'label':
        return a.label.localeCompare(b.label, 'ar') * dir;
      case 'recent':
        return ((a.lastDate || '').localeCompare(b.lastDate || '')) * dir;
      default:
        return (a.total - b.total) * dir;
    }
  });
}


function labelOf(dimension: SpendDimension, exp: Expense, look: SpendLookups): { key: string; label: string } {
  switch (dimension) {
    case 'resource': {
      if (!exp.resourceId) return { key: UNASSIGNED_KEY, label: UNASSIGNED_LABEL };
      const r = look.resources?.find((x) => x.id === exp.resourceId);
      return { key: exp.resourceId, label: r?.name || exp.resourceId };
    }
    case 'vendor': {
      const v = (exp.vendor || '').trim();
      return v ? { key: v, label: v } : { key: UNASSIGNED_KEY, label: UNASSIGNED_LABEL };
    }
    case 'category':
      return { key: exp.category, label: EXPENSE_CATEGORY_LABELS[exp.category] || exp.category };
    case 'responsible': {
      const v = (exp.responsible || '').trim();
      return v ? { key: v, label: v } : { key: UNASSIGNED_KEY, label: UNASSIGNED_LABEL };
    }
    case 'budgetItem': {
      if (!exp.budgetItemId) return { key: UNASSIGNED_KEY, label: UNASSIGNED_LABEL };
      const b = look.budgetItems?.find((x) => x.id === exp.budgetItemId);
      return { key: exp.budgetItemId, label: b?.description || exp.budgetItemId };
    }
    case 'custody': {
      if (!exp.custodyId) return { key: UNASSIGNED_KEY, label: UNASSIGNED_LABEL };
      const c = look.custodies?.find((x) => x.id === exp.custodyId);
      return { key: exp.custodyId, label: c?.resourceName || exp.custodyId };
    }
    default:
      return { key: UNASSIGNED_KEY, label: UNASSIGNED_LABEL };
  }
}

/** يبني نص البحث القابل للمطابقة لمصروف واحد (يشمل أسماء الموارد/العهد/البنود). */
export function searchableText(exp: Expense, look: SpendLookups = {}): string {
  const parts = [
    exp.description,
    exp.vendor,
    exp.responsible,
    exp.invoiceRef,
    EXPENSE_CATEGORY_LABELS[exp.category],
    look.resources?.find((r) => r.id === exp.resourceId)?.name,
    look.custodies?.find((c) => c.id === exp.custodyId)?.resourceName,
    look.budgetItems?.find((b) => b.id === exp.budgetItemId)?.description,
  ];
  return parts.filter(Boolean).join(' ').toLowerCase();
}

/** يطبّق الفلاتر على قائمة المصروفات (بدون تجميع). */
export function filterExpenses(
  expenses: Expense[],
  filters: SpendFilters = {},
  look: SpendLookups = {},
  dimension: SpendDimension = 'resource',
): Expense[] {
  const q = (filters.query || '').trim().toLowerCase();
  return expenses.filter((e) => {
    if (q && !searchableText(e, look).includes(q)) return false;
    if (filters.category && filters.category !== 'all' && e.category !== filters.category) return false;
    if (filters.approvalStatus && filters.approvalStatus !== 'all' && (e.approvalStatus || 'approved') !== filters.approvalStatus) return false;
    if (filters.dateFrom && e.date < filters.dateFrom) return false;
    if (filters.dateTo && e.date > filters.dateTo) return false;
    if (filters.groupKey && labelOf(dimension, e, look).key !== filters.groupKey) return false;
    return true;
  });
}

/**
 * التقرير الرئيسي: يجمّع المصروفات حسب البُعد المطلوب مع إجماليات ونِسب،
 * ويُرجع المجموعات مرتّبةً تنازلياً حسب الإجمالي.
 */
export function buildSpendReport(
  expenses: Expense[],
  dimension: SpendDimension,
  filters: SpendFilters = {},
  look: SpendLookups = {},
  sort: SpendSort = DEFAULT_SPEND_SORT,
): SpendReport {

  const { spend: rows, outstandingAdvanceTotal } = splitOutstandingAdvances(filterExpenses(expenses, filters, look, dimension));
  const map = new Map<string, SpendGroup>();
  let rejectedTotal = 0;

  for (const e of rows) {
    const status = e.approvalStatus || 'approved';
    const { key, label } = labelOf(dimension, e, look);
    let g = map.get(key);
    if (!g) {
      g = {
        key, label, total: 0, approved: 0, pending: 0, rejected: 0, count: 0, share: 0,
        firstDate: null, lastDate: null, byCategory: [], expenses: [],
      };
      map.set(key, g);
    }
    g.count += 1;
    g.expenses.push(e);
    if (status === 'rejected') {
      g.rejected += e.amount;
      rejectedTotal += e.amount;
    } else {
      g.total += e.amount;
      if (status === 'pending') g.pending += e.amount;
      else g.approved += e.amount;
    }
    if (!g.firstDate || e.date < g.firstDate) g.firstDate = e.date;
    if (!g.lastDate || e.date > g.lastDate) g.lastDate = e.date;
  }

  const grandTotal = Array.from(map.values()).reduce((s, g) => s + g.total, 0);

  const groups = sortSpendGroups(Array.from(map.values()).map((g) => {
    const catMap = new Map<string, SpendBreakdownEntry>();
    for (const e of g.expenses) {
      if ((e.approvalStatus || 'approved') === 'rejected') continue;
      const k = e.category as string;
      const cur = catMap.get(k) || { key: k, label: EXPENSE_CATEGORY_LABELS[e.category] || k, total: 0, count: 0 };
      cur.total += e.amount;
      cur.count += 1;
      catMap.set(k, cur);
    }
    return {
      ...g,
      share: grandTotal > 0 ? (g.total / grandTotal) * 100 : 0,
      byCategory: Array.from(catMap.values()).sort((a, b) => b.total - a.total),
      expenses: [...g.expenses].sort((a, b) => (a.date < b.date ? 1 : -1)),
    };
  }), sort);


  return {
    dimension,
    groups,
    grandTotal,
    grandCount: rows.length,
    rejectedTotal,
    outstandingAdvanceTotal,
  };
}

function esc(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  // Text starting with a formula character would run as a formula in a
  // spreadsheet; a leading apostrophe makes it plain text. Numbers stay numbers.
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface SpendCsvMeta {
  filters?: SpendFilters;
  sort?: SpendSort;
  /** مسار التجميع متعدد المستويات إن وُجد. */
  dimensionPath?: SpendDimension[];
}

function filterLines(meta: SpendCsvMeta): string[] {
  const f = meta.filters || {};
  const out: string[] = [];
  out.push(['الفلاتر المطبّقة', ''].join(','));
  out.push(['بحث', f.query || '—'].map(esc).join(','));
  out.push(['من تاريخ', f.dateFrom || '—'].map(esc).join(','));
  out.push(['إلى تاريخ', f.dateTo || '—'].map(esc).join(','));
  out.push(['الفئة', !f.category || f.category === 'all' ? 'كل الفئات' : (EXPENSE_CATEGORY_LABELS[f.category as ExpenseCategory] || f.category)].map(esc).join(','));
  out.push(['الحالة', !f.approvalStatus || f.approvalStatus === 'all' ? 'كل الحالات' : f.approvalStatus].map(esc).join(','));
  if (f.groupKey) out.push(['محصور بمجموعة', f.groupKey].map(esc).join(','));
  if (meta.dimensionPath?.length) {
    out.push(['مسار التجميع', meta.dimensionPath.map((d) => SPEND_DIMENSION_LABELS[d]).join(' ← ')].map(esc).join(','));
  }
  if (meta.sort) {
    out.push(['الفرز', `${SPEND_SORT_LABELS[meta.sort.key]} — ${meta.sort.dir === 'asc' ? 'تصاعدي' : 'تنازلي'}`].map(esc).join(','));
  }
  return out;
}

/** تصدير التقرير: يعكس نفس الفلاتر والفرز والنطاق الزمني المعروض على الشاشة. */
export function buildSpendReportCSV(report: SpendReport, projectName: string, meta: SpendCsvMeta = {}): string {
  const lines: string[] = [];
  lines.push([projectName, SPEND_DIMENSION_LABELS[report.dimension], new Date().toISOString().split('T')[0]].map(esc).join(','));
  lines.push('');
  lines.push(...filterLines(meta));
  lines.push('');

  lines.push(['المجموعة', 'الإجمالي', 'معتمد', 'قيد الاعتماد', 'مرفوض', 'عدد', 'النسبة %', 'من', 'إلى'].join(','));
  for (const g of report.groups) {
    lines.push([g.label, g.total, g.approved, g.pending, g.rejected, g.count, g.share.toFixed(1), g.firstDate ?? '', g.lastDate ?? ''].map(esc).join(','));
  }
  lines.push('');
  lines.push(['المجموعة', 'التاريخ', 'الوصف', 'الفئة', 'المبلغ', 'الحالة', 'الجهة المورّدة', 'مرجع الفاتورة'].join(','));
  for (const g of report.groups) {
    for (const e of g.expenses) {
      lines.push([
        g.label, e.date, e.description,
        EXPENSE_CATEGORY_LABELS[e.category] || e.category,
        e.amount, e.approvalStatus || 'approved', e.vendor ?? '', e.invoiceRef ?? '',
      ].map(esc).join(','));
    }
  }
  lines.push('');
  lines.push(['الإجمالي العام', report.grandTotal].map(esc).join(','));
  lines.push(['إجمالي المرفوض (خارج الإجمالي)', report.rejectedTotal].map(esc).join(','));
  lines.push(['سلف قائمة (خارج الإجمالي)', report.outstandingAdvanceTotal].map(esc).join(','));
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* تجميع متعدد المستويات: مورد ← فئة ← بند ← تفاصيل كل عملية صرف        */
/* ------------------------------------------------------------------ */

export interface SpendNode {
  key: string;
  label: string;
  dimension: SpendDimension;
  /** المسار الكامل من الجذر (مفاتيح) — يُستخدم للفتح/الطي والتصدير. */
  path: string[];
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  count: number;
  share: number;
  firstDate: string | null;
  lastDate: string | null;
  children: SpendNode[];
  expenses: Expense[];
}

export interface SpendTree {
  dimensions: SpendDimension[];
  nodes: SpendNode[];
  grandTotal: number;
  grandCount: number;
  rejectedTotal: number;
  /** السلف القائمة (لم تُسوَّ بعد): خارج الإجمالي والعدّ والمجموعات كما في كل ملخّص. */
  outstandingAdvanceTotal: number;
}

/**
 * An advance still outstanding is money handed over, not spent: no summary
 * in the app counts it, so the explorer leaves it out of every group and
 * reports its total apart, the way the rejected total is shown.
 */
function splitOutstandingAdvances(rows: Expense[]): { spend: Expense[]; outstandingAdvanceTotal: number } {
  let outstandingAdvanceTotal = 0;
  const spend: Expense[] = [];
  for (const e of rows) {
    if (e.isOutstandingAdvance) outstandingAdvanceTotal += e.amount;
    else spend.push(e);
  }
  return { spend, outstandingAdvanceTotal };
}

function buildLevel(
  rows: Expense[],
  dims: SpendDimension[],
  look: SpendLookups,
  sort: SpendSort,
  parentPath: string[],
  parentTotal: number,
): SpendNode[] {
  const [dim, ...rest] = dims;
  if (!dim) return [];
  const buckets = new Map<string, { label: string; rows: Expense[] }>();
  for (const e of rows) {
    const { key, label } = labelOf(dim, e, look);
    const b = buckets.get(key) || { label, rows: [] };
    b.rows.push(e);
    buckets.set(key, b);
  }

  const nodes: SpendNode[] = Array.from(buckets.entries()).map(([key, b]) => {
    let total = 0, approved = 0, pending = 0, rejected = 0;
    let firstDate: string | null = null, lastDate: string | null = null;
    for (const e of b.rows) {
      const st = e.approvalStatus || 'approved';
      if (st === 'rejected') rejected += e.amount;
      else {
        total += e.amount;
        if (st === 'pending') pending += e.amount; else approved += e.amount;
      }
      if (!firstDate || e.date < firstDate) firstDate = e.date;
      if (!lastDate || e.date > lastDate) lastDate = e.date;
    }
    const path = [...parentPath, key];
    return {
      key, label: b.label, dimension: dim, path,
      total, approved, pending, rejected,
      count: b.rows.length,
      share: parentTotal > 0 ? (total / parentTotal) * 100 : 0,
      firstDate, lastDate,
      children: rest.length ? buildLevel(b.rows, rest, look, sort, path, total) : [],
      expenses: [...b.rows].sort((a, c) => (a.date < c.date ? 1 : -1)),
    };
  });

  return sortSpendGroups(nodes as unknown as SpendGroup[], sort) as unknown as SpendNode[];
}

/**
 * يبني شجرة تجميع متعددة المستويات بنفس فلاتر وفرز التقرير المسطّح،
 * فيصبح بالإمكان الهبوط من المورد ← الفئة ← بند الموازنة ← بنود الصرف.
 */
export function buildSpendTree(
  expenses: Expense[],
  dimensions: SpendDimension[],
  filters: SpendFilters = {},
  look: SpendLookups = {},
  sort: SpendSort = DEFAULT_SPEND_SORT,
): SpendTree {
  const dims = dimensions.length ? dimensions : (['resource'] as SpendDimension[]);
  const { spend: rows, outstandingAdvanceTotal } = splitOutstandingAdvances(filterExpenses(expenses, filters, look, dims[0]));
  let grandTotal = 0, rejectedTotal = 0;
  for (const e of rows) {
    if ((e.approvalStatus || 'approved') === 'rejected') rejectedTotal += e.amount;
    else grandTotal += e.amount;
  }
  return {
    dimensions: dims,
    nodes: buildLevel(rows, dims, look, sort, [], grandTotal),
    grandTotal,
    grandCount: rows.length,
    rejectedTotal,
    outstandingAdvanceTotal,
  };
}

/** تصدير الشجرة كاملة: مستوى لكل صف مع مسار التجميع، ثم بنود الصرف. */
export function buildSpendTreeCSV(tree: SpendTree, projectName: string, meta: SpendCsvMeta = {}): string {
  const lines: string[] = [];
  lines.push([projectName, tree.dimensions.map((d) => SPEND_DIMENSION_LABELS[d]).join(' ← '), new Date().toISOString().split('T')[0]].map(esc).join(','));
  lines.push('');
  lines.push(...filterLines({ ...meta, dimensionPath: tree.dimensions }));
  lines.push('');
  lines.push(['المستوى', 'البُعد', 'المسار', 'الاسم', 'الإجمالي', 'معتمد', 'قيد الاعتماد', 'مرفوض', 'عدد', 'النسبة %', 'من', 'إلى'].join(','));

  const walk = (nodes: SpendNode[], level: number, trail: string[]) => {
    for (const n of nodes) {
      const path = [...trail, n.label];
      lines.push([
        level, SPEND_DIMENSION_LABELS[n.dimension], path.join(' / '), n.label,
        n.total, n.approved, n.pending, n.rejected, n.count, n.share.toFixed(1),
        n.firstDate ?? '', n.lastDate ?? '',
      ].map(esc).join(','));
      if (n.children.length) walk(n.children, level + 1, path);
      else {
        for (const e of n.expenses) {
          lines.push([
            level + 1, 'بند صرف', path.join(' / '), e.description,
            e.amount, '', '', '', 1, '', e.date, e.date,
          ].map(esc).join(','));
        }
      }
    }
  };
  walk(tree.nodes, 1, []);

  lines.push('');
  lines.push(['الإجمالي العام', tree.grandTotal].map(esc).join(','));
  lines.push(['إجمالي المرفوض (خارج الإجمالي)', tree.rejectedTotal].map(esc).join(','));
  lines.push(['سلف قائمة (خارج الإجمالي)', tree.outstandingAdvanceTotal].map(esc).join(','));
  return lines.join('\n');
}
