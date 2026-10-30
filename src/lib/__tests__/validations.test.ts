/**
 * Unit tests for the form schemas. Every form on the create pages runs
 * its input through one of these before the store sees it, so what is
 * pinned is the normalisation they apply (Eastern Arabic digits, trim)
 * and the exact Arabic message each rule produces.
 */
import { describe, it, expect } from 'vitest';
import type { ZodTypeAny } from 'zod';
import {
  budgetItemSchema, companySchema, custodySchema, expenseSchema, inviteSchema, loginSchema, portfolioSchema,
  projectSchema, resetPasswordSchema, resourceSchema, revenueSchema,
} from '../validations';

const UUID = '3f2c9a1e-1b2d-4c3e-8f4a-5b6c7d8e9f00';

/** The messages a parse produced, keyed by field. */
function messages(schema: ZodTypeAny, input: unknown): Record<string, string> {
  const r = schema.safeParse(input);
  if (r.success) return {};
  return Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message]));
}
const parsed = <T,>(schema: ZodTypeAny, input: unknown): T => {
  const r = schema.safeParse(input);
  if (!r.success) throw new Error(JSON.stringify(r.error.issues));
  return r.data as T;
};

describe('text normalisation', () => {
  it('turns Eastern Arabic and Persian digits into Latin ones and trims the text', () => {
    expect(parsed(companySchema, { name: '  شركة ٢٠٢٦ ', description: ' فرع ۱۲ ' })).toEqual({ name: 'شركة 2026', description: 'فرع 12' });
  });

  it('rejects a name that is only spaces, and one that is too long, with the field\'s own message', () => {
    expect(messages(companySchema, { name: '   ' })).toEqual({ name: 'اسم الشركة مطلوب' });
    expect(messages(companySchema, { name: 'x'.repeat(101), description: 'y'.repeat(501) })).toEqual({ name: 'الاسم طويل جداً', description: 'الوصف طويل جداً' });
    expect(messages(companySchema, {})).toHaveProperty('name');
  });
});

describe('the portfolio and project forms', () => {
  it('insist on a real company id and read a chosen company as the selection message', () => {
    expect(messages(portfolioSchema, { name: 'محفظة', companyId: 'pick-one' })).toEqual({ companyId: 'يرجى اختيار الشركة' });
    expect(parsed(portfolioSchema, { name: 'محفظة', companyId: UUID })).toEqual({ name: 'محفظة', companyId: UUID });
  });

  it('bound the project\'s contract, duration and headcount with their messages', () => {
    const base = { name: 'مشروع', companyId: UUID, resourceCount: 3 };
    expect(messages(projectSchema, { ...base, contractValue: 0, durationMonths: 0 })).toEqual({
      contractValue: 'قيمة العقد يجب أن تكون أكبر من صفر', durationMonths: 'المدة يجب أن تكون شهر واحد على الأقل',
    });
    expect(messages(projectSchema, { ...base, contractValue: Number.NaN, durationMonths: 121 })).toEqual({
      contractValue: 'قيمة العقد مطلوبة', durationMonths: 'المدة طويلة جداً',
    });
    expect(messages(projectSchema, { ...base, contractValue: 1000, durationMonths: 1.5, resourceCount: 0 })).toMatchObject({ durationMonths: expect.any(String), resourceCount: expect.any(String) });
    expect(parsed(projectSchema, { ...base, name: ' مشروع ١ ', contractValue: 1000, durationMonths: 12, portfolioId: undefined, startDate: '2026-01-01' })).toMatchObject({ name: 'مشروع 1', startDate: '2026-01-01' });
  });
});

