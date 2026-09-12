/**
 * Turns the database's own guard messages (raised by triggers on the
 * expenses table) into the wording the form shows, and hides row-level
 * security wording behind a plain permission message.
 */
export function translateDbError(msg?: string): string {
  if (!msg) return '';
  if (/يجب ربط المصروف/.test(msg)) return 'يجب ربط المصروف بدفعة نشطة. اضغط "إقرار الاستلام" أعلى النموذج إن كانت الدفعة قيد التحويل.';
  if (/المصروف يتجاوز الرصيد المتبقي للدفعة/.test(msg)) return msg;
  if (/المصروف يتجاوز رصيد العهدة/.test(msg)) return msg;
  if (/لا يمكن تغيير ربط المصروف/.test(msg)) return msg;
  if (/row-level security/i.test(msg)) return 'لا تملك صلاحية تنفيذ هذه العملية.';
  return msg;
}
