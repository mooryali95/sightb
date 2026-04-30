
# نظام مستحقات الموارد البشرية وطلبات الصرف (Resource Reimbursements & Payment Requests)

## السيناريو المستهدف (واضح الآن)

> "المورد البشري **عمر** (موجود في `resources`) اشترى لابتوب للمشروع من حسابه الخاص بمبلغ 4,500 ريال — لا يوجد رصيد مخصص له في الموازنة. أريد:
> 1. تسجيل المصروف **باسمه كمستحقات على الشركة له**
> 2. يظهر في كشف مستحقاته
> 3. عند الدفع له، أعمل **مخالصة نهائية** ترتبط بالنظام
> 4. أتتبع **طلب الصرف**: متى تقدم؟ متى اعتُمد؟ متى دُفع؟"

---

## الفكرة الجوهرية

نضيف للمورد (Resource) الموجود مفهومين جديدين:
- **Resource Reimbursement** (سلفة شخصية يستردها المورد) — مصروف تكبّده من جيبه
- **Payment Request** (طلب صرف دفعة) — يغطي: استرداد، راتب، مكافأة، أو أي دفعة للمورد

ثم **Resource Settlement** = مخالصة نهائية تجمع كل المستحقات والمدفوعات وتقفلها.

هذا يكمل البنية الموجودة: `resources` (الموارد) + `custodies` (العهد) + `funds` (الصرفيات) + **`reimbursements` + `payment_requests` (الجديد)**.

---

## البنية المقترحة

### 1. جداول قاعدة البيانات الجديدة

**(أ) `resource_reimbursements` — مصاريف صرفها المورد من حسابه**
```
id, project_id, resource_id, category (ExpenseCategory),
description, amount, expense_date,
receipt_attachments (jsonb [{name, url}]),
budget_item_id (اختياري — للربط بالموازنة),
status: pending_review | approved | reimbursed | rejected,
notes, rejection_reason,
approved_by, approved_at,
payment_request_id (يُملأ عند ربطه بطلب صرف),
created_at, user_id
```
**ملاحظة**: يبقى منفصلاً عن `expenses` حتى يُدفع → عند الدفع يُنشأ تلقائياً `expense` معتمد لتدخل في حسابات الموازنة الفعلية.

**(ب) `payment_requests` — طلبات صرف الدفعات (دورة الحياة الكاملة)**
```
id, project_id, resource_id,
request_type: reimbursement | salary | bonus | advance | fund_top_up | other,
amount, currency, description, justification,
linked_reimbursement_ids (jsonb — مصاريف الاسترداد المرتبطة),
linked_fund_id (اختياري — إذا الطلب لتغذية عُهدة),
priority: normal | urgent | critical,
status: draft | submitted | under_review | approved
       | rejected | scheduled | paid | cancelled,
requested_by, requested_at,
reviewed_by, reviewed_at, review_notes,
approved_by, approved_at, approval_notes,
scheduled_date,
paid_date, payment_method (bank_transfer|cash|check|card),
payment_reference, payment_attachments (jsonb),
rejection_reason,
auto_created_expense_id (للتتبع),
created_at, updated_at, user_id
```

**(ج) `resource_settlements` — المخالصات النهائية**
```
id, resource_id, project_id (اختياري — قد تكون شاملة),
period_from, period_to,
total_owed (إجمالي المستحقات المعتمدة),
total_paid (إجمالي المدفوعات الفعلية),
balance (الفرق),
linked_reimbursement_ids (jsonb),
linked_payment_ids (jsonb),
settlement_text_ar (نص المخالصة بالعربي — قابل للتحرير من قالب),
status: draft | signed | disputed | cancelled,
signed_by_resource (boolean),
signature_attachment, signed_at,
notes, created_by, created_at, user_id
```

### 2. Triggers / Functions

- **`auto_create_expense_on_payment`** — عند `payment_request.status = 'paid'` ونوعه `reimbursement` → إنشاء `expense` معتمد تلقائياً (vendor=اسم المورد، resource_id موجود، fund_id=null)، وتحديث `resource_reimbursements.status='reimbursed'`
- **`recalc_resource_balance(resource_id)`** — دالة SECURITY DEFINER تحسب الرصيد المستحق
- **`protect_signed_settlement`** — منع تعديل/حذف المخالصات الموقّعة
- **system_audit triggers** — على الجداول الثلاثة الجديدة (تتبع كل تغيير)

### 3. RLS

- `resource_reimbursements`: عرض = `has_access(project)` ، إنشاء/تعديل = `can_edit(project)`، اعتماد = `has_role(admin)` فقط
- `payment_requests`: عرض = `has_access(project)`، إنشاء = `can_edit`، اعتماد/دفع = `admin` فقط
- `resource_settlements`: عرض = `has_access(project)`، إنشاء = `can_edit`، توقيع/إقفال = `admin` فقط

