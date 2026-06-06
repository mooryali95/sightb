
# خطة إصلاح شاملة (مرقّمة بالأولوية)

تم تشغيل الاختبارات (81/81 ✅) ثم إجراء تدقيق آلي مزدوج على الوحدة المالية وصفحة المشروع والداشبورد. النتائج أدناه. التنفيذ بعد موافقتك. الإصلاحات frontend فقط (لا تغييرات DB).

---

## 🔴 المرحلة 1 — حرج (أرقام خاطئة تظهر للمستخدم)

1. **`FundsSection.tsx:438` — تمرير `cashTransfers` المفقود إلى `getFundSpent`/`getFundRemaining`** (المتبقي من الدفعة مُضخّم عند وجود تحويلات نقدية).
2. **`CashLedgerSection.tsx:62` — تمرير `cashTransfers` إلى `getProjectFundsSummary`** (لمنع تعارض "بيد المدير" بين بطاقتين على نفس التبويب).
3. **`ExpensesSection.tsx:66` — تمرير `cashTransfers` في حارس رصيد الدفعة** (الإنذار ⚠️ يظهر متأخراً).
4. **`ResourcePayablesSection.tsx:239` — إضافة `getCustodyCashTransfersIn` إلى رصيد العهدة المتاح** (دفعات مشروعة تُحجب حالياً).
5. **`CashLedgerSection.tsx:429` — تطبيق نفس الإصلاح على عرض رصيد العهدة في الـ Overview**.
6. **`CustodySection.tsx:356` — قسمة شريط نسبة الصرف على `c.effectiveAmount` بدلاً من `c.amount`** (يظهر >100% بعد التعبئة).
7. **`Dashboard.tsx:222-248` — تمرير المصفوفات المفلترة** (`filteredAllExpenses/BudgetItems/Revenues/ChangeOrders`) إلى `HealthMatrix`, `AttentionProjects`, `ProjectCards`, `ProjectsTable` (الفلاتر لا تؤثر عليها الآن).
8. **`PortfolioDetail.tsx:52` — إزالة حارس `detailsLoaded` العام** (يمنع تحميل بقية مشاريع المحفظة) واستدعاء `loadProjectData` لكل مشروع.

## 🟠 المرحلة 2 — مهم (تكرارات + سلوك خاطئ)

9. **تبويب "الدفعات" يكرّر البطاقات** — `CashLedgerSection` و`FundsSection` يعرضان نفس بطاقات الملخص + جدول الدفعات. **الحل:** `CashLedgerSection` = ملخص فقط، `FundsSection` = جدول وأزرار فقط.
10. **`RevenueSection.tsx:243` — بطاقة "ذمم مدينة" تطابق "مُفوتر" حرفياً.** استبدالها بـ "غير محصّل / قيمة العقد %" أو حذفها.
11. **`ProjectDetail.tsx:891` — `MobileFAB` للـ tracking يشير إلى تبويب `risks` الموجود في `management`**. تصحيح الـ group.
12. **تبويب EVM مكرّر** — EAC/TCPI كـ StatCards في رأس `ProjectDetail` ثم قسم EVM كامل في `ExecutiveSummary`. **الحل:** الإبقاء على القسم في `ExecutiveSummary` وإزالة StatCards المكررة من الرأس.
13. **زر "إقرار الاستلام" مكرر** بين `FundsSection` وداخل دايلوج المصروفات في `ExpensesSection`. إزالة النسخة المضمّنة.
14. **`FundsSection.tsx:204` — زر "حفظ مسودة" يصمت بلا رسالة** قبل إقرار الاستلام. إضافة `toast.error` وتعطيل الزر.
15. **`FundsSection.tsx:536` — زر الحذف يتجاهل `readOnly`.** إضافة الشرط.
16. **`CustodySection.tsx:147` — إغلاق العهدة التلقائي يكتب مباشرة لـ Supabase ويتجاوز Zustand** → استخدام `updateCustody` من المتجر.
17. **`ExpensesSection.tsx:227` — استدعاء `useStore.getState()` داخل handler** → إضافة `updateProject` للـ destructure.
18. **`BudgetAlerts` مستورد ولا يُعرض أبداً في `ProjectDetail.tsx:30`.** قرار: حذف الاستيراد (تم استبداله بـ `SmartBudgetAlerts`).
19. **`WhatIfSection.tsx:162` — مقارنة EAC تستخدم `contractValue` الأصلي بدل `scenario.newContract`.**
20. **`WhatIfSection.tsx:51` — EV يُحسب من `projectedTotal` فيُلغي تأثير expense delta على CPI.** استخدام `totalPlanned` الأصلي كـ BAC.
21. **`ProjectDetail.tsx:859` — `Accordion onValueChange` يحفظ `vals[0]` فقط في URL.** تتبّع آخر عنصر مفتوح.

## 🟡 المرحلة 3 — تجميل وتنظيف

22. حذف استيرادات ميتة: `Sparkles`, `DialogTrigger` في `ProjectDetail.tsx`؛ `getHealthScore`, `BarChart3`, `detailsLoading` في `PortfolioDetail.tsx`.
23. **`PortfolioDetail.tsx:318` — أيقونة `TrendingUp` للمصروفات** → تبديلها بـ `TrendingDown`.
24. **`AuditLogSection.tsx:153` — `toLocaleString('en-US')`** يُنتج أرقاماً غربية وسط واجهة عربية → استخدام `formatCurrency` أو `'ar-EG'`.
   *(ملاحظة: قاعدة التطبيق تستخدم أرقاماً إنجليزية في كل مكان، لذا سنُبقي en-US ولكن نوحّد التنسيق.)*
25. **`ExecutiveSummary.tsx:278` — رموز يونيكود `■ □ ○`** → استبدالها بـ `<span>` ملوّنة.
26. **`CashFlowSankey.tsx:59` — السلف المسدّدة نقداً (cash_refund) لا تظهر في المخطط** → إضافة حلقة منفصلة.
27. **`resource-payables.ts:108` vs `getResourceBalance:46` — صيغ "outstanding" مختلفة** → توحيدها مع اختبار وحدة.
28. **`PortfolioDetail.tsx:160` — `loading || !portfolio` يستبدل الصفحة بسبينر** عند الـ refresh الخلفي → `if (!portfolio)` فقط.

---

## التحقق بعد التنفيذ

- تشغيل `vitest run` (يجب بقاء 81/81).
- إضافة اختبارات وحدة جديدة لـ:
  - `getFundRemaining` مع `cashTransfers`.
  - `getCustodyEffectiveAmount` (الرصيد بعد التعبئة).
  - توحيد صيغة "outstanding" في `resource-payables`.
- مراجعة بصرية لتبويب "الدفعات" بعد إزالة التكرار.
- اختبار `MobileFAB` على viewport 393px.

---

## خيارات التنفيذ

- **أ) تنفيذ كل المراحل (1+2+3) في دفعة واحدة** — تقدير: 28 تعديل، أغلبها صغير ومركّز.
- **ب) تنفيذ المرحلة 1 (الحرج) فقط الآن** ثم المراجعة قبل المتابعة.
- **ج) اختيار بنود محددة تريد استبعادها.**

أوصي بـ **(أ)** لأن البنود مستقلة ومركّزة. أخبرني أيها تريد.
