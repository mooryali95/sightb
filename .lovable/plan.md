# خطة: السلفة كأصل مدين (Receivable) منفصل عن المصروفات

## المبدأ المحاسبي
السلفة المدفوعة ليست مصروفاً، بل **ذمة مدينة على المورد**. لا تظهر في جدول المصروفات ولا في AC/CPI إلا بعد التسوية بمستندات. هذا يطابق IFRS ويزيل الالتباس الحالي.

## التغييرات على قاعدة البيانات

### 1. إيقاف إنشاء المصروف التلقائي للسلف
تعديل `auto_create_expense_on_payment`:
- إذا `request_type = 'advance'` → **لا يُنشأ مصروف**، فقط يُحدّث رصيد الدفعة/العهدة عبر آلية منفصلة.
- باقي الأنواع (reimbursement, salary, bonus) تبقى كما هي.

### 2. تتبع السلف القائمة في حساب الأرصدة
تعديل `check_fund_balance` و`check_custody_against_fund`:
- إضافة السلف المدفوعة غير المسوّاة (`payment_requests` حيث `status='paid' AND request_type='advance' AND is_advance_outstanding=true`) إلى المبلغ المحجوز من الدفعة/العهدة.

### 3. أعمدة جديدة على `payment_requests`
- `settlement_type` enum: `documented | cash_refund | payroll_deduction | written_off`
- `settled_amount` numeric (للرد الجزئي)
- `settlement_notes` text
- `refund_to_fund_id` uuid (عند رد نقدي لدفعة)
- `refund_to_custody_id` uuid (عند رد نقدي لعهدة)

### 4. ترحيل البيانات القديمة
- السلف المدفوعة الحالية ذات `auto_created_expense_id`: حذف صف المصروف المرتبط بأمان مع إبقاء السلفة.
- السلف المسوّاة سابقاً (`is_advance_outstanding=false`): إنشاء `settlement_type='documented'` مع الإبقاء على المصروف الفعلي.

### 5. تعديل التريغرات المرتبطة
- `cleanup_auto_expense_on_pr_delete`: يبقى كما هو لباقي الأنواع.
- `sync_outstanding_advance_to_expense`: يُلغى (لم تعد السلفة مرتبطة بمصروف).
- `mark_advance_outstanding_on_paid`: يبقى ويُضاف عليه التحقق من توفر الرصيد.

## التغييرات على الواجهة

### `ResourcePayablesSection.tsx`
- **زر "تسوية السلفة"** يفتح Dialog يطلب اختيار نوع التسوية:
  1. **تسوية بمستندات** → ينشئ مصروفاً فعلياً جديداً مرتبط بنفس مصدر السلفة (`fundId` أو `custodyId`).
  2. **رد نقدي** → يطلب المبلغ المُعاد + يعكس الحجز على الدفعة/العهدة. يدعم رد جزئي (الباقي يبقى قائماً أو يُسوّى بنوع آخر).
  3. **خصم من مستحقات** → يُغلق السلفة بدون أثر نقدي + يُسجل في كشف حساب المورد كتقاص.
  4. **شطب** (Admin فقط) → يتطلب سبباً، يعكس الحجز ويُسجل في `system_audit_log`.
- إخفاء السلف من قسم "المصروفات".
- بطاقة "السلف القائمة" تُبرز:
  - الإجمالي
  - عدد السلف
  - أقدم سلفة (تنبيه إذا > 60 يوم)

### `ExpensesSection.tsx`
- إزالة فلتر `is_outstanding_advance`، لأن السلف لن تظهر هنا أصلاً.
- إزالة شارة "سلفة قائمة" من جدول المصروفات.

### `BudgetSection.tsx`
- بانر "السلف القائمة" يبقى لكن يوضّح: "أصول مدينة على الموردين، لا تدخل التكلفة الفعلية حتى التسوية".

### `finance.ts`
- تحديث `calculateFundRemaining`: يطرح السلف القائمة من الرصيد المتاح للدفعة.
- تحديث `calculateCustodyRemaining`: يطرح السلف القائمة من رصيد العهدة.
- إزالة منطق `is_outstanding_advance` من حساب AC (لم يعد له صفوف مصروفات).

## تأثير الأرصدة (مثالك)
```text
دفعة 10,000 + سلفة 5,000 مدفوعة
→ نقد متاح للصرف من الدفعة = 5,000
→ سلف قائمة على المورد = 5,000
→ AC = 0 (لم تُسوّ بعد)

التسوية:
- بمستندات → AC = 5,000، نقد متاح يبقى 5,000
- رد نقدي كامل → AC = 0، نقد متاح يرجع 10,000
- خصم من راتب → AC = 0، نقد متاح يبقى 5,000، تُسجل ذمة مقاصة على المورد
```

## الاختبارات (Vitest)
- سيناريو رد نقدي كامل/جزئي
- سيناريو تسوية بمستندات تنشئ مصروفاً فعلياً
- سيناريو خصم من راتب لا يؤثر على رصيد الدفعة
- التحقق من أن السلفة القائمة تحجز رصيد الدفعة فعلياً
- التحقق من ترحيل البيانات القديمة بدون فقد

## ملفات ستتأثر
- `supabase/migrations/...` (تعديل تريغرات + أعمدة + ترحيل بيانات)
- `src/components/project/ResourcePayablesSection.tsx`
- `src/components/project/ExpensesSection.tsx`
- `src/components/project/BudgetSection.tsx`
- `src/store/slices/resourcePayableSlice.ts`
- `src/lib/finance.ts`, `src/lib/funds.ts`
- `src/lib/__tests__/resource-payables.test.ts`, `funds.test.ts`
- `src/types/project.ts`
