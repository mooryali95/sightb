import { describe, it, expect } from 'vitest';
import {
  normalizeCurrency, currencySymbol, inspectCurrencyMix, DEFAULT_CURRENCY,
} from '@/lib/currency';

describe('normalizeCurrency', () => {
  it('passes ISO codes through, case-insensitively', () => {
    expect(normalizeCurrency('SAR')).toBe('SAR');
    expect(normalizeCurrency('usd')).toBe('USD');
  });

  it('maps the display symbols rows carried before the ISO migration', () => {
    expect(normalizeCurrency('ر.س')).toBe('SAR');
    expect(normalizeCurrency('ريال')).toBe('SAR');
    expect(normalizeCurrency('$')).toBe('USD');
    expect(normalizeCurrency('د.إ')).toBe('AED');
  });

  it('falls back to the default for empty, null or unknown input', () => {
    expect(normalizeCurrency('')).toBe(DEFAULT_CURRENCY);
    expect(normalizeCurrency(null)).toBe(DEFAULT_CURRENCY);
    expect(normalizeCurrency(undefined)).toBe(DEFAULT_CURRENCY);
    expect(normalizeCurrency('Klingon Darsek')).toBe(DEFAULT_CURRENCY);
  });

  it('ignores surrounding whitespace', () => {
    expect(normalizeCurrency('  SAR  ')).toBe('SAR');
  });
});

describe('currencySymbol', () => {
  it('returns the display symbol for a code', () => {
    expect(currencySymbol('SAR')).toBe('ر.س');
    expect(currencySymbol('USD')).toBe('$');
  });

  it('round-trips a symbol back to itself', () => {
    expect(currencySymbol('ر.س')).toBe('ر.س');
  });
});

describe('inspectCurrencyMix', () => {
  it('reports a single currency as unmixed', () => {
    const mix = inspectCurrencyMix([{ currency: 'SAR' }, { currency: 'SAR' }]);
    expect(mix.isMixed).toBe(false);
    expect(mix.currency).toBe('SAR');
    expect(mix.currencies).toEqual(['SAR']);
  });

  it('flags a portfolio holding more than one currency', () => {
    // The regression this guard exists for: getPortfolioSummary adds contract
    // values straight across projects, so a SAR project beside a USD one used
    // to produce a total with no unit — presented as fact and exported.
    const mix = inspectCurrencyMix([{ currency: 'SAR' }, { currency: 'USD' }]);
    expect(mix.isMixed).toBe(true);
    expect(mix.currencies).toEqual(['SAR', 'USD']);
  });

  it('treats a symbol and its ISO code as the same currency', () => {
    // Mid-migration a portfolio can hold both spellings; that is not a mix.
    const mix = inspectCurrencyMix([{ currency: 'ر.س' }, { currency: 'SAR' }]);
    expect(mix.isMixed).toBe(false);
    expect(mix.currency).toBe('SAR');
  });

  it('returns the default for an empty roll-up', () => {
    const mix = inspectCurrencyMix([]);
    expect(mix.isMixed).toBe(false);
    expect(mix.currency).toBe(DEFAULT_CURRENCY);
    expect(mix.currencies).toEqual([]);
  });

  it('sorts the codes so the result is stable to compare', () => {
    const mix = inspectCurrencyMix([{ currency: 'USD' }, { currency: 'AED' }, { currency: 'SAR' }]);
    expect(mix.currencies).toEqual(['AED', 'SAR', 'USD']);
  });

  it('counts a missing currency as the default rather than a separate unit', () => {
    const mix = inspectCurrencyMix([{ currency: 'SAR' }, {}]);
    expect(mix.isMixed).toBe(false);
  });
});
