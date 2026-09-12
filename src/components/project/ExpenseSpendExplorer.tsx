import { useMemo, useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { formatCurrency } from '@/lib/finance';
import {
  buildSpendTree, buildSpendTreeCSV, SPEND_DIMENSION_LABELS, SPEND_SORT_LABELS,
  DEFAULT_SPEND_SORT,
  type SpendDimension, type SpendFilters, type SpendNode, type SpendSort, type SpendSortKey,
} from '@/lib/expense-analytics';
import {
  listSpendTemplates, saveSpendTemplate, deleteSpendTemplate, type SpendTemplate,
} from '@/lib/spend-templates';
import {
  EXPENSE_CATEGORY_LABELS, APPROVAL_STATUS_LABELS, APPROVAL_STATUS_COLORS,
  type ExpenseCategory, type ApprovalStatus, type Resource, type Custody, type BudgetItem, type Expense,
} from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InspectorPanel, InspectorSection, InspectorKpiStrip } from '@/components/ui/inspector-panel';
import { useToast } from '@/hooks/use-toast';
import { decodeSpendView, encodeSpendView, buildShareUrl } from '@/lib/spend-url';
import {
  Download, Search, X, ChevronDown, ChevronLeft, Save, Trash2, ArrowUpDown, Link2, Plus,
} from 'lucide-react';

/** عدد الصفوف المعروضة في كل دفعة — تحميل تدريجي للقوائم الكبيرة. */
const PAGE_SIZE = 40;

interface Props {
  projectId?: string;
  projectName?: string;
  expenses: Expense[];
  resources: Resource[];
  custodies: Custody[];
  budgetItems: BudgetItem[];
}

const DIMENSIONS: SpendDimension[] = ['resource', 'vendor', 'category', 'responsible', 'budgetItem', 'custody'];
const SORT_KEYS: SpendSortKey[] = ['total', 'count', 'label', 'recent'];
const DEFAULT_PATH: SpendDimension[] = ['resource', 'category', 'budgetItem'];

/**
 * مستكشف الصرف: تجميع متعدد المستويات (مورد ← فئة ← بند ← تفاصيل الصرف)
 * مع بحث ونطاق زمني وفرز، تصدير CSV مطابق تماماً لما يظهر، وقوالب فلاتر محفوظة.
 */
