/**
 * Unit tests for the six thin services that had none: the server-computed
 * project summary, the receipt upload and its metadata, the audit trail
 * reader, the AI edge functions, and the read-side fund and payment
 * request wrappers. Two of them still read the client directly, so both
 * the facade and the client are replaced by the same recorder.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

interface Call { table: string; ops: [string, unknown[]][] }
const calls: Call[] = [];
const answers: unknown[] = [];
const invoke = vi.fn();
const rpc = vi.fn();
const upload = vi.fn();
function builder(table: string) {
  const call: Call = { table, ops: [] };
  calls.push(call);
  const b: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(answers.shift() ?? { data: null, error: null }).then(resolve, reject),
  };
  for (const op of ['select', 'eq', 'order', 'limit', 'update', 'maybeSingle']) {
    b[op] = (...args: unknown[]) => { call.ops.push([op, args]); return b; };
  }
  return b;
}
vi.mock('../db', async (orig) => ({
  ...(await orig<typeof import('../db')>()),
  db: {
    from: (table: string) => builder(table),
    invoke: (...a: unknown[]) => invoke(...a),
    rpc: (...a: unknown[]) => rpc(...a),
    storage: { from: (bucket: string) => ({ upload: (...a: unknown[]) => upload(bucket, ...a) }) },
  },
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => builder(table) } }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { fetchProjectFinancialSummary } from '../projectSummaryService';
import { uploadReceipt, attachReceiptMetadata } from '../expenseAttachmentService';
import { listSystemAuditEntries } from '../auditService';
import { generateExecutiveSummary, extractReceiptData } from '../aiService';
import { listFundsForProject, getFundById, listCashTransfersForFund } from '../fundService';
import { getPaymentRequestRaw, listSettlementEventsRaw, getExpenseRaw } from '../paymentRequestService';

const ops = (i = 0) => calls[i].ops.map(([op, args]) => [op, ...args]);

beforeEach(() => { calls.length = 0; answers.length = 0; invoke.mockReset(); rpc.mockReset(); upload.mockReset(); });
afterEach(() => { vi.useRealTimers(); });

describe('the server financial summary', () => {
  it('asks the function for the project and reads every figure as a number, with the defaults for what is missing', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T12:00:00Z'));
    rpc.mockResolvedValue({ data: { project_id: 'p1', contract_value: '100000', approved_change_orders: 20000, profit: null, margin_percent: '12.5' }, error: null });
    const s = await fetchProjectFinancialSummary('p1');
    expect(rpc).toHaveBeenCalledWith('project_financial_summary', { _project_id: 'p1' });
    expect(s).toMatchObject({ projectId: 'p1', currency: 'SAR', computedAt: '2026-09-15T12:00:00.000Z', contractValue: 100000, approvedChangeOrders: 20000, profit: 0, marginPercent: 12.5, custodyInHand: 0 });
    expect(Object.values(s).every((v) => typeof v === 'number' || typeof v === 'string')).toBe(true);
  });

  it('maps a null answer to an all-zero summary', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const s = await fetchProjectFinancialSummary('p1');
    expect(s.projectId).toBe('');
    expect(s.revisedContractValue).toBe(0);
  });

  it('translates the known server errors, passes an unknown message through, and falls back for a blank one', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'P0001: insufficient_permission for project' } });
    await expect(fetchProjectFinancialSummary('p1')).rejects.toThrow('لا تملك صلاحية عرض الملخص المالي لهذا المشروع.');
    rpc.mockResolvedValue({ data: null, error: { message: 'project_not_found' } });
    await expect(fetchProjectFinancialSummary('p1')).rejects.toThrow('المشروع غير موجود.');
    rpc.mockResolvedValue({ data: null, error: { message: 'unauthenticated' } });
    await expect(fetchProjectFinancialSummary('p1')).rejects.toThrow('يجب تسجيل الدخول لعرض الملخص المالي.');
    rpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } });
    await expect(fetchProjectFinancialSummary('p1')).rejects.toThrow('connection reset');
    rpc.mockResolvedValue({ data: null, error: {} });
    await expect(fetchProjectFinancialSummary('p1')).rejects.toThrow('تعذّر حساب الملخص المالي.');
  });
});

describe('receipts', () => {
  it('uploads under the user with a timestamped name and the blob\'s type, and answers null when storage refuses', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T12:00:00Z'));
    const blob = new Blob(['x'], { type: 'image/png' });
    upload.mockResolvedValue({ error: null });
    expect(await uploadReceipt('u1', blob, 'فاتورة')).toEqual({ path: `u1/${Date.now()}.png`, name: 'فاتورة' });
    expect(upload).toHaveBeenCalledWith('expense-receipts', `u1/${Date.now()}.png`, blob, { contentType: 'image/png', upsert: false });

    upload.mockResolvedValue({ error: { message: 'quota' } });
    expect(await uploadReceipt('u1', blob, 'فاتورة')).toBeNull();
  });

  it('falls back to jpg for a blob without a type', async () => {
    upload.mockResolvedValue({ error: null });
    const r = await uploadReceipt('u1', new Blob(['x']), 'صورة');
    expect(r?.path).toMatch(/^u1\/\d+\.jpg$/);
  });

  it('attaches the receipt with its upload time and the OCR data, or clears both', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T12:00:00Z'));
    answers.push({ data: null, error: null });
    await attachReceiptMetadata('e1', { path: 'u1/1.png', name: 'فاتورة' }, { total: 10 });
    expect(calls[0].table).toBe('expenses');
    expect(ops()).toEqual([['update', {
      receipt_attachments: [{ name: 'فاتورة', path: 'u1/1.png', uploaded_at: '2026-09-15T12:00:00.000Z' }], ocr_extracted_data: { total: 10 },
    }], ['eq', 'id', 'e1']]);

    answers.push({ data: null, error: null });
    await attachReceiptMetadata('e1', null, undefined);
    expect(ops(1)[0]).toEqual(['update', { receipt_attachments: [], ocr_extracted_data: null }]);

    answers.push({ data: null, error: { message: 'row locked' } });
    await expect(attachReceiptMetadata('e1', null, null)).rejects.toThrow('row locked');
  });
});

describe('the audit trail', () => {
  it('reads the newest entries up to the limit and maps them', async () => {
    answers.push({ data: [{ id: 'a1', user_id: 'u1', user_email: 'a@x.co', action: 'delete', entity_type: 'expense', entity_id: 'e1', entity_name: 'وقود', details: { amount: 5 }, created_at: '2026-09-01' }], error: null });
    expect(await listSystemAuditEntries(50)).toEqual([{ id: 'a1', userId: 'u1', userEmail: 'a@x.co', action: 'delete', entityType: 'expense', entityId: 'e1', entityName: 'وقود', details: { amount: 5 }, createdAt: '2026-09-01' }]);
    expect(calls[0].table).toBe('system_audit_log');
    expect(ops()).toEqual([['select', '*'], ['order', 'created_at', { ascending: false }], ['limit', 50]]);

    answers.push({ data: null, error: null });
    expect(await listSystemAuditEntries()).toEqual([]);
    expect(ops(1)[2]).toEqual(['limit', 500]);
    answers.push({ data: null, error: { message: 'admins only' } });
    await expect(listSystemAuditEntries()).rejects.toThrow('admins only');
  });
});

describe('the AI functions', () => {
  it('sends the whole context to the summary function and answers an empty summary for no data', async () => {
    invoke.mockResolvedValue({ data: { headline: 'بخير', highlights: ['أ'] }, error: null });
    expect(await generateExecutiveSummary({ projectId: 'p1', budget: 5 })).toEqual({ headline: 'بخير', highlights: ['أ'] });
    expect(invoke).toHaveBeenCalledWith('ai-executive-summary', { projectId: 'p1', budget: 5 });
    invoke.mockResolvedValue({ data: null, error: null });
    expect(await generateExecutiveSummary({})).toEqual({});
    invoke.mockResolvedValue({ data: null, error: new Error('quota') });
    await expect(generateExecutiveSummary({})).rejects.toThrow('quota');
    invoke.mockResolvedValue({ data: null, error: 'x' });
    await expect(generateExecutiveSummary({})).rejects.toThrow('فشل توليد الملخص الذكي');
  });

  it('extracts a receipt from the image and reports the three ways it can fail', async () => {
    invoke.mockResolvedValue({ data: { data: { total_amount: 42, confidence: 0.9 } }, error: null });
    expect(await extractReceiptData('AAA=', 'image/jpeg')).toEqual({ total_amount: 42, confidence: 0.9 });
    expect(invoke).toHaveBeenCalledWith('extract-receipt-data', { image_base64: 'AAA=', mime_type: 'image/jpeg' });
    invoke.mockResolvedValue({ data: null, error: { status: 500 } });
    await expect(extractReceiptData('AAA=', 'image/jpeg')).rejects.toThrow('فشل تحليل الصورة');
    invoke.mockResolvedValue({ data: { error: 'الصورة غير واضحة' }, error: null });
    await expect(extractReceiptData('AAA=', 'image/jpeg')).rejects.toThrow('الصورة غير واضحة');
    invoke.mockResolvedValue({ data: {}, error: null });
    await expect(extractReceiptData('AAA=', 'image/jpeg')).rejects.toThrow('لم يتم استخراج بيانات');
  });
});

describe('the read-side fund and payment request wrappers', () => {
  it('lists a project\'s funds by number, one fund by id, and a fund\'s transfers newest first', async () => {
    answers.push({ data: [{ id: 'f1' }], error: null });
    expect(await listFundsForProject('p1')).toEqual([{ id: 'f1' }]);
    expect(calls[0].table).toBe('project_funds');
    expect(ops(0)).toEqual([['select', '*'], ['eq', 'project_id', 'p1'], ['order', 'fund_number', { ascending: true }]]);

    answers.push({ data: null, error: null });
    expect(await getFundById('f9')).toBeNull();
    expect(ops(1)).toEqual([['select', '*'], ['eq', 'id', 'f9'], ['maybeSingle']]);

    answers.push({ data: [{ id: 't1' }], error: null });
    expect(await listCashTransfersForFund('f1')).toEqual([{ id: 't1' }]);
    expect(calls[2].table).toBe('cash_transfers');
    expect(ops(2)).toEqual([['select', '*'], ['eq', 'from_fund_id', 'f1'], ['order', 'transfer_date', { ascending: false }]]);
  });

  it('reads one payment request, its events newest first, and one expense', async () => {
    answers.push({ data: { id: 'pr1' }, error: null });
    expect(await getPaymentRequestRaw('pr1')).toEqual({ id: 'pr1' });
    expect(calls[0].table).toBe('payment_requests');
    expect(ops(0)).toEqual([['select', '*'], ['eq', 'id', 'pr1'], ['maybeSingle']]);

    answers.push({ data: null, error: null });
    expect(await listSettlementEventsRaw('pr1')).toEqual([]);
    expect(calls[1].table).toBe('settlement_events');
    expect(ops(1)).toEqual([['select', '*'], ['eq', 'payment_request_id', 'pr1'], ['order', 'created_at', { ascending: false }]]);

    answers.push({ data: null, error: null });
    expect(await getExpenseRaw('e1')).toBeNull();
    expect(calls[2].table).toBe('expenses');
    expect(ops(2)).toEqual([['select', '*'], ['eq', 'id', 'e1'], ['maybeSingle']]);
  });

  it.each([
    ['funds', () => listFundsForProject('p1'), 'فشل تحميل الدفعات'],
    ['a fund', () => getFundById('f1'), 'فشل تحميل الدفعة'],
    ['transfers', () => listCashTransfersForFund('f1'), 'فشل تحميل التحويلات النقدية'],
    ['a payment request', () => getPaymentRequestRaw('pr1'), 'فشل تحميل طلب الصرف'],
    ['settlement events', () => listSettlementEventsRaw('pr1'), 'فشل تحميل أحداث التسوية'],
    ['an expense', () => getExpenseRaw('e1'), 'فشل تحميل المصروف'],
  ])('fails loading %s with the client message or its own', async (_name, read, fallback) => {
    answers.push({ data: null, error: { message: 'timeout' } });
    await expect(read()).rejects.toThrow('timeout');
    answers.push({ data: null, error: { message: '' } });
    await expect(read()).rejects.toThrow(fallback);
  });
});
