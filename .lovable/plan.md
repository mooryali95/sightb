
# تحليل شامل: نظام السلف كذمم مدينة (Outstanding Advances)

## ١. خلل محاسبي حرج — أنواع التسوية تُعيد رصيد الدفعة بالخطأ

في `settleAdvance` (resourcePayableSlice.ts:432-501) كل التسويات تضع `is_advance_outstanding=false`. ولأن `getFundOutstandingAdvances` يحسب فقط الصفوف ذات `isAdvanceOutstanding=true`، فإن أي تسوية تُحرّر الحجز من الدفعة فوراً. هذا صحيح فقط لـ `cash_refund` لأن النقد فعلاً عاد. أما:

- **`payroll_deduction`**: النقد خرج فعلياً للمورد، وسيُقاص لاحقاً من راتبه. يجب أن يبقى الفرق محسوباً كاستنزاف للدفعة (ينتقل إلى مصروف "خصم من راتب" أو يبقى في رصيد عكسي على المورد)، لا أن يُعاد للدفعة.
- **`written_off`**: النقد ضاع نهائياً. يجب احتسابه كمصروف/خسارة (يدخل AC)، وليس تحريراً لرصيد الدفعة.
- **`documented`**: يُنشئ مصروفاً يحجز الرصيد، لكن السطر السابق كان يحجزه عبر outstanding — فيتم استبدال الحجز بحجز معادل ✅ (سليم).

**النتيجة العملية**: شطب 5,000 ر.س يعيد 5,000 لرصيد الدفعة كأن لا شيء حصل، ويرفع الرصيد المتاح للصرف كذباً.

### الإصلاح المقترح
في `getFundSpent`/`getCustodyOutstandingAdvances` احسب أيضاً السلف المسوّاة بـ `payroll_deduction` أو `written_off` (لأن النقد خرج ولم يعد). الأنظف:

```ts
// outstanding أو سلفة مسوّاة بنوع لا يُعيد نقداً
p.status === 'paid'
  && p.requestType === 'advance'
  && (p.isAdvanceOutstanding
      || ['payroll_deduction', 'written_off'].includes(p.settlementType))
```

بديل أنظف محاسبياً: عند `written_off` و`payroll_deduction` ننشئ مصروفاً تلقائياً بفئة (خسارة/مقاصة راتب) بدل ترك الحجز عائماً، وبذلك يدخل AC بشكل صريح ويظهر في CPI.

---

## ٢. الرد النقدي الجزئي يفقد الجزء المتبقي

عند `cash_refund` مع `settledAmount < amount`، السطر يُغلق كاملاً (`is_advance_outstanding=false`) فيُعاد كامل المبلغ للدفعة بالحساب، رغم أن المورد رد الجزء فقط.

### الإصلاح
- إما رفض الجزئي وفرض تسوية كاملة بمكوّنات متعددة.
- أو تخزين `refunded_amount` منفصلاً عن `settled_amount`، وجعل `getFundOutstandingAdvances` يحسب `(amount - refunded_amount)` للسلف ذات الرد الجزئي مع إبقاء `is_advance_outstanding=true` حتى التسوية الكاملة.
- أو السماح بتسوية مركّبة: جزء `cash_refund` + جزء `documented`/`payroll_deduction` في عملية واحدة.

التوصية: **الخيار الثاني** + شريط تقدم في الديالوج يُظهر المتبقي.

---

## ٣. غياب أثر دفتري للرد النقدي في كشف الحسابات

`CashLedgerSection` يبني سجلاً من الحركات الفعلية، لكن `cash_refund` لا يُسجَّل كـ "نقد داخل" — يظهر فقط كاختفاء الحجز. هذا يُربك المراجعة:

### الإصلاح
- إنشاء سطر inflow في `cash_ledger_entries` (إن وُجد جدول، وإلا في عرض مركّب) عند تسوية `cash_refund`، يحمل: التاريخ، المبلغ، المرجع `advance_refund:{id}`، المصدر (الدفعة/العهدة).
- في `CashLedgerSection` ضمّ هذه الحركات للعرض حتى يُقرأ السجل سرديًا.

---

## ٤. لا يوجد قيد للأقدمية (Aging) رغم ذكره في الخطة

الخطة تنص على "أقدم سلفة (تنبيه إذا > 60 يوم)" لكن البطاقة في `ResourcePayablesSection:435-443` تعرض الإجمالي والعدد فقط.

