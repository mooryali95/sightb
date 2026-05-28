
## الجزء 1 — زر "تراجع" لإلغاء حدث تسوية

### الفكرة
كل حدث في `settlement_events` غير قابل للتعديل/الحذف. للتراجع نُدرج حدثاً جديداً `event_type = 'reverse'` يُشير إلى الحدث الأصلي عبر `reversed_event_id`. التريغر يعيد حساب حالة السلفة تلقائياً بعد استبعاد الأحداث الملغاة + الأحداث الـ reverse من المجموع.

### تغييرات قاعدة البيانات (migration واحدة)
1. **تحديث `recalc_payment_request_from_events()`**:
   - تجاهل أي حدث `event_type = 'reverse'`.
   - تجاهل أي حدث `id IN (SELECT reversed_event_id FROM settlement_events WHERE event_type='reverse' AND payment_request_id=_pr_id)` (أي تم إلغاؤه).
   - إعادة الحساب تُرجع `is_advance_outstanding = true` و`advance_settled_at = NULL` تلقائياً إن لم يعد المجموع يغطّي السلفة.
2. **توسيع التريغر** ليطلق على `INSERT OR DELETE` (للحماية فقط؛ DELETE ممنوع بـ RLS أصلاً).
3. **CHECK constraint**: عند `event_type='reverse'` يجب أن يكون `reversed_event_id NOT NULL`، وعند غيره يكون `NULL`.
4. **منع التراجع المزدوج**: unique partial index على `(reversed_event_id) WHERE event_type='reverse'`.
5. RLS: السماح بـ INSERT لـ `reverse` فقط لمن لديه `can_edit` على المشروع + كون الحدث الأصلي يخص نفس المشروع.

### تغييرات الكود

**`src/store/slices/resourcePayableSlice.ts`** — إضافة action:
```
reverseSettlementEvent(eventId): Promise<void>
```
الخطوات:
1. جلب الحدث الأصلي من `settlementEvents` المحلية.
2. التحقق:
   - الحدث ليس `reverse`.
   - لم يُلغَ سابقاً (لا يوجد حدث reverse يشير إليه).
3. إذا للحدث `expense_id`: نحذف المصروف المرتبط (DELETE FROM expenses WHERE id = …). RLS تسمح للمحرر. تحديث `expenses` محلياً.
4. إن كان حدث `cash_refund`: لا مصروف لحذفه — التريغر وحده يعيد فتح السلفة.
5. INSERT حدث reverse:
   ```
   { payment_request_id, project_id, event_type:'reverse',
     amount: original.amount, reversed_event_id: original.id,
     notes: input.reason, created_by: userId }
   ```
6. إعادة جلب `payment_requests` + `loadSettlementEventsForRequest`.

**`src/components/project/ResourcePayablesSection.tsx`** — في `settlementHistory` panel داخل نافذة التسوية:
- لكل حدث (ما عدا `reverse` وما عدا الأحداث التي لها reverse مرتبط): زر `RotateCcw` صغير "تراجع".
- النقر يفتح `AlertDialog` تأكيدي + textarea للسبب (مطلوب)، ثم يستدعي `reverseSettlementEvent`.
- الأحداث الملغاة تظهر بخط مشطوب + شارة "ملغى" + رابط لحدث الـ reverse.
- أحداث `reverse` تظهر بأيقونة مميزة وتشير إلى الحدث الذي ألغته.
- الزر مخفي للـ Viewer (readOnly).
- إن نقص الرصيد بعد إعادة فتح السلفة (مثلاً تم استخدام الفائض)، نسمح بالتراجع لكن نُظهر toast تحذيري.

### الاختبارات
- `src/lib/__tests__/advance-settlement.test.ts`: 3 سيناريوهات جديدة:
  1. تراجع عن `cash_refund` يعيد `refunded_amount` ويُعيد فتح السلفة.
  2. تراجع عن `documented` يحذف المصروف ويُعيد فتح السلفة.
  3. منع التراجع عن حدث ملغى مسبقاً.

---

## الجزء 2 — تحليل التعديلات السابقة والتحسينات المتبقية

### ما تمّ إنجازه (مختصر)
| المحور | الحالة |
|---|---|
| Net Storage + VAT ديناميكي | ✅ |
| Budget Lock + Change Orders | ✅ |
| EVM (CPI/SPI) واختباراته | ✅ |
| سلف: refunded/settled/partial + شريط تقدم | ✅ |
| `settlement_events` كمصدر حقيقة + backfill | ✅ |
| Split Expense للفاتورة > السلفة | ✅ |
| RBAC + 2FA + Session timeout | ✅ |
| Audit log خادمي + Admin only | ✅ |
| Localization صارمة (English digits, RTL) | ✅ |
| تكامل البريد + قوالب | ✅ |