export function ExpenseSpendExplorer({
  projectId, projectName = '', expenses, resources, custodies, budgetItems,
}: Props) {
  const { toast } = useToast();
  const [levels, setLevels] = useState<SpendDimension[]>(DEFAULT_PATH);
  const [query, setQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [sort, setSort] = useState<SpendSort>(DEFAULT_SPEND_SORT);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<SpendNode | null>(null);
  const [templates, setTemplates] = useState<SpendTemplate[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [pages, setPages] = useState<Record<string, number>>({});
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => { setTemplates(listSpendTemplates(projectId)); }, [projectId]);

  // فتح رابط مشارَك: استعادة نفس المستويات والفلاتر والفرز.
  useEffect(() => {
    const view = decodeSpendView(location.search);
    if (!view) return;
    if (view.dimensions.length) setLevels(view.dimensions);
    setQuery(view.filters.query || '');
    setDateFrom(view.filters.dateFrom || '');
    setDateTo(view.filters.dateTo || '');
    setCategory((view.filters.category as string) || 'all');
    setStatus((view.filters.approvalStatus as string) || 'all');
    setSort(view.sort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const look = useMemo(() => ({ resources, custodies, budgetItems }), [resources, custodies, budgetItems]);
  const filters: SpendFilters = useMemo(
    () => ({
      query,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      category: category as ExpenseCategory | 'all',
      approvalStatus: status,
    }),
    [query, dateFrom, dateTo, category, status],
  );

  const tree = useMemo(
    () => buildSpendTree(expenses, levels, filters, look, sort),
    [expenses, levels, filters, look, sort],
  );

  useEffect(() => { setPages({}); }, [levels, filters, sort]);

  const shareState = useMemo(() => ({ dimensions: levels, filters, sort }), [levels, filters, sort]);

  const handleShare = useCallback(async () => {
    const url = buildShareUrl(window.location.origin, location.pathname, shareState, location.hash);
    navigate({ pathname: location.pathname, search: `?${encodeSpendView(shareState)}`, hash: location.hash }, { replace: true });
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'تم نسخ رابط التقرير', description: 'يفتح نفس العرض بنفس الفلاتر والفرز والنطاق الزمني.' });
    } catch {
      toast({ title: 'رابط التقرير', description: url });
    }
  }, [shareState, location.pathname, location.hash, navigate, toast]);

  const showMore = (key: string) =>
    setPages((prev) => ({ ...prev, [key]: (prev[key] ?? PAGE_SIZE) + PAGE_SIZE }));

  const maxTotal = tree.nodes[0]?.total ?? Math.max(0, ...tree.nodes.map((n) => n.total));
  const hasFilters = !!(query || dateFrom || dateTo || category !== 'all' || status !== 'all');

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleExport = () => {
    const csv = buildSpendTreeCSV(tree, projectName, { filters, sort, dimensionPath: levels });
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spend-${levels.join('-')}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetFilters = () => {
    setQuery(''); setDateFrom(''); setDateTo(''); setCategory('all'); setStatus('all');
  };

  const handleSaveTemplate = () => {
    const name = templateName.trim();
    if (!name) return;
    saveSpendTemplate({ name, projectId: projectId ?? null, dimensions: levels, filters, sort });
    setTemplates(listSpendTemplates(projectId));
    setTemplateName('');
    toast({ title: 'تم حفظ القالب', description: name });
  };

  const applyTemplate = (t: SpendTemplate) => {
    setLevels(t.dimensions?.length ? t.dimensions : DEFAULT_PATH);
    setQuery(t.filters.query || '');
    setDateFrom(t.filters.dateFrom || '');
    setDateTo(t.filters.dateTo || '');
    setCategory((t.filters.category as string) || 'all');
    setStatus((t.filters.approvalStatus as string) || 'all');
    setSort(t.sort || DEFAULT_SPEND_SORT);
    setExpanded(new Set());
  };

  const removeTemplate = (id: string) => {
    deleteSpendTemplate(id);
    setTemplates(listSpendTemplates(projectId));
  };

  const setLevel = (index: number, dim: SpendDimension | 'none') => {
    setExpanded(new Set());
    setLevels((prev) => {
      const next = [...prev];
      if (dim === 'none') return next.slice(0, index);
      next[index] = dim;
      return next.slice(0, index + 1).concat(prev.slice(index + 1).filter((d) => d !== dim));
    });
  };

  const renderNode = (n: SpendNode, depth: number) => {
    const id = n.path.join('>');
    const open = expanded.has(id);
    const hasChildren = n.children.length > 0;
    return (
      <div key={id} className="space-y-1" style={{ marginInlineStart: depth ? 16 : 0 }}>
        <div className="p-3 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 transition-colors">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              className="flex items-center gap-2 min-w-0 text-start flex-1"
              onClick={() => (hasChildren ? toggle(id) : setActive(n))}
            >
              {hasChildren
                ? (open ? <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" /> : <ChevronLeft className="w-4 h-4 shrink-0 text-muted-foreground" />)
                : <span className="w-4" />}
              <span className="min-w-0">
                <span className="block text-sm font-medium truncate">{n.label}</span>
                <span className="block text-xs text-muted-foreground">
                  {SPEND_DIMENSION_LABELS[n.dimension]} · {n.count} مصروف · {n.share.toFixed(1)}%
                  {n.firstDate && ` · ${n.firstDate} → ${n.lastDate}`}
                </span>
              </span>
            </button>
            <div className="flex items-center gap-2 shrink-0">
              <div className="text-end">
                <p className="text-sm font-mono font-semibold">{formatCurrency(n.total)}</p>
                {n.pending > 0 && (
                  <p className="text-[11px] text-warning">قيد الاعتماد: {formatCurrency(n.pending)}</p>
                )}
              </div>
              <Button size="sm" variant="ghost" onClick={() => setActive(n)}>تفاصيل</Button>
            </div>
          </div>
          {depth === 0 && (
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mt-2">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${maxTotal > 0 ? (n.total / maxTotal) * 100 : 0}%` }}
              />
            </div>
          )}
        </div>
        {open && hasChildren && renderList(n.children, depth + 1, id)}
      </div>
    );
  };

  const renderList = (nodes: SpendNode[], depth: number, parentKey: string) => {
    const limit = pages[parentKey] ?? PAGE_SIZE;
    const slice = nodes.slice(0, limit);
    return (
      <div className="space-y-1">
        {slice.map((c) => renderNode(c, depth))}
        {nodes.length > slice.length && (
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5"
            style={{ marginInlineStart: depth ? 16 : 0 }}
            onClick={() => showMore(parentKey)}
          >
            <Plus className="w-3.5 h-3.5" />
            عرض المزيد ({nodes.length - slice.length} صفاً متبقياً)
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="stat-card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">مستكشف الصرف — تجميع متعدد المستويات</h3>
          <p className="text-xs text-muted-foreground">
            إجمالي التكلفة لكل مورد ثم الهبوط إلى الفئة فالبند فتفاصيل كل عملية صرف.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleShare}>
            <Link2 className="w-3.5 h-3.5" />نسخ رابط التقرير
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport} disabled={tree.nodes.length === 0}>
            <Download className="w-3.5 h-3.5" />تصدير CSV (بنفس الفلاتر والفرز)
          </Button>
        </div>
      </div>

      {/* مستويات التجميع */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-1">
            <Label className="text-xs">المستوى {i + 1}</Label>
            <Select
              value={levels[i] ?? 'none'}
              onValueChange={(v) => setLevel(i, v as SpendDimension | 'none')}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {i > 0 && <SelectItem value="none">— بدون —</SelectItem>}
                {DIMENSIONS.map((d) => (
                  <SelectItem key={d} value={d}>{SPEND_DIMENSION_LABELS[d]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      {/* الفلاتر */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
        <div className="md:col-span-2 space-y-1">
          <Label className="text-xs">بحث</Label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute top-1/2 -translate-y-1/2 start-2 text-muted-foreground" />
            <Input
              className="ps-7"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="اسم مورد، جهة، وصف، رقم فاتورة…"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">من تاريخ</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">إلى تاريخ</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">الفئة</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الفئات</SelectItem>
              {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label className="text-xs">الحالة</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              {Object.entries(APPROVAL_STATUS_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">الفرز</Label>
          <Select value={sort.key} onValueChange={(v) => setSort((s) => ({ ...s, key: v as SpendSortKey }))}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SORT_KEYS.map((k) => (
                <SelectItem key={k} value={k}>{SPEND_SORT_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => setSort((s) => ({ ...s, dir: s.dir === 'desc' ? 'asc' : 'desc' }))}
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
          {sort.dir === 'desc' ? 'تنازلي' : 'تصاعدي'}
        </Button>
        {hasFilters && (
          <Button variant="ghost" size="sm" className="gap-1" onClick={resetFilters}>
            <X className="w-3.5 h-3.5" />مسح الفلاتر
          </Button>
        )}
      </div>

      {/* قوالب الفلاتر */}
      <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-2">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1 flex-1 min-w-48">
            <Label className="text-xs">حفظ الفلاتر الحالية كقالب</Label>
            <Input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="مثال: مصروفات الربع الأول — د. أيمن"
            />
          </div>
          <Button size="sm" className="gap-1.5" onClick={handleSaveTemplate} disabled={!templateName.trim()}>
            <Save className="w-3.5 h-3.5" />حفظ القالب
          </Button>
        </div>
        {templates.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {templates.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1 rounded-full border border-border bg-background ps-2 pe-1 py-0.5">
                <button type="button" className="text-xs" onClick={() => applyTemplate(t)}>{t.name}</button>
                {!t.projectId && <Badge variant="outline" className="text-[9px]">عام</Badge>}
                <button type="button" aria-label="حذف القالب" onClick={() => removeTemplate(t.id)}>
                  <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* الإجماليات */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-3 rounded-lg border border-border bg-muted/30">
          <p className="text-xs text-muted-foreground">إجمالي المطابق</p>
          <p className="text-sm font-mono font-semibold mt-1">{formatCurrency(tree.grandTotal)}</p>
        </div>
        <div className="p-3 rounded-lg border border-border bg-muted/30">
          <p className="text-xs text-muted-foreground">عدد المصروفات</p>
          <p className="text-sm font-mono font-semibold mt-1">{tree.grandCount}</p>
        </div>
        <div className="p-3 rounded-lg border border-border bg-muted/30">
          <p className="text-xs text-muted-foreground">عدد المجموعات</p>
          <p className="text-sm font-mono font-semibold mt-1">{tree.nodes.length}</p>
        </div>
        <div className="p-3 rounded-lg border border-border bg-muted/30">
          <p className="text-xs text-muted-foreground">مرفوض (خارج الإجمالي)</p>
          <p className="text-sm font-mono font-semibold mt-1 text-destructive">{formatCurrency(tree.rejectedTotal)}</p>
        </div>
        <div className="p-3 rounded-lg border border-border bg-muted/30">
          <p className="text-xs text-muted-foreground">سلف قائمة (خارج الإجمالي)</p>
          <p className="text-sm font-mono font-semibold mt-1 text-warning">{formatCurrency(tree.outstandingAdvanceTotal)}</p>
        </div>
      </div>

      {tree.nodes.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">لا توجد نتائج مطابقة للفلاتر</p>
      ) : (
        renderList(tree.nodes, 0, '__root__')
      )}

      {active && (
        <InspectorPanel
          open={!!active}
          onOpenChange={(v) => !v && setActive(null)}
          title={active.label}
          description={`${SPEND_DIMENSION_LABELS[active.dimension]} · ${active.count} مصروف`}
          width="lg"
        >
          <InspectorKpiStrip
            items={[
              { label: 'الإجمالي', value: formatCurrency(active.total), tone: 'default' },
              { label: 'معتمد', value: formatCurrency(active.approved), tone: 'success' },
              { label: 'قيد الاعتماد', value: formatCurrency(active.pending), tone: 'info' },
              { label: 'مرفوض', value: formatCurrency(active.rejected), tone: 'default' },
            ]}
          />

          {active.children.length > 0 && (
            <InspectorSection title={`تفصيل حسب ${SPEND_DIMENSION_LABELS[active.children[0].dimension]}`}>
              <div className="space-y-2">
                {active.children.map((c) => (
                  <div key={c.path.join('>')} className="flex items-center justify-between gap-2">
                    <span className="text-xs">{c.label} <span className="text-muted-foreground">({c.count})</span></span>
                    <span className="text-xs font-mono">{formatCurrency(c.total)}</span>
                  </div>
                ))}
              </div>
            </InspectorSection>
          )}

          <InspectorSection title="بنود الصرف">
            <div className="space-y-2">
              {active.expenses.map((e) => {
                const st = (e.approvalStatus || 'approved') as ApprovalStatus;
                return (
                  <div key={e.id} className="p-2 rounded border border-border bg-muted/20">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium truncate">{e.description}</span>
                      <span className="text-xs font-mono shrink-0">{formatCurrency(e.amount)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span className="text-[11px] text-muted-foreground font-mono">{e.date}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {EXPENSE_CATEGORY_LABELS[e.category as ExpenseCategory]}
                      </Badge>
                      <Badge className={`text-[10px] ${APPROVAL_STATUS_COLORS[st] || ''}`}>
                        {APPROVAL_STATUS_LABELS[st] || st}
                      </Badge>
                      {e.vendor && <span className="text-[11px] text-muted-foreground">{e.vendor}</span>}
                      {e.invoiceRef && <span className="text-[11px] text-muted-foreground">#{e.invoiceRef}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </InspectorSection>
        </InspectorPanel>
      )}
    </div>
  );
}
