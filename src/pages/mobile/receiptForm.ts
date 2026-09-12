/**
 * The review form's values, what the OCR hands back, and the two pure steps
 * between them: a blank form for a project, and a form filled from a
 * reading. Kept out of the page so both can be tested without a browser.
 */
import type { ExpenseCategory } from '@/types/project';

export interface ExtractedReceipt {
  vendor_name?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  total_amount?: number | null;
  vat_amount?: number | null;
  is_vat_inclusive: boolean;
  currency?: string | null;
  suggested_category: ExpenseCategory;
  description?: string | null;
  line_items?: { description: string; amount: number }[];
  confidence: number;
}

export interface ReceiptForm {
  projectId: string;
  vendor: string;
  invoiceRef: string;
  date: string;
  amount: string;
  category: ExpenseCategory;
  description: string;
  isVatInclusive: boolean;
  isVatExempt: boolean;
}

export function emptyReceiptForm(projectId: string): ReceiptForm {
  return {
    projectId, vendor: '', invoiceRef: '', date: new Date().toISOString().split('T')[0], amount: '',
    category: 'other', description: '', isVatInclusive: false, isVatExempt: false,
  };
}

/** The form after an OCR reading: every field the reading has, the rest untouched. */
export function applyReading(form: ReceiptForm, ext: ExtractedReceipt): ReceiptForm {
  return {
    ...form,
    vendor: ext.vendor_name || form.vendor,
    invoiceRef: ext.invoice_number || form.invoiceRef,
    date: ext.invoice_date || form.date,
    amount: ext.total_amount ? String(ext.total_amount) : form.amount,
    category: ext.suggested_category || form.category,
    description: ext.description || form.description,
    isVatInclusive: !!ext.is_vat_inclusive,
  };
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
