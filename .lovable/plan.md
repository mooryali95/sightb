## الهدف

1. جعل **طلبات الصرف / السلف / الرواتب / الاستردادات** جزءاً متكاملاً من سلسلة المال (الدفعة ← العهدة ← المصروف) دون ازدواج.
2. ظهور **السلف للموارد** كتكلفة في الموازنة والأداء (CPI/EAC).
3. مراجعة جميع قيم الداشبورد للتأكد من صحتها.

---

## أولاً: المنطق المحاسبي الموصى به (Imprest / Petty Cash + Employee Advance)

أفضل ممارسة (مرجع PMI + IFRS Petty Cash + GAAP Employee Advances):

```text
دفعة من المالك (Fund)
   ├── مصروف مباشر  ────────────────► Expense (fund_id)
   ├── عهدة (Custody, source_fund_id) ──► مصروفات داخل العهدة (custody_id فقط)
   └── طلب صرف لمورد (Payment Request) ──► يُدفع من: Fund أو Custody أو خارجي
                                            └─► يُنشئ Expense تلقائياً بنفس المصدر
```

**قاعدة عدم الازدواج (موجودة بالفعل في DB):**

- العهدة المسحوبة من دفعة تُخصم بكامل مبلغها من رصيد الدفعة فوراً.
- المصروف داخل عهدة (`custody_id` + `source_fund_id`) لا يُحسب على الدفعة مرة ثانية.
- طلب الصرف عند `paid` يُنشئ Expense بـ `paid_from_fund_id` أو `paid_from_custody_id` (موجود).

**ما ينقص لإكمال الربط:**

- ربط طلب الصرف من نوع `advance` (سلفة موظف) كمصروف **قابل للتسوية لاحقاً** بدل تسجيله كتكلفة نهائية فوراً.
- ربط طلب الصرف بـ `budget_item_id` ليظهر في الموازنة.
- ربط طلب الصرف بـ `custody` كقناة سحب رسمية (موجود في الـ DB، ينقص الواجهة الكاملة وعرضه في تفاصيل العهدة).

---

## ثانياً: التغييرات المقترحة

### (أ) ربط طلبات الصرف بالموازنة والعهدة (واجهة + Store)

1. **حقل `budget_item_id` في نموذج إنشاء/تعديل طلب الصرف** (موجود في الـ DB عبر `auto_create_expense_on_payment` لكن غير معروض).
  - عند الإنشاء: يختار المستخدم بند الموازنة → يُحفظ على الـ Expense المُنشأ تلقائياً.
  - يجعل الصرف يظهر في **Variance Analysis** للبند.
2. **تعديل/حذف طلب الصرف:**
  - تعديل: متاح فقط في حالة `draft` للمحرر، و `admin` يستطيع في `submitted/under_review/approved/scheduled`.
  - حذف: متاح للمحرر في `draft`، وللـ Admin في `cancelled/rejected/draft` (موجود في RLS).
  - حذف طلب `paid` يتطلب حذف الـ Expense المُنشأ تلقائياً (cascade idempotent عبر `auto_created_expense_id`).
3. **زر "ربط بعهدة قائمة"** داخل تفاصيل العهدة:
  - يفتح قائمة طلبات الصرف لنفس المشروع التي لم تُدفع بعد → عند الدفع تُخصم من رصيد العهدة.
  - يُظهر داخل بطاقة العهدة قسماً منفصلاً: "مدفوع لطلبات صرف" مع روابط مرجعية.

### (ب) معاملة السلف (Employee Advance) كأصل قابل للاسترداد

النموذج الحالي يعامل السلفة كمصروف فوري. الموصى به:

- إضافة **حقلين** على `payment_requests`:
  - `is_advance_outstanding boolean` (افتراضياً `true` عند نوع `advance`)
  - `advance_settled_at timestamptz` (يُملأ عند التسوية)
- عند `paid` لطلب نوع `advance`:
  - يخرج من الكاش (Fund/Custody) ← يخفض "نقد المدير" ✅
  - **لا** يحتسب في "إجمالي المصروفات المعتمدة" حتى يُسوّى.
  - يظهر في كرت جديد: **"سلف قائمة على الموظفين" (Outstanding Employee Advances)** ضمن الميزانية كأصل.
- التسوية:
  - عند إنشاء استرداد (Reimbursement) أو خصم من راتب أو إعادة نقد → تربط بالسلفة وتُغلق `advance_settled_at` ويُنشأ Expense نهائي بقيمة الاستهلاك.
- **في حساب CPI/EAC:** السلفة غير المُسواة لا تدخل AC (Actual Cost) — فقط الجزء المُسوّى يدخل.

### (ج) إظهار السلف في الموازنة (Budget)

- في `BudgetSection` و`MonthlyBudgetPlan`: عمود جديد **"سلف معلقة"** بجانب "مصروف فعلي" لبند الموارد البشرية.
- عند ربط `budget_item_id` بالسلفة → تظهر في تفاصيل البند مع شريط منفصل.

---

## ثالثاً: تدقيق شامل لقيم الداشبورد (Audit)

سأراجع كل مقياس وأصلح الخلل إن وُجد:


| الشاشة / البطاقة                 | المقياس              | المصدر الحالي                                          | التدقيق المطلوب                                                           |
| -------------------------------- | -------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------- |
| ProjectDetail > ExecutiveSummary | إجمالي المصروفات     | sum(expenses.amount)                                   | يجب استثناء السلف غير المسواة                                             |
| ExecutiveSummary                 | المتبقي بيد المدير   | `getProjectFundsSummary`                               | تحقق من خصم العهد + المصروفات المباشرة فقط (لا ازدواج)                    |
| CashLedgerSection                | "مدفوع لطلبات الصرف" | محسوب من expenses ذات `notes LIKE 'منشأ تلقائياً%'`    | استبدالها بربط مباشر عبر `payment_requests.auto_created_expense_id`       |
| CashLedgerSection                | "مستحقات معلّقة"     | reimbursements `approved` + paymentRequests غير `paid` | يجب تمييز السلف عن الاستردادات                                            |
| BudgetSection                    | Variance لكل بند     | `actual = sum(expenses where budget_item_id = X)`      | لا يشمل السلف لأنها غير مربوطة الآن — يلزم ربطها                          |
| ChartsSection > CPI/SPI          | EV, AC, PV           | `lib/finance.ts`                                       | تحقق أن AC = sum(expenses approved) - sum(advances outstanding)           |
| Dashboard > HealthMatrix         | CPI<0.7 / Risk>=50%  | portfolio.ts                                           | إعادة الاحتساب بعد فصل السلف                                              |
| Dashboard > PortfolioPerformance | إيرادات vs مصروفات   | revenues + expenses                                    | إضافة استثناء السلف القائمة                                               |
| ResourcePayablesSection          | رصيد كل مورد         | `getResourceBalance`                                   | إضافة "سلفة قائمة" منفصلة                                                 |
| CustodySection                   | رصيد العهدة          | total - sum(expenses where custody_id)                 | يشمل تلقائياً مصروفات طلبات الصرف المدفوعة من العهدة ✅                    |
| FundsSection                     | المتبقي للدفعة       | `getFundRemaining`                                     | يخصم العهد المسحوبة + المصروفات المباشرة فقط ✅                            |
| CommitmentsSection               | spent_amount         | يُحدّث يدوياً                                          | يجب ربطه تلقائياً بالـ expenses ذات `commitment_id` (لا يوجد عمود حالياً) |


**نقاط حرجة سأصلحها:**

1. **مصدر "مدفوع لطلبات الصرف"** يعتمد على نص الملاحظات → سأستبدله بـ JOIN على `payment_requests.auto_created_expense_id`.
2. **السلف تظهر مرتين**: كمصروف + كطلب صرف معلق → سأفصل المنطق.
3. **Commitments** لا يوجد ربط فعلي بالمصروفات → سأضيف `commitment_id` للـ expenses.

---

## رابعاً: خطة التنفيذ (مراحل)

### المرحلة 1 — قاعدة البيانات (Migration)

- إضافة `is_advance_outstanding`, `advance_settled_at` لـ `payment_requests`.
- إضافة `budget_item_id` لـ `payment_requests`.
- إضافة `commitment_id` لـ `expenses`.
- Trigger: عند `paid` لطلب نوع `advance` → `is_advance_outstanding = true`.
- Trigger: عند ربط استرداد/إعادة نقد بسلفة → تحديث `advance_settled_at`.

### المرحلة 2 — Store / Slices

- تحديث `resourcePayableSlice` لدعم الحقول الجديدة.
- تحديث `lib/resource-payables.ts`: إضافة `outstandingAdvances`.
- تحديث `lib/funds.ts` و`lib/finance.ts`: استبعاد السلف غير المسواة من AC.

### المرحلة 3 — الواجهة

- نموذج طلب الصرف: إضافة اختيار بند الموازنة.
- `CustodySection`: تبويب فرعي "طلبات صرف مدفوعة من العهدة".
- `BudgetSection`: عمود "سلف معلقة".
- `ResourcePayablesSection`: كرت "سلف قائمة" + زر تسوية.
- `CashLedgerSection`: إعادة بناء "مدفوع لطلبات الصرف" عبر JOIN صحيح + فصل السلف.

### المرحلة 4 — تدقيق الداشبورد

- مراجعة كل بطاقة في الجدول أعلاه وإصلاح أي حساب خاطئ.
- إضافة وحدات اختبار (Vitest) جديدة لـ:
  - `getProjectFundsSummary` مع طلبات صرف.
  - حساب AC مع سلف قائمة.
  - رصيد العهدة مع طلبات صرف مدفوعة منها.

### المرحلة 5 — حذف/تعديل آمن

- التأكد من أن **كل** كيان (سلفة، استرداد، طلب صرف، عهدة، دفعة، مصروف، إيراد) قابل للحذف/التعديل وفق الأدوار، مع `ConfirmDeleteDialog` ورسائل واضحة عند المنع (مثل: لا يمكن حذف طلب صرف مدفوع قبل حذف المصروف المرتبط).

---

## نقطة للتأكيد قبل البدء

هل تريد التعامل مع **السلفة (advance)** بمنطق Outstanding (أصل قابل للاسترداد، لا يدخل CPI حتى يُسوّى) — وهو الأفضل محاسبياً —  
أم بمنطق التكلفة الفورية الحالي (يدخل CPI مباشرة)؟

الافضل محاسبيا

الخيار الأول يتطلب المرحلة 1 (Migration). الخيار الثاني يحذف معظم المرحلة 1 ويُبقي فقط ربط `budget_item_id`.