### الإصلاح
- إضافة `oldestAdvanceDays` للحساب.
- شارة حمراء عند > 60 يوم، وصفراء بين 30-60.
- ضمّها في `BudgetAlerts`/`SmartBudgetAlerts` كتنبيه شامل على مستوى المشروع.

---

## ٥. صلاحية الشطب (`written_off`) بدون أثر في سجل التدقيق

الكود يتحقق من `isAdmin` على الواجهة فقط (resourcePayableSlice لا يفرض). الشطب يحرر مالاً من رصيد الدفعة دون أن يُكتب صفّاً في `system_audit_log`.

### الإصلاح
- تريغر DB على `UPDATE payment_requests WHEN settlement_type='written_off'` يكتب في `system_audit_log` تلقائياً.
- RLS/Policy تمنع غير الأدمن من تعيين `settlement_type='written_off'`.
- في الواجهة: تأكيد ثانٍ (ConfirmDialog) مع إدخال السبب كحقل إلزامي (موجود نصياً، لكن بدون validation server-side).

---

## ٦. حذف السلفة المدفوعة عبر `deletePaymentRequest`

الزر في السطر 884 يحذف السلفة "المدفوعة" مباشرة. بعد تعطيل auto-create-expense للسلف، التريغر `cleanup_auto_expense_on_pr_delete` يبقى نظرياً لكن لن يجد ما يحذفه (لا يوجد `auto_created_expense_id`). الخطر: حذف سلفة قائمة يعكس الحجز فوراً بدون قيد لتدقيق (هل النقد رجع فعلاً؟).

### الإصلاح
- منع الحذف بمجرد `status='paid' AND request_type='advance'`.
- إجبار المستخدم على استخدام مسار التسوية (cash_refund/written_off) بدلاً من الحذف.
- استثناء وحيد: أدمن مع سبب صريح مكتوب في audit log.

---

## ٧. منطق إخفاء السلف من المصروفات هشّ

`ExpensesSection` يصفّي `isOutstandingAdvance` فقط. لكن:
- بعض الصفوف القديمة قد يكون `is_outstanding_advance=false` بسبب الترحيل، ومع ذلك مصدرها سلفة.
- المصروفات المُنشأة الآن عبر `settleAdvance(documented)` لا تحمل علامة مميّزة سوى وصف "تسوية سلفة بمستندات:".

### الإصلاح
- إضافة عمود `source_payment_request_id` على `expenses` يربط المصروف بالسلفة المُسوّاة.
- في `ExpensesSection` يمكن إظهار شارة "ناتج عن تسوية سلفة" بدلاً من الإخفاء (الإخفاء كان لإزالة الازدواج، والمصروف من تسوية موثقة يجب أن يظهر فعلاً).
- مراجعة الفلتر: لا يُخفى مصروف `documented settlement` — يُخفى فقط `is_outstanding_advance=true` (الذي لم يعد يُنشأ أصلاً).

---

## ٨. حقل `is_outstanding_advance` على `expenses` أصبح زائداً

بعد تعطيل auto-create للسلف، لا يُنشأ أي مصروف بـ `is_outstanding_advance=true` من قِبل DB. الكود الأمامي (settleAdvance) يُمرّر `is_outstanding_advance: false` صراحةً (resourcePayableSlice.ts:466). العمود يبقى للتوافق العكسي مع البيانات القديمة فقط.

### الإصلاح
- ترحيل ينقل أي مصروف قديم بـ `is_outstanding_advance=true` إلى الحذف (لأن السلفة الآن تتبع في `payment_requests` فقط).
- بعد التحقق، deprecation للعمود في مرحلة لاحقة.

---

## ٩. تغطية اختبارية ناقصة

