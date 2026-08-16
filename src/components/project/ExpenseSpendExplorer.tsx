import { useMemo, useState } from 'react';
import { formatCurrency } from '@/lib/finance';
import {
  buildSpendReport, buildSpendReportCSV, SPEND_DIMENSION_LABELS,
  type SpendDimension, type SpendGroup, type SpendFilters,
} from '@/lib/expense-analytics';
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
import { Download, Search, X, ChevronLeft } from 'lucide-react';

interface Props {
  projectName?: string;
  expenses: Expense[];
  resources: Resource[];
  custodies: Custody[];
  budgetItems: BudgetItem[];
}

const DIMENSIONS: SpendDimension[] = ['resource', 'vendor', 'category', 'responsible', 'budgetItem', 'custody'];

/**
 * مستكشف الصرف: يجيب بضغطة واحدة على «كم صُرف على هذا المورد، وفي ماذا؟»
 * فرز حسب بُعد + بحث + نطاق زمني + حالة، مع تفصيل كامل لكل مجموعة.
 */
export function ExpenseSpendExplorer({ projectName = '', expenses, resources, custodies, budgetItems }: Props) {
  const [dimension, setDimension] = useState<SpendDimension>('resource');
  const [query, setQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const look = useMemo(() => ({ resources, custodies, budgetItems }), [resources, custodies, budgetItems]);
  const filters: SpendFilters = useMemo(
    () => ({ query, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, category: category as ExpenseCategory | 'all', approvalStatus: status }),
    [query, dateFrom, dateTo, category, status],
  );

  const report = useMemo(
    () => buildSpendReport(expenses, dimension, filters, look),
    [expenses, dimension, filters, look],
  );

  const active: SpendGroup | null = openGroup ? report.groups.find((g) => g.key === openGroup) ?? null : null;
  const maxTotal = report.groups[0]?.total ?? 0;
  const hasFilters = !!(query || dateFrom || dateTo || category !== 'all' || status !== 'all');

  const handleExport = () => {
    const csv = buildSpendReportCSV(report, projectName);
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spend-by-${dimension}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetFilters = () => {
    setQuery(''); setDateFrom(''); setDateTo(''); setCategory('all'); setStatus('all');
  };

  return (
    <div className="stat-card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">مستكشف الصرف — تجميع وتتبع</h3>
          <p className="text-xs text-muted-foreground">
            اختر بُعد التجميع وابحث لترى إجمالي ما صُرف لكل جهة، وفي ماذا صُرف بالتفصيل.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport} disabled={report.groups.length === 0}>
          <Download className="w-3.5 h-3.5" />تصدير CSV
        </Button>
      </div>

      {/* Dimension switcher */}
      <div className="flex flex-wrap gap-1.5">
        {DIMENSIONS.map((d) => (
          <Button
            key={d}
            type="button"
            size="sm"
            variant={dimension === d ? 'default' : 'outline'}
            onClick={() => { setDimension(d); setOpenGroup(null); }}
          >
            {SPEND_DIMENSION_LABELS[d]}
          </Button>
        ))}
      </div>

      {/* Filters */}
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
        {hasFilters && (
          <Button variant="ghost" size="sm" className="gap-1" onClick={resetFilters}>
            <X className="w-3.5 h-3.5" />مسح الفلاتر
          </Button>
        )}
      </div>

      {/* Totals strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-lg border border-border bg-muted/30">
          <p className="text-xs text-muted-foreground">إجمالي المطابق</p>
          <p className="text-sm font-mono font-semibold mt-1">{formatCurrency(report.grandTotal)}</p>
        </div>
        <div className="p-3 rounded-lg border border-border bg-muted/30">
          <p className="text-xs text-muted-foreground">عدد المصروفات</p>
          <p className="text-sm font-mono font-semibold mt-1">{report.grandCount}</p>
        </div>
        <div className="p-3 rounded-lg border border-border bg-muted/30">
          <p className="text-xs text-muted-foreground">عدد المجموعات</p>
          <p className="text-sm font-mono font-semibold mt-1">{report.groups.length}</p>
        </div>
        <div className="p-3 rounded-lg border border-border bg-muted/30">
          <p className="text-xs text-muted-foreground">مرفوض (خارج الإجمالي)</p>
          <p className="text-sm font-mono font-semibold mt-1 text-destructive">{formatCurrency(report.rejectedTotal)}</p>
        </div>
      </div>

      {/* Groups */}
      {report.groups.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">لا توجد نتائج مطابقة للفلاتر</p>
      ) : (
        <div className="space-y-2">
          {report.groups.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => setOpenGroup(g.key)}
              className="w-full text-start p-3 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{g.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {g.count} مصروف · {g.share.toFixed(1)}%
                    {g.firstDate && ` · ${g.firstDate} → ${g.lastDate}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-end">
                    <p className="text-sm font-mono font-semibold">{formatCurrency(g.total)}</p>
                    {g.pending > 0 && (
                      <p className="text-[11px] text-amber-600">منها قيد الاعتماد: {formatCurrency(g.pending)}</p>
                    )}
                  </div>
                  <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mt-2">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${maxTotal > 0 ? (g.total / maxTotal) * 100 : 0}%` }}
                />
              </div>
              {g.byCategory.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {g.byCategory.slice(0, 4).map((c) => (
                    <Badge key={c.key} variant="outline" className="text-[10px]">
                      {c.label}: {formatCurrency(c.total)}
                    </Badge>
                  ))}
                  {g.byCategory.length > 4 && (
                    <Badge variant="outline" className="text-[10px]">+{g.byCategory.length - 4}</Badge>
                  )}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Drill-down */}
      {active && (
        <InspectorPanel
          open={!!active}
          onOpenChange={(v) => !v && setOpenGroup(null)}
          title={active.label}
          description={`${SPEND_DIMENSION_LABELS[dimension]} · ${active.count} مصروف`}
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

          <InspectorSection title="في ماذا صُرف">
            <div className="space-y-2">
              {active.byCategory.map((c) => (
                <div key={c.key} className="flex items-center justify-between gap-2">
                  <span className="text-xs">{c.label} <span className="text-muted-foreground">({c.count})</span></span>
                  <span className="text-xs font-mono">{formatCurrency(c.total)}</span>
                </div>
              ))}
            </div>
          </InspectorSection>

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
