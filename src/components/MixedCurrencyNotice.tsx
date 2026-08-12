import { AlertTriangle } from 'lucide-react';

interface MixedCurrencyNoticeProps {
  /** Distinct ISO codes found in the roll-up. */
  currencies: string[];
  /** Where the unsound totals appear, e.g. "هذه المحفظة". */
  scopeLabel: string;
}

/**
 * Shown when a roll-up spans more than one currency, in place of trusting the
 * totals beside it. The totals are plain sums, so mixing currencies makes them
 * a sum of unlike units. Deliberately not auto-converted — see
 * `src/lib/currency.ts` for the reasoning.
 */
export function MixedCurrencyNotice({ currencies, scopeLabel }: MixedCurrencyNoticeProps) {
  if (currencies.length < 2) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg border border-warning/40 bg-warning/10 px-3.5 py-2.5 mb-4"
    >
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 health-warning" aria-hidden />
      <div className="text-xs leading-relaxed">
        <p className="font-semibold mb-0.5">المجاميع أدناه غير قابلة للجمع</p>
        <p className="text-muted-foreground">
          تضم {scopeLabel} مشاريع بعملات مختلفة (
          <span dir="ltr" className="font-mono">{currencies.join(' · ')}</span>
          ). الأرقام المجمّعة تجمع وحدات مختلفة، فلا يُعتمد عليها — راجع كل مشروع
          على حدة. لا يجري تحويل تلقائي عمداً: التحويل يحتاج سياسة أسعار مؤرّخة
          وفق معيار IAS 21.
        </p>
      </div>
    </div>
  );
}
