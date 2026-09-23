import { describe, it, expect } from 'vitest';
import { errorMessage } from '../utils';

/**
 * errorMessage replaced a scatter of `catch (e: any) { toast.error(e.message) }`
 * in the payables section. The case that matters is the one the old code got
 * wrong: a throw that is not an Error produced an empty toast.
 */
describe('errorMessage', () => {
  it('returns the message of an Error', () => {
    expect(errorMessage(new Error('رصيد الدفعة غير كافٍ'))).toBe('رصيد الدفعة غير كافٍ');
  });

  it('passes a thrown string through', () => {
    expect(errorMessage('insufficient_permission')).toBe('insufficient_permission');
  });

  it('falls back when the throw carries no text', () => {
    expect(errorMessage(new Error(''))).toBe('فشلت العملية');
    expect(errorMessage(undefined)).toBe('فشلت العملية');
    expect(errorMessage({ code: 42 })).toBe('فشلت العملية');
  });

  it('reads the message off a plain database error object', () => {
    const dbErr = { message: 'المصروف يتجاوز الرصيد المتبقي للدفعة', code: 'P0001', details: null };
    expect(errorMessage(dbErr, 'تعذّر حفظ المصروف')).toBe('المصروف يتجاوز الرصيد المتبقي للدفعة');
    expect(errorMessage({ message: '' }, 'x')).toBe('x');
  });

  it('uses the caller\'s fallback when given one', () => {
    expect(errorMessage(null, 'تعذّر التراجع')).toBe('تعذّر التراجع');
  });
});
