
## الهدف
استكمال الأولوية A من خطة التحسينات: ضمان ذرّية تسوية السلفة مع فائض (Split)، فحص رصيد المصدر للفائض على الخادم، وحذف العمود المهجور `expenses.is_outstanding_advance` نهائياً.

---

## 1) ذرّية `settleAdvanceWithSplit` عبر RPC واحدة

**المشكلة:** حالياً في `resourcePayableSlice.ts` يتم تنفيذ خطوتين منفصلتين من العميل:
1. INSERT حدث `documented` في `settlement_events` (يُغلق السلفة).
2. INSERT مصروف overflow في `expenses`.

لو فشلت الخطوة 2 (انقطاع شبكة/RLS/رصيد ناقص) تبقى السلفة مغلقة بلا مصروف للفائض → بيانات يتيمة.

**الحل:** إنشاء دالة Postgres `split_settle_advance(...)` `SECURITY DEFINER` تنفّذ كل شيء في transaction واحدة. أي فشل يعيد كل شيء.

### Migration
```sql
CREATE OR REPLACE FUNCTION public.split_settle_advance(
  _payment_request_id uuid,
  _settle_amount      numeric,   -- يغطي ما تبقى من السلفة (documented)
  _overflow_amount    numeric,   -- المبلغ الفائض (يُسجَّل كمصروف)
  _overflow_source    text,      -- 'fund' | 'custody'
  _overflow_fund_id   uuid,
  _overflow_custody_id uuid,
  _category           text,
  _description        text,
  _date               text,
  _month              int,
  _budget_item_id     uuid,
  _notes              text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _pr            public.payment_requests%ROWTYPE;
  _uid           uuid := auth.uid();
  _event_id      uuid;
  _expense_id    uuid;
BEGIN
  -- 1. تحقّق صلاحية + جلب الطلب
  SELECT * INTO _pr FROM public.payment_requests WHERE id = _payment_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment_request_not_found'; END IF;
  IF NOT public.can_edit(_uid, 'project'::scope_type, _pr.project_id) THEN
    RAISE EXCEPTION 'insufficient_permission';
  END IF;
  IF _pr.request_type <> 'advance' OR NOT _pr.is_advance_outstanding THEN
    RAISE EXCEPTION 'advance_not_outstanding';
  END IF;

  -- 2. تحقّق المبالغ
  IF _settle_amount <= 0 OR _overflow_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amounts';
  END IF;

  -- 3. تحقّق مصدر الفائض ورصيده
  IF _overflow_source = 'fund' THEN
    IF _overflow_fund_id IS NULL THEN RAISE EXCEPTION 'fund_required'; END IF;
    IF public.fund_available_balance(_overflow_fund_id) < _overflow_amount THEN
      RAISE EXCEPTION 'insufficient_fund_balance';
    END IF;
  ELSIF _overflow_source = 'custody' THEN
    IF _overflow_custody_id IS NULL THEN RAISE EXCEPTION 'custody_required'; END IF;
    IF public.custody_available_balance(_overflow_custody_id) < _overflow_amount THEN
      RAISE EXCEPTION 'insufficient_custody_balance';
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid_overflow_source';
  END IF;

  -- 4. مصروف الفائض
  INSERT INTO public.expenses(
    user_id, project_id, budget_item_id, category, description, amount,
    date, month, resource_id, notes, fund_id, custody_id, source_payment_request_id,
    approval_status
  ) VALUES (
    _uid, _pr.project_id, _budget_item_id, _category, _description, _overflow_amount,
    _date, _month, _pr.resource_id,
    COALESCE(_notes,'') || ' (فائض تسوية سلفة)',
    CASE WHEN _overflow_source='fund' THEN _overflow_fund_id END,
    CASE WHEN _overflow_source='custody' THEN _overflow_custody_id END,
    _payment_request_id, 'approved'
  ) RETURNING id INTO _expense_id;

  -- 5. حدث التسوية (documented) — التريغر يُحدّث summary للـ PR
  INSERT INTO public.settlement_events(
    payment_request_id, project_id, event_type, amount,
    expense_id, notes, created_by
  ) VALUES (
    _payment_request_id, _pr.project_id, 'documented', _settle_amount,
    NULL,  -- مصروف الفائض ليس "مصروف السلفة"؛ نتركه NULL لتجنّب الالتباس
    _notes, _uid
  ) RETURNING id INTO _event_id;

  RETURN jsonb_build_object('event_id', _event_id, 'expense_id', _expense_id);
END $$;

REVOKE ALL ON FUNCTION public.split_settle_advance(uuid,numeric,numeric,text,uuid,uuid,text,text,text,int,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.split_settle_advance(uuid,numeric,numeric,text,uuid,uuid,text,text,text,int,uuid,text) TO authenticated;
```

