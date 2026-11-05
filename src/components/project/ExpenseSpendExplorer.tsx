/**
 * مستكشف الصرف: تجميع متعدد المستويات (مورد ← فئة ← بند ← تفاصيل الصرف)
 * مع بحث ونطاق زمني وفرز، تصدير CSV مطابق تماماً لما يظهر، وقوالب فلاتر محفوظة.
 *
 * The section owns the view (see spend/useSpendView), builds the tree, and
 * handles sharing and export; the controls, the templates bar, the rows
 * and the inspector live under spend/.
 */
import { useMemo, useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { formatCurrency } from '@/lib/finance';
import { buildSpendTree, buildSpendTreeCSV, type SpendNode } from '@/lib/expense-analytics';
import { getProjectOutstandingAdvances } from '@/lib/funds';
import { useStore } from '@/store/useStore';
import type { Resource, Custody, BudgetItem, Expense } from '@/types/project';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { decodeSpendView, encodeSpendView, buildShareUrl, withSpendView } from '@/lib/spend-url';
import { Download, Link2 } from 'lucide-react';
import { useSpendView } from './spend/useSpendView';
import { SpendControls } from './spend/SpendControls';
import { SpendTemplatesBar } from './spend/SpendTemplatesBar';
import { SpendTreeList } from './spend/SpendTreeList';
import { SpendNodeInspector } from './spend/SpendNodeInspector';
import { todayLocal } from '@/lib/utils';

interface Props {
  projectId?: string;
  projectName?: string;
  expenses: Expense[];
  resources: Resource[];
  custodies: Custody[];
  budgetItems: BudgetItem[];
}

export function ExpenseSpendExplorer({
  projectId, projectName = '', expenses, resources, custodies, budgetItems,
}: Props) {
  const { toast } = useToast();
  const view = useSpendView();
  const { levels, filters, sort, state: shareState, applyView } = view;
  const [active, setActive] = useState<SpendNode | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  // فتح رابط مشارَك: استعادة نفس المستويات والفلاتر والفرز.
  useEffect(() => {
    const decoded = decodeSpendView(location.search);
    if (decoded) applyView(decoded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const look = useMemo(() => ({ resources, custodies, budgetItems }), [resources, custodies, budgetItems]);
  // An outstanding advance writes no expense row, so the tile beside the
  // rejected total reads the project's requests, net of what came back.
  const paymentRequests = useStore((s) => s.paymentRequests);
  const tree = useMemo(
    () => ({
      ...buildSpendTree(expenses, levels, filters, look, sort),
      outstandingAdvanceTotal: getProjectOutstandingAdvances(projectId, paymentRequests).total,
    }),
    [expenses, levels, filters, look, sort, projectId, paymentRequests],
  );

  const handleShare = useCallback(async () => {
    const url = buildShareUrl(window.location.origin, location.pathname, shareState, location.hash, location.search);
    navigate({ pathname: location.pathname, search: `?${withSpendView(location.search, shareState)}`, hash: location.hash }, { replace: true });
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'تم نسخ رابط التقرير', description: 'يفتح نفس العرض بنفس الفلاتر والفرز والنطاق الزمني.' });
    } catch {
      toast({ title: 'رابط التقرير', description: url });
    }
  }, [shareState, location.pathname, location.search, location.hash, navigate, toast]);

  const handleExport = () => {
    const csv = buildSpendTreeCSV(tree, projectName, { filters, sort, dimensionPath: levels });
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spend-${levels.join('-')}-${todayLocal()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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

      <SpendControls view={view} />

      <SpendTemplatesBar projectId={projectId} current={shareState} onApply={applyView} />

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

      <SpendTreeList tree={tree} viewKey={encodeSpendView(shareState)} onInspect={setActive} />

      {active && <SpendNodeInspector node={active} onClose={() => setActive(null)} />}
    </div>
  );
}
