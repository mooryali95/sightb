import { useMemo } from 'react';
import { Sankey, Tooltip, ResponsiveContainer, Rectangle, Layer } from 'recharts';
import { Card } from '@/components/ui/card';
import { formatCurrency } from '@/lib/finance';
import { buildCashFlowGraph } from '@/lib/cash-flow-graph';
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

export function CashFlowSankey({
  projectId, funds, expenses, custodies, paymentRequests, cashTransfers, resources, currency,
}: Props) {
  const data = useMemo(
    () => buildCashFlowGraph({ projectId, funds, expenses, custodies, paymentRequests, cashTransfers, resources }),
    [projectId, funds, custodies, expenses, paymentRequests, cashTransfers, resources],
  );

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