### تحسينات تحتاج ضبط — مقسّمة ومرتّبة

#### الأولوية A — حرجة (دقّة محاسبية / أمان)
1. **توحيد سلوك Reverse مع التريغر** *(هذا الـ loop)* — كما هو موصوف أعلاه.
2. **معاملة ذرّية لـ `settleAdvanceWithSplit`**: حالياً الخطوة 1 (settle) والخطوة 2 (overflow expense) منفصلتان — لو فشلت الثانية بقيت السلفة مغلقة بلا مصروف للفائض. الحل: تحويلهما إلى RPC واحدة (`split_settle_advance`) داخل transaction.
3. **تحقّق رصيد المصدر للفائض على الخادم**: حالياً `check_fund_balance` موجود كـ trigger؛ نتأكد أنه يغطي حالة overflow expense + custody أيضاً ويرفض قبل إنشاء يتيم.
4. **حذف العمود المهجور `expenses.is_outstanding_advance`**: تمّ تعطيله؛ بقي حذفه فعلياً وإزالة كل مرجع بالكود لتجنّب الالتباس.

#### الأولوية B — مهمّة (UX/سلامة بيانات)
5. **عرض الفائض في شريط التقدم**: شريط التسوية لا يُظهر حالياً جزء الـ overflow؛ نضيف شريحة منفصلة بلون مختلف.
6. **History panel يشمل الأحداث المرتبطة بـ split**: إظهار "مصروف فائض 4,000 على الدفعة #X" داخل التايم لاين.
7. **منع حذف payment_request له settlement_events**: إضافة policy/trigger يرفض الحذف لو وُجدت أحداث، حتى للـ Admin إلا بـ override.
8. **`expense_id` على الحدث = ON DELETE SET NULL**: لو حُذف المصروف يدوياً يبقى الحدث متّسقاً.
9. **اختبار end-to-end لسيناريو split + reverse** على بيانات حقيقية.

#### الأولوية C — تحسينات (تجربة وتقارير)
10. **تقرير "حركة السلف" في PDF/Excel**: قائمة كرونولوجية لكل حدث (نوع/مبلغ/مستخدم/مرجع مصروف) بأرقام إنجليزية.
11. **Badge في قائمة طلبات الصرف**: يُظهر "سلفة مفتوحة منذ X يوماً" بناءً على `requested_at` (aging موجود لكن غير بارز).
12. **إشعار ذكي**: تنبيه عند سلفة > 30 يوم بلا تسوية.
13. **سجل reverse في AuditLog UI**: تصفية مخصّصة لأحداث `settlement_event_reverse`.

#### الأولوية D — تنظيف تقني
14. **إزالة `(supabase as any)` المتبقية** في `resourcePayableSlice.ts` بعد تحديث types.
15. **توحيد `mapReq` / `mapExpense`** في ملف helpers واحد (مكرّر حالياً).
16. **اختبارات إضافية للـ recalc trigger** عبر pgTAP أو سكربت Node بعد كل migration.

### مصفوفة الأولوية
```
Priority │ Items │ Effort │ Impact
─────────┼───────┼────────┼────────
   A     │ 1-4   │ متوسط  │ عالي جداً
   B     │ 5-9   │ متوسط  │ عالي
   C     │ 10-13 │ منخفض  │ متوسط
   D     │ 14-16 │ منخفض  │ صيانة
```

### الترتيب المقترح للتنفيذ
1. هذا الـ loop: **A1 (Reverse)**.
2. الـ loop التالي: **A2 + A3 + A4** (سلامة Split + تنظيف العمود المهجور).
3. ثم: **B5-B9** كحزمة واحدة (تحسينات Split UX).
4. ثم: **C10-C13** (تقارير وإشعارات).
5. أخيراً: **D14-D16** (تنظيف).

---

## الملفات المتأثرة لهذا الـ loop
- `supabase/migrations/<ts>_reverse_settlement_events.sql`
- `src/store/slices/resourcePayableSlice.ts` (+`reverseSettlementEvent`)
- `src/components/project/ResourcePayablesSection.tsx` (UI زر التراجع + الحالات)
- `src/lib/__tests__/advance-settlement.test.ts` (+3 سيناريوهات)

## القبول
- زر "تراجع" يظهر بجانب كل حدث قابل للتراجع.
- النقر يُدرج حدث `reverse`، يحذف المصروف المرتبط إن وُجد، ويُعيد فتح السلفة فوراً.
- التريغر يستثني الأحداث الملغاة والـ reverse من الحساب.
- لا يمكن التراجع عن حدث ملغى مسبقاً.
- Viewer لا يرى الزر.
- الاختبارات تمر.
