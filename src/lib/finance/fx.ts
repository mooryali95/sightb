/**
 * An invoice in another currency. The books stay in the project's currency:
 * `amount` is what every figure reads, exactly as before. Beside it the
 * expense keeps what the invoice said (its amount and currency) and the rate
 * the person entering it used, so the conversion can be read and checked
 * later. No rate is fetched from anywhere: the rate that counts is the one
 * the bank or the supplier actually applied, and only the person holding the
 * invoice knows it. They give any two of {invoice amount, rate, booked
 * amount} and the third follows.
 */
export interface ForeignInvoice { originalAmount: number; originalCurrency: string; exchangeRate: number }

/** ISO 4217 codes offered first; any other three-letter code can be typed. */
export const FOREIGN_CURRENCIES: { code: string; name: string }[] = [
  { code: 'USD', name: 'دولار أمريكي' }, { code: 'EUR', name: 'يورو' }, { code: 'GBP', name: 'جنيه إسترليني' },
  { code: 'AED', name: 'درهم إماراتي' }, { code: 'KWD', name: 'دينار كويتي' }, { code: 'BHD', name: 'دينار بحريني' },
  { code: 'QAR', name: 'ريال قطري' }, { code: 'OMR', name: 'ريال عُماني' }, { code: 'EGP', name: 'جنيه مصري' },
  { code: 'JOD', name: 'دينار أردني' }, { code: 'TRY', name: 'ليرة تركية' }, { code: 'CNY', name: 'يوان صيني' },
  { code: 'SAR', name: 'ريال سعودي' },
];

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

/** The booked amount: the invoice amount at the rate, to the halala. */
export const convertAmount = (originalAmount: number, exchangeRate: number): number => round(originalAmount * exchangeRate, 2);

/** The rate implied by an invoice amount and what was actually booked, to six places (0 when it cannot be told). */
export const impliedRate = (originalAmount: number, bookedAmount: number): number =>
  (originalAmount > 0 && bookedAmount > 0 ? round(bookedAmount / originalAmount, 6) : 0);

/** Why a foreign invoice cannot be saved, in the user's words; null when it can. */
export function foreignInvoiceError(f: ForeignInvoice, projectCurrency: string): string | null {
  if (!/^[A-Z]{3}$/.test(f.originalCurrency)) return 'اختر عملة الفاتورة (رمز من ثلاثة أحرف مثل USD).';
  if (f.originalCurrency === projectCurrency) return 'عملة الفاتورة هي عملة المشروع نفسها: ألغِ خيار العملة الأخرى.';
  if (!(f.originalAmount > 0)) return 'أدخل مبلغ الفاتورة بعملتها.';
  if (!(f.exchangeRate > 0)) return 'أدخل سعر الصرف، أو المبلغ بعملة المشروع ليُحسب السعر.';
  return null;
}

/** «1,000.00 USD × 3.75», for the expense row. */
export function describeForeignInvoice(f: ForeignInvoice): string {
  const amount = f.originalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${amount} ${f.originalCurrency} × ${Number(f.exchangeRate.toFixed(6))}`;
}

/** The three fields of a row, when it carries a foreign invoice. */
export function foreignInvoiceOf(e: { originalAmount?: number; originalCurrency?: string; exchangeRate?: number }): ForeignInvoice | null {
  return e.originalCurrency && e.originalAmount && e.exchangeRate
    ? { originalAmount: e.originalAmount, originalCurrency: e.originalCurrency, exchangeRate: e.exchangeRate } : null;
}