---

## الواجهات (UI)

### (أ) تبويب جديد داخل المشروع: **"مستحقات الموارد"**
- ضمن مجموعة Finance، بجانب "الصرفيات"
- أيقونة: `HandCoins` من lucide-react

### (ب) `ResourcePayablesSection.tsx` — اللوحة الرئيسية
- بطاقات إحصائية: إجمالي المستحقات | المعتمد | المدفوع | المتبقي
- جدول الموارد النشطة + رصيد كل واحد + زر "كشف حساب"
- 3 تبويبات داخلية:
  1. **الاستردادات** (Reimbursements) — قائمة المصاريف
  2. **طلبات الصرف** (Payment Requests) — مع Timeline
  3. **المخالصات** (Settlements) — السجل التاريخي

### (ج) `ReimbursementDialog.tsx` — تسجيل مصروف للمورد
- اختيار المورد من dropdown (resources الخاصة بالمشروع)
- البند، الفئة، المبلغ، التاريخ
- رفع إيصال (Storage bucket `resource-receipts`)
- ربط اختياري بـ budget_item
- إرسال للاعتماد

### (د) `PaymentRequestWizard.tsx` — معالج طلب الصرف
- خطوة 1: نوع الطلب + المورد
- خطوة 2: إذا "استرداد" → اختيار الاستردادات المعتمدة غير المدفوعة (المجموع يُحسب تلقائياً). إذا غير ذلك → إدخال المبلغ يدوياً
- خطوة 3: الأولوية، المبرر، مرفقات داعمة
- خطوة 4: مراجعة + إرسال

### (هـ) `PaymentRequestTimeline.tsx` — عرض دورة الحياة
شريط بصري للحالات مع التاريخ والمسؤول:
```
[منشأ] ─── [مرسل] ─── [قيد المراجعة] ─── [معتمد] ─── [مجدول] ─── [مدفوع]
2026/04/01  04/02      04/03            04/05       04/08      04/10
علي         علي        أحمد              أحمد        محمد       محمد
```
أزرار الإجراء حسب الصلاحية في كل مرحلة (إرسال، اعتماد، رفض، جدولة، تأكيد دفع).

### (و) `ResourceSettlementDialog.tsx` — المخالصة النهائية
- اختيار المورد + الفترة → يجلب تلقائياً كل الاستردادات والدفعات
- جدول مفصّل:
  - عمود يسار: المستحقات (الاستردادات المعتمدة)
  - عمود يمين: المدفوعات (طلبات الصرف المدفوعة)
  - أسفل: الفرق
- نص المخالصة بالعربي (قالب جاهز قابل للتعديل):
  > "أنا الموقّع أدناه/[الاسم] أُقرّ بأنني استلمت كامل مستحقاتي من شركة [الشركة] عن مشروع [المشروع] للفترة من [...] إلى [...] وقدرها [...] ريال، ولا يحق لي مطالبة الشركة بأي مبلغ آخر..."
- حقل التوقيع (رفع صورة)
- زر "توقيع المخالصة" → تجميد البنود

### (ز) `ResourceStatementDialog.tsx` — كشف حساب المورد
- جدول زمني لكل الحركات (استردادات + رواتب من العهد + مخالصات)
- إجمالي مستحق / مدفوع / رصيد
- تصدير Excel & PDF (بأرقام إنجليزية حسب الذاكرة)

---

## التكاملات مع النظام الحالي

| النظام | التكامل |
|---|---|
| **Resources** | استخدام نفس جدول الموارد، إضافة حقل محسوب `currentBalance` |
| **Expenses** | إنشاء expense تلقائياً عند دفع استرداد |
| **Funds** | طلب نوع `fund_top_up` يُنشئ `project_fund` تلقائياً عند الدفع |
| **Custodies** | طلب نوع `salary` يمكن خصمه من عُهدة المورد إن وُجدت |
| **Budget** | الاستردادات المعتمدة تظهر كـ "ملتزم به" قبل الدفع |
| **Smart Alerts** | تنبيه عند: رصيد مستحق > حد معين / طلب معلق > 7 أيام / تجاوز موازنة الفئة |
| **AI Insights** | قسم "الموارد الأكثر استحقاقاً" + "طلبات صرف معلقة طويلاً" |
| **Audit Log** | تسجيل كل تغيير حالة في system_audit_log (Owner only) |
| **Email** | إشعار Admin عند تقديم طلب جديد، إشعار المورد عند الاعتماد/الدفع |

---

## الصلاحيات (RBAC)

