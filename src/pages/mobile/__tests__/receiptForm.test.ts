/**
 * applyReading is the only place an OCR reading touches the form. A field
 * the reading lacks must survive, and the VAT flag must follow the reading
 * even when it says "not inclusive".
 */
import { describe, it, expect } from 'vitest';
import { applyReading, emptyReceiptForm } from '../receiptForm';

describe('applyReading', () => {
  it('fills what the reading has and keeps the rest', () => {
    const form = { ...emptyReceiptForm('p-1'), description: 'مكتوب يدوياً', isVatInclusive: true };
    const next = applyReading(form, {
      vendor_name: 'مكتبة', total_amount: 420, suggested_category: 'printing', is_vat_inclusive: false, confidence: 0.8,
    });
    expect(next).toMatchObject({
      projectId: 'p-1', vendor: 'مكتبة', amount: '420', category: 'printing', description: 'مكتوب يدوياً', isVatInclusive: false,
    });
    expect(next.date).toBe(form.date);
  });

  it('ignores a null or zero figure', () => {
    const form = { ...emptyReceiptForm('p-1'), amount: '50', invoiceRef: 'X-1' };
    const next = applyReading(form, { total_amount: 0, invoice_number: null, suggested_category: 'other', is_vat_inclusive: true, confidence: 0.5 });
    expect(next.amount).toBe('50');
    expect(next.invoiceRef).toBe('X-1');
    expect(next.isVatInclusive).toBe(true);
  });
});
