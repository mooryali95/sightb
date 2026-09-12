import { useMemo } from 'react';
import { Sankey, Tooltip, ResponsiveContainer, Rectangle, Layer } from 'recharts';
import { Card } from '@/components/ui/card';
import { formatCurrency } from '@/lib/finance';
import type {
  ProjectFund, Expense, Custody, PaymentRequest, CashTransfer, Resource,
} from '@/types/project';

interface Props {
  projectId: string;
  funds: ProjectFund[];
  expenses: Expense[];
  custodies: Custody[];
  paymentRequests: PaymentRequest[];
  cashTransfers: CashTransfer[];
  resources: Resource[];
  currency?: string;
}

interface SankeyNode { name: string }
interface SankeyLink { source: number; target: number; value: number }

export function CashFlowSankey({
  projectId, funds, expenses, custodies, paymentRequests, cashTransfers, resources, currency,
}: Props) {
  const data = useMemo(() => {
    const projFunds = funds.filter(f => f.projectId === projectId);
    const projCustodies = custodies.filter(c => c.projectId === projectId);
    const projExpenses = expenses.filter(e => e.projectId === projectId && e.approvalStatus !== 'rejected');
    const projPRs = paymentRequests.filter(p => p.projectId === projectId);
    const projTransfers = (cashTransfers || []).filter(t => t.projectId === projectId);

    const nodes: SankeyNode[] = [];
    const idx = new Map<string, number>();
    const getNode = (name: string) => {
      if (!idx.has(name)) { idx.set(name, nodes.length); nodes.push({ name }); }
      return idx.get(name)!;
    };
    const links: SankeyLink[] = [];
    const addLink = (from: string, to: string, value: number) => {
      if (value <= 0 || from === to) return;
      links.push({ source: getNode(from), target: getNode(to), value });
    };

    // الدفعات → عهد (مباشرة)
    for (const cu of projCustodies) {
      if (cu.sourceFundId) {
        const fund = projFunds.find(f => f.id === cu.sourceFundId);
        if (fund) addLink(`دفعة ${fund.fundNumber}`, `عهدة: ${cu.resourceName}`, Number(cu.amount));
      }
    }
    // الدفعات → عهد (عبر تحويل نقدي)
    for (const t of projTransfers) {
      const fund = projFunds.find(f => f.id === t.fromFundId);
      const cu = projCustodies.find(c => c.id === t.toCustodyId);
      if (fund && cu) addLink(`دفعة ${fund.fundNumber}`, `عهدة: ${cu.resourceName}`, Number(t.amount));
    }
    // الدفعات → سلف موردين قائمة
    for (const pr of projPRs) {
      if (pr.requestType === 'advance' && pr.isAdvanceOutstanding && pr.paidFromFundId) {
        const fund = projFunds.find(f => f.id === pr.paidFromFundId);
        const res = resources.find(r => r.id === pr.resourceId);
        if (fund) addLink(`دفعة ${fund.fundNumber}`, `سلفة: ${res?.name || 'مورد'}`, Number(pr.amount));
      }
    }
    // ردود سلف نقدية → عودة للدفعة/العهدة
    for (const pr of projPRs) {
      if (pr.requestType === 'advance' && (pr.refundedAmount ?? 0) > 0) {
        const res = resources.find(r => r.id === pr.resourceId);
        const fromLabel = `سلفة: ${res?.name || 'مورد'}`;
        if (pr.refundToFundId) {
          const fund = projFunds.find(f => f.id === pr.refundToFundId);
          if (fund) addLink(fromLabel, `دفعة ${fund.fundNumber}`, Number(pr.refundedAmount));
        } else if (pr.refundToCustodyId) {
          const cu = projCustodies.find(c => c.id === pr.refundToCustodyId);
          if (cu) addLink(fromLabel, `عهدة: ${cu.resourceName}`, Number(pr.refundedAmount));
        }
      }
    }
    // الدفعات → مصروف مباشر (بدون عهدة)
    for (const e of projExpenses) {
      if (!e.fundId) continue;
      if (e.custodyId) continue; // محسوب على العهدة بالأعلى
      const fund = projFunds.find(f => f.id === e.fundId);
      if (fund) addLink(`دفعة ${fund.fundNumber}`, `مصروف: ${e.category}`, Number(e.amount));
    }
    // العهد → مصروفات
    for (const e of projExpenses) {
      if (!e.custodyId) continue;
      const cu = projCustodies.find(c => c.id === e.custodyId);
      if (cu) addLink(`عهدة: ${cu.resourceName}`, `مصروف: ${e.category}`, Number(e.amount));
    }

    if (links.length === 0) return null;
    return { nodes, links };
  }, [projectId, funds, custodies, expenses, paymentRequests, cashTransfers, resources]);

  if (!data) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        لا توجد بيانات تدفق نقدي لعرضها بعد. أضف دفعات وعهد ومصروفات لرؤية المخطط.
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="mb-3">
        <h3 className="text-sm font-bold text-foreground">مخطط تدفق النقد</h3>
        <p className="text-xs text-muted-foreground">من أين جاء كل ريال وأين ذهب</p>
      </div>
      <div style={{ width: '100%', height: Math.max(320, data.nodes.length * 28) }}>
        <ResponsiveContainer>
          <Sankey
            data={data}
            nodePadding={20}
            nodeWidth={12}
            linkCurvature={0.5}
            iterations={64}
            node={<SankeyNodeRenderer />}
            link={{ stroke: 'hsl(var(--primary) / 0.25)' }}
          >
            <Tooltip
              formatter={(value: number) => formatCurrency(Number(value), currency)}
            />
          </Sankey>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

/** What recharts injects into the node element; all optional because the element is created empty. */
interface SankeyNodeProps {
  x?: number; y?: number; width?: number; height?: number; index?: number;
  payload?: { name?: string };
}

function SankeyNodeRenderer(props: SankeyNodeProps) {
  const { x = 0, y = 0, width = 0, height = 0, index = 0, payload } = props;
  const isSource = payload?.name?.startsWith('دفعة');
  const isCustody = payload?.name?.startsWith('عهدة');
  const fill = isSource
    ? 'hsl(var(--primary))'
    : isCustody
      ? 'hsl(var(--warning))'
      : 'hsl(var(--success))';
  return (
    <Layer key={`node-${index}`}>
      <Rectangle x={x} y={y} width={width} height={height} fill={fill} fillOpacity={0.95} />
      <text
        textAnchor={x < 200 ? 'start' : 'end'}
        x={x < 200 ? x + width + 6 : x - 6}
        y={y + height / 2}
        fontSize={11}
        fill="hsl(var(--foreground))"
        dy="0.35em"
      >
        {payload?.name}
      </text>
    </Layer>
  );
}