`resource-payables.test.ts` و`funds.test.ts` لا يغطّيان (يحتاج تأكيد بقراءة الملفين):
- سيناريو `cash_refund` كامل وجزئي على fund وcustody.
- سيناريو `written_off` وأثره على رصيد الدفعة (سيكشف الخلل #1).
- سيناريو `payroll_deduction` وأثره.
- سيناريو `documented` يُنشئ مصروفاً بمبلغ مساوٍ.
- حالة fund balance check حين توجد سلف قائمة (محاولة دفع تتجاوز الرصيد المتاح بعد طرح السلف).

---

## ١٠. تنبيهات وتجربة استخدام

- **`BudgetSection`**: لا يوجد banner "سلف قائمة" رغم ذكره في الخطة.
- **`SmartNotifications`**: لا تظهر سلف قائمة عمرها > 60 يوم.
- **`ResourcePayablesSection`**: لا يوجد عرض لـ "سجل تسويات السلفة" (history per advance) — مفيد لتدقيق التسويات المركبة لاحقاً.
- **بدائل الفئة في `documented`**: يُجبر المستخدم على اختيار `expenseCategory`، لكن الخيار الافتراضي `other` يفسد تصنيف التكاليف. يُفضّل تذكر فئة آخر مصروف للمورد، أو اشتقاقها من البند الموازني المرتبط.

---

## ١١. ملاحظات معمارية إضافية

- `outstandingAdvances` في `ResourcePayablesSection:357` يستخدم `(r as any).isAdvanceOutstanding` — النوع موجود في `PaymentRequest`، لا حاجة للـcast.
- `getFundOutstandingAdvances` و`getCustodyOutstandingAdvances` تستثني الحالة `status='paid' AND isAdvanceOutstanding=false AND settlementType='written_off'/'payroll_deduction'` — كما في خلل #1.
- `getProjectFundsSummary` يُمرَّر `paymentRequests` لكن لا يتم تمرير `projReqs` المُفلتر من بعض المكوّنات (تحقق سريع: `FundsSection`, `Dashboard charts`).

---

## خطة التحسين (مرتبة بالأولوية)

| # | المهمة | الأثر |
|---|---|---|
| 1 | إصلاح حساب الرصيد ليأخذ بعين الاعتبار `written_off`/`payroll_deduction` (أو إنشاء مصروف تلقائي بفئة خسارة/مقاصة) | حرج — يمنع تضخم وهمي للرصيد |
| 2 | إنفاذ صلاحية الشطب على مستوى DB + audit log تلقائي | حرج — أمان وحوكمة |
| 3 | منع `deletePaymentRequest` للسلف المدفوعة وتوجيهها لمسار التسوية | حرج |
| 4 | تطبيق التحقق من جزئية الرد (`refunded_amount` منفصل، تسوية مركّبة) | عالي |
| 5 | تسجيل `cash_refund` كحركة inflow في كشف الحسابات | عالي |
| 6 | إضافة Aging + شارة > 60 يوم + تنبيه ذكي | متوسط |
| 7 | ربط المصروف الناتج عن `documented` بالسلفة عبر `source_payment_request_id` | متوسط |
| 8 | ترحيل تنظيف لـ `expenses.is_outstanding_advance=true` المتبقية، ثم deprecation للعمود | منخفض |
| 9 | تغطية اختبارية شاملة للسيناريوهات الأربعة + الرصيد المحجوز | عالي (يكشف #1) |
| 10 | banner في `BudgetSection` + عرض history للتسويات | منخفض |

---

## ملفات ستتأثر بالتنفيذ
- `supabase/migrations/...` (تريغرات الشطب/المقاصة، عمود `source_payment_request_id`، audit، تنظيف بيانات).
- `src/lib/funds.ts` (تعديل `getFundOutstandingAdvances` ليشمل التسويات غير العائدة).
- `src/store/slices/resourcePayableSlice.ts` (التسوية المركبة، الجزئية، منع الحذف للمدفوعة، إنشاء مصروف تلقائي للشطب).
- `src/components/project/ResourcePayablesSection.tsx` (شارة Aging، شريط الجزئية، إخفاء زر الحذف، history).
- `src/components/project/CashLedgerSection.tsx` (إدراج refunds).
- `src/components/project/BudgetSection.tsx` (banner).
- `src/components/project/ExpensesSection.tsx` (شارة "ناتج عن تسوية" + الفلتر).
- `src/components/SmartNotifications.tsx` (تنبيه > 60 يوم).
- `src/lib/__tests__/resource-payables.test.ts`, `funds.test.ts` (سيناريوهات جديدة).
- `src/types/project.ts` (حقول جديدة على `Expense` و`PaymentRequest`).

---

هل أبدأ بتنفيذ البنود الحرجة (1-3) في دفعة أولى، أم تفضّل ترتيباً مختلفاً؟
