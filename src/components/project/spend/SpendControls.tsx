/**
 * The grouping levels, the filters and the sort row of the spend explorer.
 */
import { SPEND_DIMENSION_LABELS, SPEND_SORT_LABELS, type SpendDimension, type SpendSortKey } from '@/lib/expense-analytics';
import { EXPENSE_CATEGORY_LABELS, APPROVAL_STATUS_LABELS } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, X, ArrowUpDown } from 'lucide-react';
import type { SpendView } from './useSpendView';

const DIMENSIONS: SpendDimension[] = ['resource', 'vendor', 'category', 'responsible', 'budgetItem', 'custody'];
const SORT_KEYS: SpendSortKey[] = ['total', 'count', 'label', 'recent'];

export function SpendControls({ view }: { view: SpendView }) {
  return (
    <>
      {/* مستويات التجميع */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-1">
            <Label className="text-xs">المستوى {i + 1}</Label>
            <Select
              value={view.levels[i] ?? 'none'}
              onValueChange={(v) => view.setLevel(i, v as SpendDimension | 'none')}
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
              value={view.query}
              onChange={(e) => view.setQuery(e.target.value)}
              placeholder="اسم مورد، جهة، وصف، رقم فاتورة…"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">من تاريخ</Label>
          <Input type="date" value={view.dateFrom} onChange={(e) => view.setDateFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">إلى تاريخ</Label>
          <Input type="date" value={view.dateTo} onChange={(e) => view.setDateTo(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">الفئة</Label>
          <Select value={view.category} onValueChange={view.setCategory}>
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
          <Select value={view.status} onValueChange={view.setStatus}>
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
          <Select value={view.sort.key} onValueChange={(v) => view.setSortKey(v as SpendSortKey)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SORT_KEYS.map((k) => (
                <SelectItem key={k} value={k}>{SPEND_SORT_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" className="gap-1" onClick={view.flipSortDir}>
          <ArrowUpDown className="w-3.5 h-3.5" />
          {view.sort.dir === 'desc' ? 'تنازلي' : 'تصاعدي'}
        </Button>
        {view.hasFilters && (
          <Button variant="ghost" size="sm" className="gap-1" onClick={view.resetFilters}>
            <X className="w-3.5 h-3.5" />مسح الفلاتر
          </Button>
        )}
      </div>
    </>
  );
}
