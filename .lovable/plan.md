## الهدف

1. إنشاء جدول `settlement_events` مستقل لتسجيل كل حدث تسوية (رد/توثيق/خصم/شطب) بدقة وقابلية تدقيق.
2. اعتماد سيناريو واضح للتعامل مع مصروف قيمته أكبر من قيمة السلفة وحدها أو من رصيد الدفعة وحده.

---

## 1) جدول `settlement_events`

### الهيكل

```
settlement_events
├─ id uuid PK
├─ payment_request_id uuid NOT NULL  → السلفة المرتبطة
├─ project_id uuid NOT NULL
├─ event_type enum: cash_refund | documented | payroll_deduction | written_off | reopen
├─ amount numeric NOT NULL CHECK > 0
├─ refund_to_fund_id uuid NULL
├─ refund_to_custody_id uuid NULL
├─ expense_id uuid NULL          → المصروف الناتج (إن وُجد)
├─ expense_category text NULL
├─ budget_item_id uuid NULL
├─ notes text NULL
├─ created_by uuid NOT NULL
├─ created_at timestamptz default now()
└─ reversed_event_id uuid NULL   → لدعم إلغاء حدث سابق
```

- INDEX على `payment_request_id` و `project_id`.
- GRANT للـ `authenticated` + `service_role`.
- RLS: قراءة بـ `has_access(project)`، إدراج بـ `can_edit(project)`، تحديث/حذف مغلق (events غير قابلة للتعديل — للتراجع نُدرج حدث `reverse` جديد).
- Trigger يكتب في `system_audit_log`.
- Trigger يعيد حساب `payment_requests.refunded_amount` و `is_advance_outstanding` من مجموع الأحداث (مصدر الحقيقة الجديد).

### التكامل مع `settleAdvance`

- يصبح `settleAdvance` يُدرج صفّاً في `settlement_events` (بدلاً من تحديث `refunded_amount` مباشرة)، والتريغر يتكفّل بمزامنة `payment_requests`.
- التسوية المركّبة تصبح صفّين في نفس المعاملة.
- نُبقي الأعمدة القديمة على `payment_requests` (`settlement_type`, `refunded_amount`, …) كـ summary مشتقّة — لا نكسر التقارير الحالية.

### Migration (تعبئة الماضي)

- Backfill حدث واحد لكل سلفة مُسوّاة سابقاً (cash_refund أو documented) بقيمة `refunded_amount`/`settled_amount` الحالية.

---

## 2) سيناريو: مصروف > قيمة السلفة المفردة / رصيد الدفعة المفرد

### المبدأ
لا يوجد "مصدر واحد" يُجبر على تحمّل المصروف كاملاً. المصروف الفعلي يُسجَّل بقيمته الحقيقية، ويُقسَّم على مصدرَين/أكثر بطريقة شفّافة.

### السيناريو المعتمد: **Split Expense (مصروف موزَّع)**

مثال: سلفة قائمة = 3,000 — رصيد دفعة متاح = 5,000 — فاتورة فعلية = 7,000.

التدفّق داخل نافذة تسوية السلفة:

1. يختار المستخدم "تسوية بمستندات" ويُدخل قيمة الفاتورة الكاملة (7,000).
2. النظام يكتشف أن `docAmount (7,000) > remainingOutstanding (3,000)` ويعرض تلقائياً قسمَين:
   - **جزء يُغلق السلفة:** 3,000 → يُدرج `settlement_event(documented, 3000)` + مصروف مرتبط بـ `source_payment_request_id` و بنفس مصدر السلفة الأصلي (custody/fund).
   - **جزء فائض من الفاتورة:** 4,000 → يُدرج كمصروف مستقل عادي خصماً من الدفعة/العهدة النشطة (يختارها المستخدم من قائمة، بشرط `available ≥ 4,000`).
3. الفاتورة (المرفق) تُربط بكلا المصروفَين بنفس `invoice_ref` للتتبّع.

نتيجة:
- السلفة تُغلق بالكامل.
- المصروف الفعلي مسجَّل بقيمته الكاملة 7,000.
- لا يُكسر `check_fund_balance` لأن كل جزء يُحجز على المصدر القادر على تحمّله.

### حالات حافّة

| الحالة | المعالجة |
|---|---|
| لا توجد دفعة كافية للفائض | تحذير يمنع التنفيذ ويقترح: (أ) إنشاء دفعة جديدة، (ب) تقسيم على دفعتَين، (ج) خفض المبلغ الموثَّق. |
| الفائض يُغطّى من عهدة | نفس التدفّق مع اختيار `custody_id`. |
| المصروف < السلفة | لا تقسيم — تسوية جزئية عادية (موجودة فعلاً). |
| مصروف من عهدة منشأها نفس الدفعة | يُسمح بالخصم من الدفعة مباشرة بدون double-count (المنطق موجود في `check_fund_balance`). |

### بدائل مرفوضة

- ❌ تسجيل مصروف 7,000 على السلفة فقط: يكسر معادلة `refunded_amount ≤ amount` ويُضخّم AC.
- ❌ تسجيل مصروف 7,000 على الدفعة فقط مع تجاهل السلفة: يترك السلفة قائمة بلا مبرر.
- ❌ زيادة قيمة السلفة لتغطية الفاتورة: يُحرّف سجل السلف الأصلي.

---

## الملفات المتأثرة

- `supabase/migrations/<ts>_settlement_events.sql` — الجدول + RLS + GRANT + triggers + backfill.
- `src/types/project.ts` — نوع `SettlementEvent`.
- `src/store/slices/resourcePayableSlice.ts` — `settleAdvance` يكتب في `settlement_events`، +action جديد `settleAdvanceWithSplit({ docAmount, overflowSource })`.
- `src/components/project/ResourcePayablesSection.tsx`:
  - شريط التقدم يقرأ من `settlement_events` بدل العمود المُجمَّع.
  - عند إدخال `docAmount > remainingOutstanding`: إظهار قسم "الفائض" مع Select للدفعة/العهدة والتحقق من الرصيد المتاح.
  - عرض history من `settlement_events` بدل reconstruction من المصاريف.
- `src/lib/__tests__/advance-settlement.test.ts` — اختبارات جديدة لسيناريو split.

---

## القبول

- كل تسوية تُولّد صفّاً في `settlement_events` (موجودة قبلياً عبر backfill).
- شريط التقدم وتاريخ الأحداث يقرآن من المصدر الجديد.
- تسوية سلفة 3,000 بفاتورة 7,000 تُنشئ: حدثاً واحداً (documented, 3000) + مصروفَين (3000 على السلفة + 4000 على الدفعة)، وتُغلق السلفة.
- محاولة split بدون رصيد كافٍ للفائض → خطأ واضح يمنع الحفظ.
- الاختبارات تمر.
