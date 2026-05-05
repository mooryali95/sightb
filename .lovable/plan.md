
# تحليل المشاكل والحل المقترح

## 1) المشكلة الجذرية: لماذا لا تُحفظ المصروفات؟

في `ExpensesSection.tsx` (سطر 48 و126):
- حقل `fundId` في النموذج يبدأ فارغاً `''`.
- الـ Select يعرض القيمة الافتراضية بصرياً: `value={fundId || activeFund.id}` — لكنّه **لا يُحدِّث الـ state** ما لم يضغط المستخدم يدوياً.
- عند الإرسال: `effectiveFundId = fundId && fundId !== 'none' ? fundId : undefined` → يُرسَل `undefined`.
- في DB: trigger `enforce_expense_fund_link` يرفض أي مصروف بدون `fund_id` عند وجود دفعة نشطة → **الإدخال يفشل بصمت** (toast نجاح يظهر قبل الفشل في بعض المسارات، أو خطأ غير مفهوم).

**نفس السبب يمنع تعديل/ربط المصروفات السابقة بالدفعة**: لا يوجد مسار UI لربط مصروف legacy غير مربوط — حقل ربط الدفعة في وضع التعديل مقفول لغير الأدمن، وحتى للأدمن لا يظهر إلا إذا `fundIsRequired`.

## 2) صلاحيات حذف الدفعة

الحالي (`FundsSection.tsx` سطر 442):
```
isAdmin && f.status === 'transferred'
```
- يمنع الحذف بعد الإقرار/التسوية حتى لو طلبه المالك.
- `isAdmin` يشمل أي admin على مستوى النظام — المطلوب: **Owner + Admin فقط**، ومنع باقي المسؤولين.

## 3) انعكاس المصروف على الدفعة والعهدة

- DB trigger `recalc_fund_settlement_spent` موجود ويعمل ✅.
- لكن الـ store الأمامي لا يعيد تحميل `fund_settlements` بعد إضافة/تعديل/حذف مصروف → الواجهة تعرض رصيداً قديماً حتى refresh.

## 4) وضوح العلاقة بين الدفعات والعهد

لا يوجد عرض موحّد يُظهر: "ما هو وضعي النقدي الكامل لهذا المشروع؟ كم دفعة + كم عهدة + ماذا صُرف من كل منها وعلى أي بنود؟"

---

# الحل المقترح

## A. إصلاح حفظ المصروفات وربطها بالدفعة

**`src/components/project/ExpensesSection.tsx`**
1. عند فتح النموذج (إضافة جديدة)، إذا وُجدت دفعة نشطة: `setFundId(activeFund.id)` تلقائياً.
2. في وضع التعديل، إذا كان المصروف غير مربوط بدفعة (`legacy_pre_fund` أو `fundId` فارغ) ووُجدت دفعة نشطة: **اسمح للمحرّر (وليس فقط الأدمن) بربطه بالدفعة الحالية** (هذه إضافة، ليس تغيير ربط موجود — لا يخرق `protect_expense_fund_link`).
3. اعرض زر سريع "🔗 ربط بالدفعة النشطة" في صف كل مصروف لا يحوي `fundId` في الجدول — يستدعي `updateExpense(id, { fundId: activeFund.id })` بنقرة واحدة.
4. أظهر toast واضح للخطأ القادم من DB trigger (رصيد، fund_id، إلخ) بدل رسالة نجاح خاطئة.

## B. صلاحية حذف الدفعة (Owner + Admin فقط، في أي حالة)

**`src/hooks/useRole.tsx`**: نستخدم `isOwner` + `isAdmin` الموجودَين (system-level فقط).

**`src/components/project/FundsSection.tsx`** (سطر 442):
- استبدل الشرط بـ: `(isOwner || isAdmin) && f.status !== 'settled'` (السماح بالحذف حتى بعد الإقرار، لكن منع المسوّاة لحماية السجل المحاسبي).
- في `ConfirmDeleteDialog`: إذا كان للدفعة مصروفات مرتبطة، اعرض تحذيراً صريحاً بعدد المصروفات والمبلغ وأن `fund_id` فيها سيصبح `null` (السلوك الحالي لـ ON DELETE في `expenses.fund_id`).

**migration** (للتأكد):
- سياسة DELETE على `project_funds` حالياً: `has_role(auth.uid(), 'admin'::app_role)` — صحيحة (owner مشمول داخل `has_role`). لا حاجة لتغيير.
- إضافة سياسة صريحة: لا تسمح بحذف دفعة `status='settled'` إلا للـ owner (اختياري — حماية إضافية).

## C. الانعكاس التلقائي بعد كل عملية مصروف

**`src/store/slices/`** (في addExpense / updateExpense / deleteExpense):
- بعد نجاح العملية، إن كان للمصروف `fundId`، استدعِ `loadFundsForProject(projectId)` لإعادة جلب التسويات المُحدَّثة من DB (الـ trigger حدّثها بالفعل).
- نفس الشيء للعهدة: استدعاء `loadProjectData` المختصر لإعادة `custodies` (لجلب status المُحدَّث من trigger `auto_close_custody_on_exhaustion`).

## D. سجل النقد الموحّد (Cash Ledger)

مكوّن جديد `src/components/project/CashLedgerSection.tsx` يُعرض داخل تبويب "المالية" بالمشروع:

```text
┌─────────────────────────────────────────────────────────┐
│  وضع المشروع النقدي                                      │
│  المحوّل: 100,000  |  المصروف: 65,000  |  المتبقي: 35,000│
└─────────────────────────────────────────────────────────┘

  الدفعات (Funds)              │  العهد (Custodies)
  ──────────────                │  ──────────────────
  ▸ #1  50,000  مسوّاة ✓        │  ▸ أحمد   10,000  نشطة
      └─ 12 مصروف · 50,000      │      └─ 4 مصروفات · 7,500
  ▸ #2  50,000  نشطة            │  ▸ سعيد    5,000  مغلقة
      └─ 8 مصروفات · 15,000     │      └─ 3 مصروفات · 5,000
      └─ متبقي: 35,000          │
```

- توسيع كل بند يُظهر جدول المصروفات المرتبطة (وصف + مبلغ + تاريخ + بند الموازنة).
- يستخدم نفس البيانات الموجودة في الـ store (لا حاجة لاستعلام جديد).
- خط زمني بسيط أعلى السجل: تحويل دفعة #1 → إقرار → مصروفات → تسوية → تحويل دفعة #2 …

## E. ملاحظات تقنية

- لا تغييرات في schema الـ DB (الأعمدة والتريغرات الحالية كافية).
- migration واحد اختياري: تحديد سياسة DELETE الأكثر صرامة على `project_funds.settled` (يمكن تأجيله).
- اختبارات: تحديث `src/lib/__tests__/funds.test.ts` لتغطية حالة "ربط مصروف legacy".

# الملفات التي ستُعدَّل

- `src/components/project/ExpensesSection.tsx` — auto-fill fundId, زر ربط سريع، توضيح أخطاء
- `src/components/project/FundsSection.tsx` — توسيع شرط الحذف للمالك/الأدمن في كل الحالات غير settled
- `src/store/slices/projectSlice.ts` (أو مكان addExpense/updateExpense) — إعادة تحميل funds/custodies بعد العمليات
- **جديد**: `src/components/project/CashLedgerSection.tsx`
- `src/pages/ProjectDetail.tsx` — تضمين CashLedger في تبويب المالية
- `src/lib/__tests__/funds.test.ts` — اختبار الربط المتأخر

هل أبدأ التنفيذ؟
