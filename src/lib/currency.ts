/**
 * Currency guards.
 *
 * Portfolio and company roll-ups add contract values, expenses and revenue
 * straight across their projects. That is only meaningful while every project
 * shares one currency — and nothing enforced it, so a portfolio holding a SAR
 * project next to a USD one produced a total with no unit, presented as fact
 * and exported to management.
 *
 * The deliberate choice here is to *surface* the condition rather than convert
 * it away. Automatic conversion needs a rate policy — IAS 21 asks for the spot
 * rate at initial recognition, the closing rate for monetary items, and FX
 * differences taken to profit or loss — and a single rate per pair produces
 * figures that cannot be audited. Worse, converting hides the mixing: a wrong
 * rate yields a wrong number that looks right. A refusal is visible.
 *
 * Conversion belongs in a later phase, only once a genuinely multi-currency
 * client exists, and then with dated rates and a record of which rate produced
 * which figure.
 */

/** Codes accepted by the `*_currency_iso4217` CHECK constraints in Postgres. */
export const SUPPORTED_CURRENCIES = [
  'SAR', 'USD', 'EUR', 'GBP', 'AED', 'KWD', 'BHD', 'QAR', 'OMR', 'JOD', 'EGP',
] as const;

export type CurrencyCode = typeof SUPPORTED_CURRENCIES[number];

export const DEFAULT_CURRENCY: CurrencyCode = 'SAR';

/**
 * Display symbols. Rows written before the ISO migration may still carry a
 * symbol instead of a code, so `normalizeCurrency` maps both directions.
 */
const SYMBOLS: Record<CurrencyCode, string> = {
  SAR: 'ر.س', USD: '$', EUR: '€', GBP: '£', AED: 'د.إ', KWD: 'د.ك',
  BHD: 'د.ب', QAR: 'ر.ق', OMR: 'ر.ع', JOD: 'د.أ', EGP: 'ج.م',
};

const ALIASES: Record<string, CurrencyCode> = {
  'ر.س': 'SAR', 'ر.س.': 'SAR', 'ريال': 'SAR', 'sr': 'SAR', '﷼': 'SAR',
  '$': 'USD', '€': 'EUR', '£': 'GBP',
  'د.إ': 'AED', 'د.ك': 'KWD', 'د.ب': 'BHD',
  'ر.ق': 'QAR', 'ر.ع': 'OMR', 'د.أ': 'JOD', 'ج.م': 'EGP',
};

/** Best-effort ISO code for a stored value; falls back to the default. */
export function normalizeCurrency(raw: string | null | undefined): CurrencyCode {
  const v = (raw ?? '').trim();
  if (!v) return DEFAULT_CURRENCY;
  const upper = v.toUpperCase();
  if ((SUPPORTED_CURRENCIES as readonly string[]).includes(upper)) return upper as CurrencyCode;
  return ALIASES[v] ?? ALIASES[v.toLowerCase()] ?? DEFAULT_CURRENCY;
}

/** Symbol to print next to an amount. */
export function currencySymbol(code: string | null | undefined): string {
  return SYMBOLS[normalizeCurrency(code)];
}

export interface CurrencyMix {
  /** Distinct ISO codes present, sorted, so the result is stable to compare. */
  currencies: CurrencyCode[];
  /** True when more than one currency is present — totals are then unsound. */
  isMixed: boolean;
  /** The single currency when unmixed; the default when the set is empty. */
  currency: CurrencyCode;
}

/**
 * Inspects the currencies behind a roll-up.
 *
 * Callers show `isMixed` to the reader instead of printing a total that
 * silently added two units together.
 */
export function inspectCurrencyMix(items: Array<{ currency?: string | null }>): CurrencyMix {
  const seen = new Set<CurrencyCode>();
  for (const item of items) seen.add(normalizeCurrency(item.currency));
  const currencies = [...seen].sort();
  return {
    currencies,
    isMixed: currencies.length > 1,
    currency: currencies.length === 1 ? currencies[0] : DEFAULT_CURRENCY,
  };
}
