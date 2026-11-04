/** The database triggers that protect the single source of truth. */
import { Database } from 'lucide-react';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

const GUARDS: [string, string][] = [
  ['check_fund_balance', 'يمنع أي مصروف يتجاوز رصيد الدفعة/العهدة (يحسب: مباشر + عهد + سلف + تحويلات)'],
  ['validate_cash_transfer', 'يمنع تحويل نقدي يتجاوز رصيد الدفعة، ويمنع التحويل لعهدة مُقفلة'],
  ['auto_close_custody_on_exhaustion', 'يغلق العهدة تلقائياً عند استنزافها (spent ≥ amount + cash_in)'],
  ['enforce_expense_fund_link', 'يفرض ربط المصروف بدفعة نشطة أو عهدة'],
  ['enforce_single_expense_source', 'يمنع ربط المصروف بدفعة وعهدة معاً (مصدر واحد فقط)'],
  ['recalc_payment_request_from_events', 'يعيد حساب حالة السلفة من settlement_events (SSOT للتسويات)'],
  ['recalc_fund_settlement_spent', 'يعيد حساب إجمالي التسوية من المصروفات الفعلية'],
  ['protect_signed_settlement', 'يمنع تعديل/حذف تسوية موقعة (غير المدير)'],
  ['protect_pr_with_settlements', 'يمنع حذف طلب صرف عليه أحداث تسوية'],
  ['protect_last_owner', 'يمنع حذف/تخفيض آخر Owner للنظام'],
];

export function GuardsBlock() {
  return (
    <AccordionItem value="guards" className="border border-border rounded-lg bg-card px-3 md:px-4">
      <AccordionTrigger className="text-sm font-semibold py-3 hover:no-underline">
        حراس السلامة (DB Triggers) — الحماية النهائية للـ SSOT
      </AccordionTrigger>
      <AccordionContent className="pt-2 pb-4 space-y-2 text-xs">
        {GUARDS.map(([name, desc]) => (
          <div key={name} className="flex items-start gap-2 border-b border-border/40 last:border-b-0 pb-2 last:pb-0">
            <Database className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
            <div>
              <code className="text-xs font-mono text-warning">{name}</code>
              <div className="text-muted-foreground mt-0.5">{desc}</div>
            </div>
          </div>
        ))}
      </AccordionContent>
    </AccordionItem>
  );
}
