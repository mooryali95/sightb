/**
 * The colours charts draw with, in one place.
 *
 * Charts set colours as SVG attributes, which do not resolve CSS variables
 * reliably, so these are literal values chosen to sit between the light and
 * dark theme tokens (--success, --warning, --destructive, --info) and read on
 * both backgrounds. STATUS carries meaning; SERIES is the categorical palette
 * for pies and bars, ordered so neighbours differ in hue and lightness, the
 * brand gold first.
 */
export const STATUS = {
  good: 'hsl(160, 60%, 42%)',
  watch: 'hsl(38, 92%, 50%)',
  bad: 'hsl(0, 72%, 51%)',
  info: 'hsl(210, 70%, 50%)',
  neutral: 'hsl(220, 9%, 60%)',
  /** Spend past the budget: apart from "bad" so the two read as separate slices. */
  over: 'hsl(340, 75%, 55%)',
} as const;

export const SERIES = [
  'hsl(40, 55%, 55%)',
  STATUS.good,
  STATUS.watch,
  STATUS.bad,
  'hsl(280, 60%, 50%)',
  'hsl(190, 80%, 42%)',
  'hsl(330, 70%, 50%)',
  'hsl(50, 80%, 45%)',
] as const;
