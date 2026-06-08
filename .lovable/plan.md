
# خطة ضبط المنطق المالي: عهدة ↔ دفعة (مصدر تمويل واحد فقط)

## القاعدة الذهبية
كل مصروف أو سلفة يجب أن يكون مربوطاً **بمصدر تمويل واحد فقط**:
- إما **عهدة** (`custodyId` / `paidFromCustodyId`)
- أو **دفعة** (`fundId` / `paidFromFundId`)
- **ليس الاثنين**، ولا **لا شيء** (متى كانت هناك دفعة نشطة).

العهدة نفسها مسحوبة من دفعة، فالربط المزدوج = احتساب مزدوج.

---

## 1) منع الازدواج في طبقة الواجهة (Frontend Guards)

### 1.1 نموذج المصروف — `src/components/project/ExpensesSection.tsx`
- إذا اختار المستخدم عهدة → تعطيل (disable) حقل الدفعة بصرياً مع تلميح: «المصدر = العهدة المختارة».
- إذا اختار دفعة → تعطيل اختيار عهدة.
- في `handleSubmit`: قبل الحفظ، إذا `custodyId && fundId` كلاهما محددان → `toast.error` ورفض الحفظ.
- إخفاء أيقونة «ربط بدفعة» في صف المصروف إذا كان `custodyId` موجوداً (تم بالفعل — التأكد من بقائه).

### 1.2 نموذج طلب السلفة — `src/components/project/ResourcePayablesSection.tsx`
- في حقل «مصدر الدفع» (`paySource`) السلوك ثنائي بالفعل (radio fund/custody)، نضيف:
  - تحقق صريح قبل إنشاء `paymentRequest`: `paidFromFundId XOR paidFromCustodyId` (واحد فقط، ليس صفراً وليس الاثنين عند الدفع).
  - رفض الحفظ مع رسالة عربية واضحة عند الإخلال.

### 1.3 ربط مرتجعات الدفع — حوار «تعديل الربط»
- منع ربط مرتجع لمصروف مربوط بعهدة بدفعة (والعكس). تحقق `expense.custodyId ↔ request.paidFromCustodyId` و `expense.fundId ↔ request.paidFromFundId`.

---

## 2) تحقق ما قبل حفظ التسوية (Pre-submit Validation)

في `FundsSection.tsx` → `handleSubmitSettlement`:
- قبل الإرسال، فحص كل بنود الدفعة:
  - `projectExpenses.filter(e => e.fundId === settleFor.id && e.custodyId)` → إن وُجد، رفض الحفظ مع قائمة بالمصروفات المخالفة وعرض زر «إصلاح تلقائي» يُفرغ `fundId` (لأن العهدة هي المصدر).
  - `projPRs.filter(p => p.paidFromFundId === settleFor.id && p.paidFromCustodyId)` → نفس المعالجة.
- إعادة حساب `settlementSpent` بعد التطبيع وإظهار الفرق المحدّث.

---

## 3) تفسير «المتبقي» في نافذة التسوية (UX)

بجانب خانة «المتبقي نقداً»:
- إذا لم توجد بنود غير مسوّاة (لا عهد مفتوحة من هذه الدفعة، لا سلف قائمة، لا نقد مع المدير) → عرض رسالة خضراء صريحة:
  «✓ كل مكونات الدفعة موثّقة. المتبقي = 0 لأنه لا توجد بنود غير مسوّاة.»
- إذا توجد بنود مفتوحة → عرضها كقائمة قابلة للطي تحت الخانة:
  - عهد مفتوحة (id، اسم المستلم، المبلغ المتبقي فيها)
  - سلف قائمة (المورد، المبلغ)
  - تحويلات نقدية صادرة
- زر «احتسب تلقائياً» يملأ خانة المتبقي بالقيمة المحسوبة من `getFundRemaining` لتسهيل الإقفال.

---

