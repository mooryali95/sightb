/** The four EVM figures and the four indices, or the ask for a baseline. */
import { formatCurrency } from '@/lib/finance';
import type { EVMMetrics } from '@/types/project';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Row } from './SsotRow';

export function EvmBlock({ evm, currency }: { evm: EVMMetrics | null; currency: string }) {
  return (
    <AccordionItem value="evm" className="border border-border rounded-lg bg-card px-3 md:px-4">
      <AccordionTrigger className="text-sm font-semibold py-3 hover:no-underline">
        مقاييس الأداء (EVM — PMI PMBOK 7)
      </AccordionTrigger>
      <AccordionContent className="pt-2 pb-4">
        {!evm ? (
          <div className="text-sm text-muted-foreground py-4 text-center">
            لا يوجد خط أساس معتمد — اعتمد خط أساس لتفعيل EVM.
          </div>
        ) : (
          <>
            <Row
              label="BAC — الميزانية الإجمالية"
              value={evm.bac}
              formula="Σ baseline_items.planned − managementReserve"
              sources={[{ kind: 'fn', label: 'calculateEVM()' }]}
              currency={currency}
            />
            <Row
              label="PV — القيمة المخططة حتى تاريخه"
              value={evm.pv}
              formula="Σ baseline distribution up to currentMonth"
              sources={[{ kind: 'fn', label: 'calculateEVM()' }]}
              currency={currency}
            />
            <Row
              label="EV — القيمة المكتسبة"
              value={evm.ev}
              formula="(percentComplete / 100) × BAC"
              sources={[{ kind: 'fn', label: 'calculateEVM()' }]}
              currency={currency}
            />
            <Row
              label="AC — التكلفة الفعلية"
              value={evm.ac}
              formula="Σ expenses.amount (excluding rejected + outstanding advances)"
              sources={[{ kind: 'fn', label: 'calculateEVM()' }]}
              currency={currency}
            />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
              <div className="rounded border border-border/60 bg-muted/30 p-2 text-center">
                <div className="text-[10px] text-muted-foreground">CPI</div>
                <div className="font-mono font-bold">{evm.cpi.toFixed(2)}</div>
                <div className="text-[10px] text-muted-foreground">EV / AC</div>
              </div>
              <div className="rounded border border-border/60 bg-muted/30 p-2 text-center">
                <div className="text-[10px] text-muted-foreground">SPI</div>
                <div className="font-mono font-bold">{evm.spi.toFixed(2)}</div>
                <div className="text-[10px] text-muted-foreground">EV / PV</div>
              </div>
              <div className="rounded border border-border/60 bg-muted/30 p-2 text-center">
                <div className="text-[10px] text-muted-foreground">EAC</div>
                <div className="font-mono font-bold" dir="ltr">{formatCurrency(evm.eac, currency)}</div>
                <div className="text-[10px] text-muted-foreground">BAC / CPI</div>
              </div>
              <div className="rounded border border-border/60 bg-muted/30 p-2 text-center">
                <div className="text-[10px] text-muted-foreground">VAC</div>
                <div className="font-mono font-bold" dir="ltr">{formatCurrency(evm.vac, currency)}</div>
                <div className="text-[10px] text-muted-foreground">BAC − EAC</div>
              </div>
            </div>
          </>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}
