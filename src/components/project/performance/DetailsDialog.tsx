/**
 * The details of one category or one budget item in the chosen range:
 * the four figures, the items of a category, and the counted expenses.
 */
import { GitCompare } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/finance';
import { getExpensesForBudgetItem, type CategoryGroup, type ItemComparison } from '@/lib/budget-comparison';
import type { Expense } from '@/types/project';
import { Metric } from './ComparisonParts';

export type DetailContext =
  | { kind: 'group'; group: CategoryGroup }
  | { kind: 'item'; item: ItemComparison; group: CategoryGroup };

export function DetailsDialog({
  context, open, onOpenChange, expenses, currency, fromMonth, toMonth,
}: {
  context: DetailContext | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  expenses: Expense[];
  currency: string;
  fromMonth: number;
  toMonth: number;
}) {
  if (!context) return null;
  const isGroup = context.kind === 'group';
  const title = isGroup ? context.group.label : context.item.description;
  const subtitle = isGroup
    ? `الفئة • ${context.group.items.length} بند فرعي`
    : `بند ضمن ${context.group.label}`;

  // Build list of {itemDesc, expense}
  const rows: { itemDesc: string; itemId: string; expense: Expense }[] = [];
  const itemsToShow = isGroup ? context.group.items : [context.item];
  for (const it of itemsToShow) {
    const list = getExpensesForBudgetItem(it.id, expenses, fromMonth, toMonth);
    for (const e of list) rows.push({ itemDesc: it.description, itemId: it.id, expense: e });
  }
  rows.sort((a, b) => (a.expense.date || '').localeCompare(b.expense.date || ''));

  const totalActual = rows.reduce((s, r) => s + (Number(r.expense.amount) || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>{subtitle} • الفترة: الشهر {fromMonth} إلى {toMonth}</DialogDescription>
        </DialogHeader>

        {/* Summary strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <Metric label="الموازنة (BAC)" value={formatCurrency(isGroup ? context.group.planned : context.item.planned, currency)} />
          <Metric label="المخطط للفترة" value={formatCurrency(isGroup ? context.group.plannedToDate : context.item.plannedToDate, currency)} />
          <Metric label="الفعلي للفترة" value={formatCurrency(isGroup ? context.group.actual : context.item.actual, currency)} />
          <Metric label="المتبقي للفترة" value={formatCurrency(isGroup ? context.group.remaining : context.item.remaining, currency)} />
        </div>

        {/* Sub-items table (for groups) */}
        {isGroup && (
          <div className="rounded-md border border-border overflow-hidden">
            <div className="px-3 py-2 bg-muted/40 text-[11px] font-semibold text-muted-foreground">البنود المكوِّنة</div>
            <div className="divide-y divide-border">
              {context.group.items.map(it => (
                <div key={it.id} className="px-3 py-2 grid grid-cols-12 gap-2 items-center text-xs">
                  <span className="col-span-5 truncate">{it.description}</span>
                  <span className="col-span-2 text-muted-foreground">BAC</span>
                  <span className="col-span-2 tabular-nums">{formatCurrency(it.planned, currency)}</span>
                  <span className="col-span-1 text-muted-foreground">فعلي</span>
                  <span className="col-span-2 tabular-nums text-foreground">{formatCurrency(it.actual, currency)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Expense list */}
        <div className="rounded-md border border-border overflow-hidden">
          <div className="px-3 py-2 bg-muted/40 text-[11px] font-semibold text-muted-foreground flex items-center justify-between">
            <span>المصروفات الفعلية المربوطة ({rows.length})</span>
            <span className="tabular-nums">إجمالي: {formatCurrency(totalActual, currency)}</span>
          </div>
          {rows.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">لا توجد مصروفات مربوطة ضمن الفترة المختارة.</div>
          ) : (
            <div className="divide-y divide-border max-h-72 overflow-y-auto">
              {rows.map(({ itemDesc, expense }) => (
                <div key={expense.id} className="px-3 py-2 grid grid-cols-12 gap-2 items-center text-xs">
                  <span className="col-span-3 text-muted-foreground tabular-nums">{expense.date}</span>
                  <span className="col-span-4 truncate">{expense.description}</span>
                  {isGroup
                    ? <span className="col-span-3 truncate text-muted-foreground">{itemDesc}</span>
                    : <span className="col-span-3 truncate text-muted-foreground">{expense.vendor || expense.responsible || '—'}</span>}
                  <span className="col-span-2 text-left tabular-nums font-semibold">{formatCurrency(Number(expense.amount) || 0, currency)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
