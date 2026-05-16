
# تدقيق مالي شامل — موجة 4هـ

هدف هذه الموجة: ضمان أن (1) كل بند مالي قابل للتعديل والحذف بضوابط واضحة، (2) كل البنود مترابطة فعلياً وليس بصرياً فقط، (3) لا يوجد سوى **مصدر بيانات واحد** للنقد في المشروع.

---

## أ. المشاكل المؤكدة من فحص الكود

1. **العهدة لا تُربط بمصروف قائم بعد إنشائه** — في `ExpensesSection.tsx` نسخة *تعديل* المصروف لا تمرّر `custodyId` ولا `resourceId` ولا `budgetItemId` إلى `updateExpense` (السطر 174). أي بعد حفظ المصروف لا تستطيع نقله إلى عهدة أو فك ارتباطه.
2. **العهدة لا تُربط بدفعة بعد إنشائها** — `CustodySection.tsx` لا يحوي زر تعديل أصلاً، فقط حذف. لا يمكن تصحيح عهدة قديمة `source_fund_id = NULL`.
3. **مستحقات الموارد جزيرة منفصلة** — `resource_reimbursements` و`payment_requests` لا تظهر في `CashLedgerSection` ولا تُحسب ضمن "بيد المدير"، رغم أنها تستنزف نفس النقد. التابات الأربعة (Funds / Custody / Expenses / ResourcePayables) لكلٍ منها داشبورد مستقل ⇒ المستخدم لا يرى صورة موحّدة.
4. **لا يوجد جسر بين السلفة والمصروف** — السلفة (`reimbursement`) عند اعتمادها وصرفها تُولّد expense تلقائياً، لكن لا يمكن:
   - ربط السلفة بعهدة موجودة (بحيث تُخصم من رصيد العهدة بدل النقد)
   - ربط السلفة بدفعة محددة (تُحسب الآن خارج نظام الدفعات)
5. **حذف الدفعة الخاطئة محظور فعلياً** — `deleteFund` موجود ويتطلب admin، لكن لا يوجد زر واضح في الواجهة لحذف دفعة بعد ربط أي عهدة/مصروف بها، ولا رسالة توضح السبب.
6. **مصدر معلومة المورد متعدد** — الراتب الشهري في `resources.monthly_cost` لا ينعكس تلقائياً في:
   - بنود الموازنة (`budget_items`)
   - طلبات الصرف الشهرية (`payment_requests`)
   - مستحقات المورد المتراكمة

---

## ب. مصفوفة الحذف/التعديل لكل كيان مالي

| الكيان | تعديل | حذف | الفجوة |
|---|---|---|---|
| `project_funds` | جزئي | admin فقط | لا زر "تصحيح مبلغ" بعد ربط، لا تحذير إذا كانت مرتبطة بعهدة/مصروف |
| `custodies` | **مفقود** | موجود | لا يمكن تغيير source_fund_id أو الملاحظات أو المبلغ |
| `expenses` | جزئي | موجود | لا يحدّث custodyId/resourceId/budgetItemId |
| `fund_settlements` | draft فقط | admin/draft فقط | OK |
| `resource_reimbursements` | لا (status فقط) | pending_review فقط | لا تعديل وصف/مبلغ بعد الإنشاء |
| `payment_requests` | حسب status | admin + draft/cancelled/rejected | لا زر حذف في الواجهة |
| `resource_settlements` | draft فقط | unsigned فقط | OK |

---

## ج. خطة التنفيذ (3 خطوات)

### 1) سدّ ثغرات التعديل/الحذف
- **`ExpensesSection`** — تمرير `custodyId / resourceId / budgetItemId / custodyId=undefined لفك الربط` في `updateExpense` (السطر 174). إضافة زر "ربط بعهدة" سريع للمصروفات الموجودة.
- **`CustodySection`** — إضافة زر "تعديل" (ResponsiveFormDialog) يسمح بتغيير: الملاحظات، تاريخ الاستلام، وspecial admin-only: `source_fund_id`. تغيير المبلغ مرفوض إذا كان هناك صرف عليها.
- **`FundsSection`** — توضيح زر الحذف برسالة: "لا يمكن الحذف لوجود N عهدة و M مصروف مرتبطين. افصلهم أولاً" بدل خطأ DB غامض.
- **`ResourcePayablesSection`** — إضافة زر حذف للـ `payment_request` (admin، حالات draft/cancelled/rejected فقط) وزر تعديل لـ `reimbursement` (وصف/مبلغ/تاريخ) في حالة pending_review.

### 2) جسر مستحقات الموارد ↔ النقد
- إضافة حقلين اختياريين في `payment_requests`:
  - `paid_from_custody_id` — إذا صُرفت السلفة من عهدة قائمة (تُخصم منها)
  - `paid_from_fund_id` — إذا صُرفت من دفعة محددة
- تحديث `auto_create_expense_on_payment` ليمرّر هذين الحقلين إلى المصروف المُولَّد ⇒ المصروف يدخل تلقائياً في حسابات الدفعة/العهدة.
- في حوار "صرف الدفعة" (`payPaymentRequest`)، اختيار العهدة/الدفعة المصدر (مع فحص الرصيد).

### 3) واجهة نقد موحّدة (Single Source of Truth)
- توسيع `CashLedgerSection` ليكون **المرجع الوحيد** للحالة المالية للمشروع، يعرض:
  ```text
  استُلم من الإدارة (دفعات)        : X
  ─ صُرف مباشرة                   : A
  ─ سُلّم كعهدة                   : B
  ─ صُرف من العهد (تفصيل)         : C
  ─ صُرف لمستحقات موارد          : D   ← جديد
  ═══════════════════════════════
  بيد المدير                       : X − A − B − D
  مستحقات معلّقة (لم تُصرف)        : E   ← informational
  ```
- إضافة تبويب "العمليات" يدمج بترتيب زمني واحد: funds, custodies, expenses, reimbursements, payment_requests، مع badge مصدر وإمكانية الانتقال السريع.
- تحديث `getProjectFundsSummary` ليأخذ `paymentRequests` في الحسبان (طرح المدفوع منها من النقد).

---

## د. تفاصيل تقنية

- **Migration** مطلوب لإضافة:
  ```sql
  ALTER TABLE payment_requests
    ADD COLUMN paid_from_custody_id uuid REFERENCES custodies(id) ON DELETE SET NULL,
    ADD COLUMN paid_from_fund_id   uuid REFERENCES project_funds(id) ON DELETE SET NULL;
  ```
  + تحديث trigger `auto_create_expense_on_payment` لتمرير `fund_id` و`custody_id`.

- **بدون كسر البيانات الحالية**: الحقول الجديدة nullable، والحساب الجديد لـ `remainingInManagerHand` يتعامل مع غياب القيم بنفس السلوك الحالي.

- **اختبارات vitest** جديدة لـ `funds.test.ts` لتغطية: paymentRequests داخلة في الحساب، السلفة المربوطة بعهدة لا تُحسب مرتين.

- لا تغيير على RLS؛ السياسات الحالية لـ `payment_requests` و`custodies` تكفي للحقول الجديدة.

---

## هـ. التسليم
سأنفّذها على ثلاث دفعات (1 ثم 2 ثم 3) لتتمكن من التحقق بعد كل واحدة. هل أبدأ بالأولى (سدّ ثغرات الحذف/التعديل) فوراً عند الموافقة؟
