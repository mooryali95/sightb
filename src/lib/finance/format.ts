/**
 * Money formatting.
 *
 * Amounts carry two decimal places everywhere. Dropping them (the previous
 * `maximumFractionDigits: 0`) put the UI at odds with the reconciliation
 * engine, which treats anything above `SSOT_TOLERANCE` — one halala — as a
 * genuine mismatch: the system raised a conflict over a difference the screen
 * could not render, so two figures the user saw as identical were reported as
 * disagreeing. Rounding is a display concern and must not hide an audited one.
 */
export function formatCurrency(amount: number, currency = 'ر.س'): string {
  return `${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}
