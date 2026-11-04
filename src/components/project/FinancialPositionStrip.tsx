import { HelpCircle, Landmark, WalletCards } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatCurrency } from '@/lib/finance';
import { getProjectFundsSummary } from '@/lib/funds';
import type {
  CashTransfer, Custody, Expense, FundSettlement, PaymentRequest, Project,
  ProjectFund, ProjectSummary,
} from '@/types/project';

interface Props {
  project: Project;
  summary: ProjectSummary;
  totalCommitted: number;
  funds: ProjectFund[];
  settlements: FundSettlement[];
  expenses: Expense[];
  custodies: Custody[];
  paymentRequests: PaymentRequest[];
  cashTransfers: CashTransfer[];
}

export function FinancialPositionStrip({
  project, summary, totalCommitted, funds, settlements, expenses, custodies, paymentRequests, cashTransfers,
}: Props) {
  const cash = getProjectFundsSummary(project.id, funds, settlements, expenses, custodies, paymentRequests, cashTransfers);
  const availableToSpend = summary.totalPlanned - summary.totalActual - totalCommitted;

  return (
    <section className="mb-4 border-y border-border bg-card/60 px-4 py-3" aria-label="الوضع المالي المختصر">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 min-w-[170px]">
          <Landmark className="w-4 h-4 text-primary" />
          <div>
            <p className="text-xs font-semibold">وضع الموازنة والسيولة</p>
            <p className="text-xs text-muted-foreground">رقمان مختلفان يجيبان عن سؤالين مختلفين</p>
          </div>
        </div>
        <Metric label="الموازنة" value={summary.totalPlanned} currency={project.currency} />
        <Metric label="المصروف الفعلي" value={summary.totalActual} currency={project.currency} />
        <Metric label="الالتزامات المفتوحة" value={totalCommitted} currency={project.currency} />
        <Metric label="المتاح للصرف" value={availableToSpend} currency={project.currency} emphasis />
        <Metric label="النقد لدى المدير" value={cash.remainingInManagerHand} currency={project.currency} emphasis />
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="ms-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <HelpCircle className="w-3.5 h-3.5" /> لماذا يختلفان؟
            </button>
          </PopoverTrigger>
          <PopoverContent className="text-xs space-y-2 max-w-sm" side="bottom">
            <p><strong>المتاح للصرف</strong> = الموازنة − المصروف الفعلي − الالتزامات المفتوحة.</p>
            <p><strong>النقد لدى المدير</strong> = الدفعات المستلمة − المصروف المباشر − المبالغ المحوّلة للعهد − السلف القائمة.</p>
            <p className="text-muted-foreground">قد تكون الموازنة متاحة محاسبياً بينما النقد لم يصل بعد، أو يكون النقد موجوداً لكنه محجوز لالتزام.</p>
          </PopoverContent>
        </Popover>
      </div>
    </section>
  );
}

function Metric({ label, value, currency, emphasis = false }: { label: string; value: number; currency: string; emphasis?: boolean }) {
  return (
    <div className="min-w-[118px] border-s border-border ps-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm font-mono font-semibold ${emphasis ? (value >= 0 ? 'health-good' : 'text-destructive') : ''}`}>
        {formatCurrency(value, currency)}
      </p>
    </div>
  );
}