## 4) فحص شامل للبيانات الحالية (Data Audit)

سكربت تشخيصي يُعرض في تبويب **سجل التدقيق** أو كصفحة `/audit/financial-links`:
- **مصروفات بدون ربط**: `expenses` حيث `!fundId && !custodyId` ومشروعها فيه دفعة نشطة.
- **مصروفات بربط مزدوج**: `expenses` حيث `fundId && custodyId` (يجب أن تكون صفراً بعد القواعد الجديدة).
- **سلف بدون ربط**: `payment_requests` حيث `status='paid'` و `!paidFromFundId && !paidFromCustodyId`.
- **سلف بربط مزدوج**: نفس الجدول حيث `paidFromFundId && paidFromCustodyId`.
- لكل صف: زر **«إصلاح»** يفتح حواراً صغيراً يطلب اختيار المصدر الصحيح ثم يحدّث الصف.

---

## 5) قاعدة بيانات — قيود اختيارية (Defensive Layer)

ترحيل (migration) يضيف `CHECK constraints` تحظر الربط المزدوج على مستوى DB (طبقة دفاع أخيرة):
```sql
ALTER TABLE expenses
  ADD CONSTRAINT chk_single_funding_source
  CHECK (NOT (fund_id IS NOT NULL AND custody_id IS NOT NULL));

ALTER TABLE payment_requests
  ADD CONSTRAINT chk_single_pay_source
  CHECK (NOT (paid_from_fund_id IS NOT NULL AND paid_from_custody_id IS NOT NULL));
```
(يُنفّذ بعد سكربت الإصلاح في الخطوة 4 لتلافي فشل القيد على بيانات قائمة.)

---

## 6) اختبارات (Vitest)

في `src/lib/__tests__/funds.test.ts` و ملف جديد `financial-links.test.ts`:
- مصروف بـ `custodyId` فقط → يُحتسب على العهدة، لا على الدفعة مباشرة.
- مصروف بـ `fundId` فقط → يُحتسب على الدفعة.
- محاولة ربط بالاثنين → دالة التطبيع `normalizeExpenseSource()` تُلغي `fundId`.
- `settlementSpent` للدفعة بعد التطبيع = مجموع الخروج الفعلي → الفرق = 0.
- `getFundRemaining` يساوي 0 عند إقفال كل البنود.

---

## الملفات المتأثرة
| الملف | التعديل |
|---|---|
| `src/components/project/ExpensesSection.tsx` | حراس الازدواج + تعطيل الحقول المتقابلة |
| `src/components/project/ResourcePayablesSection.tsx` | XOR في `paySource` + تحقق ربط المرتجع |
| `src/components/project/FundsSection.tsx` | تحقق ما قبل التسوية + تفسير المتبقي + زر «احتسب تلقائياً» |
| `src/lib/funds.ts` | `normalizeExpenseSource()` + `auditFinancialLinks()` |
| `src/pages/SystemAuditLog.tsx` (أو جديد) | تبويب «روابط مالية» مع زر إصلاح |
| `supabase/migrations/*` | قيود CHECK دفاعية بعد الإصلاح |
| `src/lib/__tests__/financial-links.test.ts` | اختبارات جديدة |

## ترتيب التنفيذ
1. الحراس في الواجهة (1.1, 1.2, 1.3) — يمنع تفاقم البيانات.
2. تحقق ما قبل التسوية + تفسير المتبقي (2, 3) — يحل مشكلة الفرق الوهمي حالياً.
3. سكربت الفحص والإصلاح (4) — يطبّع البيانات القديمة.
4. قيود DB (5) — بعد التطبيع.
5. الاختبارات (6) — تثبت السلوك.

## تأكيدات
- لا تغيير على بنية الجداول الأساسية (فقط CHECK).
- صلاحيات Viewer تبقى للقراءة فقط.
- الأرقام إنجليزية، التقويم ميلادي، RTL محفوظ.