| الإجراء | Owner | Admin | Editor | Viewer |
|---|:---:|:---:|:---:|:---:|
| تسجيل استرداد | ✓ | ✓ | ✓ | — |
| اعتماد استرداد | ✓ | ✓ | — | — |
| إنشاء طلب صرف | ✓ | ✓ | ✓ | — |
| اعتماد طلب صرف | ✓ | ✓ | — | — |
| تأكيد الدفع | ✓ | ✓ | — | — |
| إنشاء مخالصة | ✓ | ✓ | ✓ | — |
| توقيع/إقفال مخالصة | ✓ | ✓ | — | — |
| المشاهدة | ✓ | ✓ | ✓ | ✓ |

---

## ملفات التنفيذ

**جديد:**
- `supabase/migrations/{ts}_resource_payables.sql` — الجداول + RLS + Triggers + Storage bucket
- `src/types/project.ts` (إضافات) — `ResourceReimbursement`, `PaymentRequest`, `ResourceSettlement` + enums + labels/colors
- `src/lib/resource-payables.ts` — حسابات الأرصدة، تجميع الحركات، إحصائيات
- `src/lib/__tests__/resource-payables.test.ts` — Vitest (إلزامي حسب الذاكرة)
- `src/store/slices/resourcePayableSlice.ts` — CRUD لكل الجداول الثلاثة
- `src/components/project/ResourcePayablesSection.tsx` — اللوحة الرئيسية + 3 تبويبات
- `src/components/project/ReimbursementDialog.tsx`
- `src/components/project/PaymentRequestWizard.tsx`
- `src/components/project/PaymentRequestTimeline.tsx`
- `src/components/project/ResourceSettlementDialog.tsx`
- `src/components/project/ResourceStatementDialog.tsx`

**تعديل:**
- `src/store/useStore.ts` — تسجيل resourcePayableSlice
- `src/store/slices/loadSlice.ts` — تحميل البيانات الجديدة
- `src/pages/ProjectDetail.tsx` — تبويب جديد في Finance group
- `src/components/project/ResourcesSection.tsx` — إضافة عمود "الرصيد المستحق" + زر "كشف الحساب"
- `src/components/project/ExpensesSection.tsx` — شارة "من استرداد" للمصاريف المنشأة تلقائياً
- `src/components/project/SmartBudgetAlerts.tsx` — تنبيهات الطلبات المعلقة
- `mem://index.md` + ملف ذاكرة جديد لقواعد الوحدة

---

## مراحل التنفيذ المقترحة

**المرحلة 1: الأساس (Reimbursements)**
- جدول `resource_reimbursements` + RLS + types + slice
- `ReimbursementDialog` + قائمة في `ResourcePayablesSection`
- إضافة عمود الرصيد في `ResourcesSection`
- اختبارات حسابات الأرصدة

**المرحلة 2: طلبات الصرف (Payment Requests + Timeline)**
- جدول `payment_requests` + trigger `auto_create_expense_on_payment`
- `PaymentRequestWizard` + `PaymentRequestTimeline`
- ربط الإشعارات (Admin عند طلب جديد)
- اختبار الدورة الكاملة

**المرحلة 3: المخالصات + كشوفات الحساب**
- جدول `resource_settlements` + قالب نص عربي
- `ResourceSettlementDialog` + `ResourceStatementDialog`
- تصدير PDF/Excel
- حماية من التعديل بعد التوقيع

---

## أسئلة قبل التنفيذ

1. **المرفقات**: هل أنشئ Storage bucket حقيقي للإيصالات (`resource-receipts`) أم نكتفي حالياً بحقول URL نصية؟
   - الموصى به: bucket حقيقي مع RLS مرتبط بالمشروع
2. **الإشعارات**: هل تريد إشعارات Email للأدمن عند طلب جديد، وللمورد عند الاعتماد/الدفع؟
3. **التنفيذ**: هل تريد المراحل الثلاث **دفعة واحدة** أم **مرحلة-مرحلة** بمراجعة بينها؟
4. **نطاق المخالصة**: هل المخالصة دائماً **لمشروع واحد** أم تريد دعم **مخالصة شاملة لعدة مشاريع** للمورد نفسه؟ (الأبسط: مشروع واحد ابتداءً)

---

## ملاحظات تقنية ملتزمة بالذاكرة

- أرقام إنجليزية + تقويم ميلادي (تطبيع قبل الحفظ)
- لا VAT في DB (سياسة الصافي)
- ON DELETE CASCADE من المشروع
- Soft delete للمخالصات (Archive فقط لو موقّعة)
- Triggers بـ `SET search_path = public`
- Validation Triggers (لا CHECK constraints مع `now()`)
- Vitest unit tests للحسابات
- AlertDialog للحذف
- Realtime subscription على الجداول الجديدة عبر `subscribeToProject`