ملاحظة: نحتاج التأكّد من وجود `fund_available_balance(uuid)` و`custody_available_balance(uuid)` (موجودتان في trigger `check_fund_balance`). إن لم تكونا دالتين مستقلتين سنستخرجهما في نفس الـ migration.

### تعديل العميل
في `src/store/slices/resourcePayableSlice.ts`:
- استبدال جسم `settleAdvanceWithSplit` بنداء واحد:
  ```ts
  const { data, error } = await supabase.rpc('split_settle_advance', { ... });
  ```
- معالجة الأخطاء بأسماء واضحة (`insufficient_fund_balance` → toast "الرصيد غير كافٍ").
- بعد النجاح: إعادة جلب `payment_requests` و`expenses` و`settlementEvents`.

---

## 2) فحص رصيد المصدر للفائض (A3)

التريغر `check_fund_balance` الحالي يعمل عند INSERT/UPDATE على `expenses` لكنه قد لا يغطي رصيد الـ Custody بنفس الدقة. نضمن:
- وجود `fund_available_balance(uuid)` و`custody_available_balance(uuid)` كـ STABLE functions تُحسب: `SUM(received) − SUM(spent) − SUM(committed_outstanding)`.
- التريغر `expenses_balance_check_trg` يستدعي الدالتين بحسب `fund_id` / `custody_id`.
- استدعاؤهما داخل `split_settle_advance` قبل أي INSERT (Defense in depth).

لا حاجة لتغيير في الواجهة إن كانت الدوال موجودة؛ سأتحقق أثناء التنفيذ وأضيف ما ينقص.

---

## 3) حذف العمود المهجور `expenses.is_outstanding_advance` (A4)

تمّ تعطيله سابقاً (default false، لا يُستخدم في الحسابات).

### Migration
```sql
-- 1. التأكّد من عدم وجود مراجع باقية
-- 2. حذف العمود
ALTER TABLE public.expenses DROP COLUMN IF EXISTS is_outstanding_advance;
```

### تنظيف الكود
بحث/إزالة كل ذكر لـ `is_outstanding_advance` في:
- `src/store/slices/resourcePayableSlice.ts`
- `src/types/project.ts`
- أي مكوّن يقرأها (مثلاً `ExpensesSection.tsx`).
- اختبارات `advance-settlement.test.ts` / `resource-payables.test.ts`.

الاستبدال: الاعتماد كلياً على `payment_requests.is_advance_outstanding` كمصدر الحقيقة.

---

## 4) الاختبارات

إضافة في `src/lib/__tests__/advance-settlement.test.ts`:
1. **Atomic split success**: استدعاء RPC ينجح ويُنشئ مصروف فائض + حدث documented + يُغلق السلفة.
2. **Atomic split rollback on insufficient balance**: تمرير `_overflow_amount` > رصيد الصندوق ⇒ exception، لا يُنشأ مصروف، السلفة تبقى مفتوحة.
3. **Atomic split rollback on permission denied**: مستخدم Viewer ⇒ exception.
4. **Legacy column removed**: تشغيل query وهمي يتأكّد أن العمود غير موجود (assert على types).

---

## الملفات المتأثرة
- `supabase/migrations/<ts>_atomic_split_and_drop_legacy.sql` (جديد)
- `src/store/slices/resourcePayableSlice.ts` (تبسيط `settleAdvanceWithSplit` + إزالة `is_outstanding_advance`)
- `src/types/project.ts` (حذف الحقل)
- `src/components/project/ExpensesSection.tsx` و`ResourcePayablesSection.tsx` (تنظيف أي مرجع)
- `src/lib/__tests__/advance-settlement.test.ts` (+اختبارات جديدة)

---

## معايير القبول
- تسوية split فاشلة في خطوة الفائض ⇒ السلفة تبقى مفتوحة (لا يتم) ولا مصروف يتيم.
- محاولة overflow بمبلغ يتجاوز رصيد الصندوق/العهدة ⇒ خطأ واضح بالعربية، لا تغيير في DB.
- العمود `expenses.is_outstanding_advance` غير موجود؛ لا أخطاء types.
- كل الاختبارات السابقة (18) + 3 جديدة تمر.
- Viewer لا يستطيع استدعاء RPC.

---

## ما بعد هذا الـ loop
- **B (5-9):** تحسينات UX لـ Split (عرض الفائض في شريط التقدم، أحداث split في History، ON DELETE SET NULL).
- **C (10-13):** تقارير PDF/Excel + Badges + إشعارات aging.
- **D (14-16):** تنظيف types وإزالة `(supabase as any)`.
