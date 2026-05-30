# خطة إكمال التحسينات — الأولوية C ثم D

## الحالة الحالية
- ✅ A (1-4): RPC ذرية + حذف العمود المهجور + فحص الرصيد.
- ✅ B (5-9): FKs صحيحة، عرض الفائض، حماية حذف PR.
- 🔜 C (10-13): تقارير + تنبيهات aging.
- 🔜 D (14-16): تنظيف type-casts.

---

## الأولوية C — تقارير وتنبيهات السلف (10-13)

### C10) تقرير "السلف القائمة" PDF/Excel
- إضافة زر **"تصدير السلف القائمة"** في `ResourcePayablesSection.tsx` بجانب الفلاتر.
- يفتح قائمة منسدلة: **PDF** | **Excel**.
- استخدام `src/lib/export.ts` (الموجود) مع دوال جديدة:
  - `exportOutstandingAdvancesPDF(advances, projectName)` — جدول RTL بأرقام إنجليزية، أعمدة: المورد، التاريخ، المبلغ الأصلي، المسوى، المتبقي، عمر السلفة (أيام)، الحالة.
  - `exportOutstandingAdvancesExcel(advances, projectName)` — نفس الأعمدة في ورقة Excel.
- يحترم الفلاتر النشطة (المورد، الحالة، الفترة).

### C11) تقرير "سجل التسويات" PDF/Excel
- زر مماثل لتصدير `settlement_events` للسلفة المختارة (أو لكل السلف).
- أعمدة: التاريخ، نوع الحدث (وثّقت/استرداد/فائض/تراجع)، المبلغ، الفائض، مصدر الفائض، المنفّذ.

### C12) إشعارات Aging تلقائية
- إضافة عتبات في `BudgetAlerts.tsx` (أو فصلها في `AdvanceAgingAlerts.tsx` جديد):
  - **30 يومًا**: تنبيه أصفر (`toast.info`) — "سلفة [المورد] متبقية منذ 30 يومًا".
  - **60 يومًا**: تنبيه برتقالي (`toast.warning`).
  - **90+ يومًا**: تنبيه أحمر (`toast.error`) — "تتطلب إجراء فوري".
- حساب العمر من `payment_requests.paid_date` للسلف التي `is_advance_outstanding = true`.
- استخدام `useRef` لمنع التكرار في الجلسة.

### C13) شارة Aging في صف السلفة
- في `ResourcePayablesSection.tsx` بجانب اسم المورد:
  - Badge ملوّن (سداسي اللون عبر `health-good/warning/critical`):
    - أخضر < 30 يومًا
    - أصفر 30-59
    - برتقالي 60-89
    - أحمر ≥ 90
  - عرض الرقم: "منذ X يومًا" (أرقام إنجليزية).

---

## الأولوية D — تنظيف (14-16)

### D14) إزالة `as any` من resourcePayableSlice
- حصر كل `as any` بعد تحديث `types.ts` بـ `split_settle_advance` و`reverse_settlement_event`.
- استبدالها بأنواع مولّدة من Supabase.

### D15) إزالة المراجع المتبقية لـ `is_outstanding_advance`
- بحث شامل وحذف أي بقايا في:
  - `ExpensesSection.tsx`
  - `helpers.ts` (السطر الميت `false`)
  - ملفات الاختبار.

### D16) توثيق
- تحديث `.lovable/plan.md` لإغلاق جميع البنود.
- إضافة تعليق في `split_settle_advance` و`reverse_settlement_event` يوثّق العقد (المدخلات/المخرجات/الأخطاء).

---

## الملفات المتأثرة

**جديد:**
- `src/components/project/AdvanceAgingAlerts.tsx` (اختياري — قد ندمج في BudgetAlerts).

**معدّل:**
- `src/lib/export.ts` — دالتان جديدتان للتصدير.
- `src/components/project/ResourcePayablesSection.tsx` — أزرار التصدير + شارات Aging.
- `src/components/BudgetAlerts.tsx` أو ملف جديد — تنبيهات Aging.
- `src/store/slices/resourcePayableSlice.ts` — إزالة `as any`.
- `src/store/helpers.ts` — إزالة السطر الميت.
- `.lovable/plan.md` — تحديث الحالة.

**اختبارات:**
- `src/lib/__tests__/advance-settlement.test.ts` — اختبارات لحساب العمر والعتبات.

---

## الاختبار
- تشغيل `vitest run` للتأكد من اجتياز جميع الاختبارات (18+ جديدة).
- معاينة يدوية للتصدير PDF/Excel والتأكد من الأرقام الإنجليزية والـ RTL.
