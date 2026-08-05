/**
 * expenseAttachmentService
 * ---------------------------------------------------------------
 * Receipt upload + OCR metadata persistence for expenses captured in
 * the field. Kept apart from the expense slice because it deals with
 * binary storage rather than relational writes.
 */

import { db, unwrap } from './db';

const BUCKET = 'expense-receipts';

export interface UploadedReceipt {
  path: string;
  name: string;
}

/** Uploads a receipt image, returning null when the upload fails (non-fatal). */
export async function uploadReceipt(
  userId: string,
  blob: Blob,
  label: string
): Promise<UploadedReceipt | null> {
  const ext = blob.type.split('/')[1] || 'jpg';
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await db.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) return null;
  return { path, name: label };
}

export async function attachReceiptMetadata(
  expenseId: string,
  receipt: UploadedReceipt | null,
  ocrData: unknown
): Promise<void> {
  unwrap(
    await db
      .from('expenses')
      .update({
        receipt_attachments: receipt
          ? [{ name: receipt.name, path: receipt.path, uploaded_at: new Date().toISOString() }]
          : [],
        ocr_extracted_data: ocrData || null,
      })
      .eq('id', expenseId),
    'تعذّر حفظ مرفقات المصروف'
  );
}
