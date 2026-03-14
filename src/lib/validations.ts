import { z } from 'zod';
import { normalizeDigits } from './utils';

/** Zod transform: normalizes Eastern-Arabic digits in string fields */
const normalizedString = (schema: z.ZodString) =>
  schema.transform((val) => normalizeDigits(val));

// Company form
export const companySchema = z.object({
  name: z.string().trim().min(1, 'اسم الشركة مطلوب').max(100, 'الاسم طويل جداً'),
  description: z.string().trim().max(500, 'الوصف طويل جداً').optional(),
});

// Portfolio form
export const portfolioSchema = z.object({
  name: z.string().trim().min(1, 'اسم المحفظة مطلوب').max(100, 'الاسم طويل جداً'),
  companyId: z.string().uuid('يرجى اختيار الشركة'),
  description: z.string().trim().max(500, 'الوصف طويل جداً').optional(),
});

// Project form
export const projectSchema = z.object({
  name: z.string().trim().min(1, 'اسم المشروع مطلوب').max(150, 'الاسم طويل جداً'),
  companyId: z.string().uuid('يرجى اختيار الشركة'),
  portfolioId: z.string().optional(),
  description: z.string().trim().max(500, 'الوصف طويل جداً').optional(),
  contractValue: z.number({ invalid_type_error: 'قيمة العقد مطلوبة' }).positive('قيمة العقد يجب أن تكون أكبر من صفر'),
  durationMonths: z.number().int().min(1, 'المدة يجب أن تكون شهر واحد على الأقل').max(120, 'المدة طويلة جداً'),
  resourceCount: z.number().int().min(1).max(1000),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// Expense form
export const expenseSchema = z.object({
  description: z.string().trim().min(1, 'الوصف مطلوب').max(300, 'الوصف طويل جداً'),
  amount: z.number({ invalid_type_error: 'المبلغ مطلوب' }).positive('المبلغ يجب أن يكون أكبر من صفر'),
  category: z.string().min(1, 'الفئة مطلوبة'),
  month: z.number().int().min(1).max(120),
  date: z.string().min(1, 'التاريخ مطلوب'),
  responsible: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(500).optional(),
  budgetItemId: z.string().uuid().optional().nullable(),
  resourceId: z.string().uuid().optional().nullable(),
  custodyId: z.string().uuid().optional().nullable(),
});

// Budget item form
export const budgetItemSchema = z.object({
  description: z.string().trim().min(1, 'الوصف مطلوب').max(300, 'الوصف طويل جداً'),
  plannedAmount: z.number({ invalid_type_error: 'المبلغ مطلوب' }).min(0, 'المبلغ لا يمكن أن يكون سالباً'),
  category: z.string().min(1, 'الفئة مطلوبة'),
  month: z.number().int().min(1).max(120).optional().nullable(),
  resourceId: z.string().uuid().optional().nullable(),
});

// Revenue form
export const revenueSchema = z.object({
  description: z.string().trim().min(1, 'الوصف مطلوب').max(300, 'الوصف طويل جداً'),
  amount: z.number({ invalid_type_error: 'المبلغ مطلوب' }).positive('المبلغ يجب أن يكون أكبر من صفر'),
  month: z.number().int().min(1).max(120),
  date: z.string().min(1, 'التاريخ مطلوب'),
});

// Resource form
export const resourceSchema = z.object({
  name: z.string().trim().min(1, 'اسم المورد مطلوب').max(100, 'الاسم طويل جداً'),
  role: z.string().trim().max(100).optional(),
  monthlyCost: z.number({ invalid_type_error: 'التكلفة مطلوبة' }).min(0, 'التكلفة لا يمكن أن تكون سالبة'),
});

// Custody form
export const custodySchema = z.object({
  resourceName: z.string().trim().min(1, 'اسم المستلم مطلوب').max(100, 'الاسم طويل جداً'),
  amount: z.number({ invalid_type_error: 'المبلغ مطلوب' }).positive('المبلغ يجب أن يكون أكبر من صفر'),
  notes: z.string().trim().max(500).optional(),
});

// Invite form
export const inviteSchema = z.object({
  email: z.string().trim().email('البريد الإلكتروني غير صالح').max(255),
  role: z.enum(['admin', 'editor', 'viewer']),
  scopeType: z.enum(['system', 'company', 'project']),
  scopeId: z.string().uuid().optional().nullable(),
});

// Login form
export const loginSchema = z.object({
  email: z.string().trim().email('البريد الإلكتروني غير صالح').max(255),
  password: z.string().min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
});

// Reset password form
export const resetPasswordSchema = z.object({
  password: z.string().min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل').max(72, 'كلمة المرور طويلة جداً'),
});
