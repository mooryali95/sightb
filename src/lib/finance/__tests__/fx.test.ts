import { describe, it, expect } from 'vitest';
import { convertAmount, describeForeignInvoice, foreignInvoiceError, foreignInvoiceOf, impliedRate } from '../fx';

describe('a foreign invoice', () => {
  it('books the invoice amount at the rate, to the halala', () => {
    expect(convertAmount(1000, 3.75)).toBe(3750);
    expect(convertAmount(19.99, 3.7512)).toBe(74.99);     // 74.986488
    expect(convertAmount(0.1 + 0.2, 10)).toBe(3);         // no float tail
  });

  it('tells the rate from the invoice amount and what was booked', () => {
    expect(impliedRate(1000, 3765.5)).toBe(3.7655);
    expect(impliedRate(3, 10)).toBe(3.333333);
    expect(impliedRate(0, 10)).toBe(0);
    expect(impliedRate(10, 0)).toBe(0);
  });

  it('round-trips: the implied rate books the same amount again', () => {
    for (const [original, booked] of [[1000, 3765.5], [249.99, 937.46], [7, 26.27]]) {
      expect(convertAmount(original, impliedRate(original, booked))).toBe(booked);
    }
  });

  it('says in plain words why it cannot be saved', () => {
    const ok = { originalAmount: 100, originalCurrency: 'USD', exchangeRate: 3.75 };
    expect(foreignInvoiceError(ok, 'SAR')).toBeNull();
    expect(foreignInvoiceError({ ...ok, originalCurrency: 'usd' }, 'SAR')).toMatch(/عملة الفاتورة/);
    expect(foreignInvoiceError({ ...ok, originalCurrency: 'SAR' }, 'SAR')).toMatch(/عملة المشروع نفسها/);
    expect(foreignInvoiceError({ ...ok, originalAmount: 0 }, 'SAR')).toMatch(/مبلغ الفاتورة/);
    expect(foreignInvoiceError({ ...ok, exchangeRate: 0 }, 'SAR')).toMatch(/سعر الصرف/);
  });

  it('describes itself for the expense row, and is absent unless all three parts are there', () => {
    expect(describeForeignInvoice({ originalAmount: 1000, originalCurrency: 'USD', exchangeRate: 3.75 })).toBe('1,000.00 USD × 3.75');
    expect(foreignInvoiceOf({ originalAmount: 5, originalCurrency: 'EUR', exchangeRate: 4.1 })).toEqual({ originalAmount: 5, originalCurrency: 'EUR', exchangeRate: 4.1 });
    expect(foreignInvoiceOf({ originalAmount: 5, originalCurrency: 'EUR' })).toBeNull();
    expect(foreignInvoiceOf({})).toBeNull();
  });
});
