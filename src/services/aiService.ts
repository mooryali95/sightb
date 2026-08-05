/**
 * aiService
 * ---------------------------------------------------------------
 * Wrapper around the AI edge functions (executive summary, receipt OCR).
 */

import { db } from './db';

export interface AISummary {
  headline?: string;
  highlights?: string[];
  concerns?: string[];
  recommendations?: string[];
  error?: string;
}

export async function generateExecutiveSummary(context: Record<string, unknown>): Promise<AISummary> {
  const { data, error } = await db.invoke<AISummary>('ai-executive-summary', context);
  if (error) throw error instanceof Error ? error : new Error('فشل توليد الملخص الذكي');
  return (data || {}) as AISummary;
}

export interface ExtractedReceipt {
  vendor_name?: string;
  invoice_number?: string;
  invoice_date?: string;
  total_amount?: number;
  suggested_category?: string;
  description?: string;
  is_vat_inclusive?: boolean;
  confidence: number;
}

export async function extractReceiptData(imageBase64: string, mimeType: string): Promise<ExtractedReceipt> {
  const { data, error } = await db.invoke<{ data?: ExtractedReceipt; error?: string }>(
    'extract-receipt-data',
    { image_base64: imageBase64, mime_type: mimeType }
  );
  if (error) throw error instanceof Error ? error : new Error('فشل تحليل الصورة');
  if (data?.error) throw new Error(data.error);
  if (!data?.data) throw new Error('لم يتم استخراج بيانات');
  return data.data;
}
