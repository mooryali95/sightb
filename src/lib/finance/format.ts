import { currencySymbol } from '@/lib/currency';

/**
 * Money formatting.
 *
 * The currency argument is an ISO 4217 code as stored (`SAR`) and is rendered
 * as its symbol (`ر.س`). Appending the stored value verbatim was fine while
 * the column *held* the symbol; the moment the ISO migration landed, every
 * amount on every screen started reading "1,000.00 SAR". Code in, symbol out —
 * `currencySymbol` also accepts the old symbols, so rows written either side
 * of the migration render identically.
 *
 * Amounts carry two decimal places everywhere. Dropping them (the previous
 * `maximumFractionDigits: 0`) put the UI at odds with the reconciliation
 * engine, which treats anything above `SSOT_TOLERANCE` — one halala — as a
 * genuine mismatch: the system raised a conflict over a difference the screen
 * could not render, so two figures the user saw as identical were reported as
 * disagreeing. Rounding is a display concern and must not hide an audited one.
 */
export function formatCurrency(amount: number, currency?: string | null): string {
  return `${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currencySymbol(currency)}`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}
