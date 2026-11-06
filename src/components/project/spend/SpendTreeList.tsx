/**
 * The grouped rows of the explorer: expand a group to its next level,
 * open any row in the inspector, and page long lists.
 */
import { useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/finance';
import { SPEND_DIMENSION_LABELS, type SpendNode, type SpendTree } from '@/lib/expense-analytics';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronLeft, Plus } from 'lucide-react';
import { countAr } from '@/lib/plural';

/** عدد الصفوف المعروضة في كل دفعة — تحميل تدريجي للقوائم الكبيرة. */
const PAGE_SIZE = 40;

interface Props {
  tree: SpendTree;
  /** Changes with the levels, filters or sort (not with the rows), so a live update keeps the paging. */
  viewKey: string;
  onInspect: (node: SpendNode) => void;
}

export function SpendTreeList({ tree, viewKey, onInspect }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pages, setPages] = useState<Record<string, number>>({});

  const levelsKey = tree.dimensions.join('>');
  // New levels start folded; a new view starts on its first page.
  useEffect(() => { setExpanded(new Set()); }, [levelsKey]);
  useEffect(() => { setPages({}); }, [viewKey]);

  const maxTotal = tree.nodes[0]?.total ?? Math.max(0, ...tree.nodes.map((n) => n.total));

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const showMore = (key: string) =>
    setPages((prev) => ({ ...prev, [key]: (prev[key] ?? PAGE_SIZE) + PAGE_SIZE }));

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
              onClick={() => (hasChildren ? toggle(id) : onInspect(n))}
            >
              {hasChildren
                ? (open ? <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" /> : <ChevronLeft className="w-4 h-4 shrink-0 text-muted-foreground" />)
                : <span className="w-4" />}
              <span className="min-w-0">
                <span className="block text-sm font-medium truncate">{n.label}</span>
                <span className="block text-xs text-muted-foreground">
                  {SPEND_DIMENSION_LABELS[n.dimension]} · {countAr(n.count, 'expense')} · {n.share.toFixed(1)}%
                  {n.firstDate && ` · ${n.firstDate} → ${n.lastDate}`}
                </span>
              </span>
            </button>
            <div className="flex items-center gap-2 shrink-0">
              <div className="text-end">
                <p className="text-sm font-mono font-semibold">{formatCurrency(n.total)}</p>
                {n.pending > 0 && (
                  <p className="text-xs text-warning">قيد الاعتماد: {formatCurrency(n.pending)}</p>
                )}
              </div>
              <Button size="sm" variant="ghost" onClick={() => onInspect(n)}>تفاصيل</Button>
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

  if (tree.nodes.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">لا توجد نتائج مطابقة للفلاتر</p>;
  }
  return renderList(tree.nodes, 0, '__root__');
}