describe('the money forms', () => {
  it('require a positive expense with a category, a month in range, a date, and well-formed optional links', () => {
    expect(messages(expenseSchema, { description: 'x', amount: -1, category: '', month: 121, date: '' })).toEqual({
      amount: 'المبلغ يجب أن يكون أكبر من صفر', category: 'الفئة مطلوبة', month: expect.any(String), date: 'التاريخ مطلوب',
    });
    expect(messages(expenseSchema, { description: 'x', amount: Number.NaN, category: 'c', month: 1, date: 'd', custodyId: 'nope' })).toEqual({
      amount: 'المبلغ مطلوب', custodyId: expect.any(String),
    });
    // A number left undefined: zod 3 answered its English "Required"; zod 4's `error` covers a missing
    // value too, so the person reads the Arabic message.
    expect(messages(expenseSchema, { description: 'x', category: 'c', month: 1, date: 'd' })).toEqual({ amount: 'المبلغ مطلوب' });
    expect(parsed(expenseSchema, { description: ' وقود ', amount: 5, category: 'travel', month: 1, date: '2026-09-01', responsible: ' أحمد ', budgetItemId: null, resourceId: UUID })).toEqual({
      description: 'وقود', amount: 5, category: 'travel', month: 1, date: '2026-09-01', responsible: 'أحمد', budgetItemId: null, resourceId: UUID,
    });
  });

  it('let a budget item plan zero but not a negative amount, and a revenue only a positive one', () => {
    expect(parsed(budgetItemSchema, { description: 'بند', plannedAmount: 0, category: 'salary', month: null })).toMatchObject({ plannedAmount: 0, month: null });
    expect(messages(budgetItemSchema, { description: 'بند', plannedAmount: -1, category: 'salary' })).toEqual({ plannedAmount: 'المبلغ لا يمكن أن يكون سالباً' });
    expect(messages(revenueSchema, { description: 'دفعة', amount: 0, month: 0, date: '' })).toEqual({ amount: 'المبلغ يجب أن يكون أكبر من صفر', month: expect.any(String), date: 'التاريخ مطلوب' });
  });

  it('let a resource cost nothing but never less, and a custody hold a positive amount for a named holder', () => {
    expect(parsed(resourceSchema, { name: ' مهندس ', monthlyCost: 0 })).toEqual({ name: 'مهندس', monthlyCost: 0 });
    expect(messages(resourceSchema, { name: '', monthlyCost: -5 })).toEqual({ name: 'اسم المورد مطلوب', monthlyCost: 'التكلفة لا يمكن أن تكون سالبة' });
    expect(messages(custodySchema, { resourceName: ' ', amount: 0 })).toEqual({ resourceName: 'اسم المستلم مطلوب', amount: 'المبلغ يجب أن يكون أكبر من صفر' });
    expect(parsed(custodySchema, { resourceName: 'عمر', amount: 500, notes: ' عهدة ' })).toEqual({ resourceName: 'عمر', amount: 500, notes: 'عهدة' });
  });
});

describe('the account forms', () => {
  it('validate and trim the email and restrict the role and scope of an invite', () => {
    expect(parsed(inviteSchema, { email: ' a@x.co ', role: 'viewer', scopeType: 'system', scopeId: null })).toEqual({ email: 'a@x.co', role: 'viewer', scopeType: 'system', scopeId: null });
    expect(messages(inviteSchema, { email: 'not-mail', role: 'owner', scopeType: 'team', scopeId: 'x' })).toEqual({
      email: 'البريد الإلكتروني غير صالح', role: expect.any(String), scopeType: expect.any(String), scopeId: expect.any(String),
    });
  });

  it('ask for a valid email and six characters to sign in, and six to seventy-two to reset', () => {
    expect(messages(loginSchema, { email: 'x', password: '12345' })).toEqual({ email: 'البريد الإلكتروني غير صالح', password: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
    expect(parsed(loginSchema, { email: ' me@x.co ', password: '123456' })).toEqual({ email: 'me@x.co', password: '123456' });
    expect(messages(resetPasswordSchema, { password: 'x'.repeat(73) })).toEqual({ password: 'كلمة المرور طويلة جداً' });
    expect(messages(resetPasswordSchema, { password: '12345' })).toEqual({ password: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
  });
});
