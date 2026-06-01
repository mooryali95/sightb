## الهدف
تدقيق احترافي (Financial Audit) لكل رقم/معادلة/حساب في تطبيق "Rouya" للتأكد من صحته الرياضية والمحاسبية، ومطابقته لسياسات المشروع المعتمدة (سياسة التخزين الصافي، فصل VAT، EVM وفق PMI، إغلاق السلف، إلخ).

## النطاق — الملفات المستهدفة

### 1) محرّك الحسابات الأساسي (`src/lib/`)
- `finance.ts` (755 سطر) — EVM, BAC, EV, AC, CPI, SPI, EAC, ETC, VAC, TCPI, الـ VAT (calcVAT/addVAT/removeVAT), getEffectiveContractValue, getTotalPlanned, توزيع التكاليف الشهرية.
- `funds.ts` — حسابات الدفعات/الأرصدة/الاستهلاك (% spending) للعهد والصناديق.
- `fund-alerts.ts` — عتبات التنبيه (50%/75%/90%).
- `resource-payables.ts` — رصيد السلف، outstanding, overflow, aging.
- `portfolio.ts` — تجميع المحفظة، Health Score, المخاطر، التكاليف غير المباشرة.
- `validations.ts` — صحة المدخلات الرقمية.

### 2) منطق المتجر (`src/store/`)
- `helpers.ts` — المُحوِّلات والمشتقات المالية.
- `slices/budgetSlice.ts`, `baselineSlice.ts`, `budgetAmendmentSlice.ts` — مجاميع الموازنة.
- `slices/fundSlice.ts` — settlement, total_received/spent/remaining, difference.
- `slices/resourcePayableSlice.ts` — split settlement, overflow_expense_id, settled_amount.
- `slices/trackingSlice.ts` — التقدّم، الإنجاز المكتسب (EV) عبر milestones × weight.

### 3) دوال قاعدة البيانات (`supabase/migrations/`)
- `split_settle_advance`, `reverse_settlement_event`, `has_role`, `protect_pr_with_settlements`, أي trigger يحسب أرصدة.
- التأكد من الذرّية (atomicity) ومنع الـ double-counting.

### 4) مكوّنات تعرض أرقامًا محسوبة (`src/components/project/` و `dashboard/`)
- `ExecutiveSummary.tsx`, `BudgetSection.tsx`, `MonthlyBudgetPlan.tsx`, `ChartsSection.tsx`, `WhatIfSection.tsx`, `SmartBudgetAlerts.tsx`, `ResourcePayablesSection.tsx`, `CashLedgerSection.tsx`, `FundsSection.tsx`, `CustodySection.tsx`, `CommitmentsSection.tsx`, `RevenueSection.tsx`, `RisksSection.tsx`, `MilestonesSection.tsx`.
- `dashboard/HealthMatrix.tsx`, `PortfolioPerformance.tsx`, `DashboardStats.tsx`, `DashboardCharts.tsx`.
- `BudgetAlerts.tsx`, `SmartNotifications.tsx`.

### 5) التصدير (`src/lib/export.ts`)
- التأكد أن الأرقام المصدّرة (PDF/Excel) مطابقة تمامًا للأرقام في الواجهة بعد VAT/Net policy.

## منهجية التدقيق

لكل ملف/معادلة سيتم:
1. **استخراج الصيغة** كما هي مكتوبة في الكود.
2. **مقارنتها بالمرجع المعتمد**:
   - EVM: PMBOK 7 (PV=BAC×%schedule, EV=BAC×%complete, CPI=EV/AC, SPI=EV/PV, EAC=BAC/CPI, ETC=EAC−AC, VAC=BAC−EAC, TCPI=(BAC−EV)/(BAC−AC)).
   - VAT: سياسة "Net Storage" — التخزين بدون ضريبة، الحساب ديناميكي بـ `tax_percent`.
   - السلف: outstanding = original − Σ(settled_amount) − Σ(refunded) − Σ(overflow_consumed).
   - الصناديق: remaining = received − spent ± difference (مع علم بـ legacy_pre_fund).
   - Health Score: قواعد المشروع (CPI<0.7 critical, Risk≥50% warning).
3. **رصد المشاكل** المحتملة:
   - قسمة على صفر بدون حماية.
   - خلط شامل/صافي للضريبة (double VAT).
   - استخدام `parseFloat` على أرقام عربية/هندية بدون تطبيع.
   - تجاهل `approval_status` أو `status='rejected'` في التجميعات.
   - عدم استبعاد العهد المغلقة أو السلف المسوّاة.
   - حسابات شهرية تتجاوز `durationMonths` أو تبدأ قبل `startMonth`.
   - تقريب (rounding) متراكم يسبب فروقات هلليّة.
   - استخدام `Date.now()` بدل تاريخ المشروع في حسابات العمر.
   - عدم احتساب Change Orders المعتمدة في BAC/EAC.
   - إغفال Management Reserve.
   - تكرار حساب المصاريف المرتبطة بـ payment_request (double count مع expenses).
4. **التحقق من الاختبارات الموجودة** ومقارنتها بالمعادلات الفعلية.
5. **تشغيل `bunx vitest run`** للتأكد أن الاختبارات الحالية (47+) تمر.

## مخرجات التدقيق

تقرير منظم في ملف `.lovable/financial-audit.md` يحوي:

```
لكل معادلة:
- الموقع (file:line)
- الصيغة الحالية
- الصيغة المرجعية الصحيحة
- الحكم: ✅ صحيح | ⚠️ مخاطرة | ❌ خطأ
- الأثر المالي (إن وجد)
- التوصية والإصلاح المقترح
```

مع جدول تنفيذي علوي يلخّص:
- عدد المعادلات المفحوصة.
- عدد الأخطاء الحرجة / التحذيرات.
- قائمة الإصلاحات المرتّبة بالأولوية.

## ما لن يُغيَّر في هذه المرحلة
- لن تُجرى تعديلات على الكود — هذه **مرحلة تدقيق فقط**.
- بعد موافقتك على التقرير، سأقترح خطة إصلاح منفصلة للأخطاء الحرجة أولًا.

## الخطوات
1. قراءة الملفات الستة في `src/lib/` + `helpers.ts` بالكامل.
2. قراءة slices المالية (`fundSlice`, `resourcePayableSlice`, `trackingSlice`, `budgetSlice`, `baselineSlice`).
3. قراءة مكوّنات العرض المالي الرئيسية (Executive, Budget, Funds, Custody, Charts).
4. قراءة آخر migration لدوال SQL (`split_settle_advance`, triggers).
5. تشغيل `bunx vitest run` لرصد فجوات الاختبارات.
6. كتابة `.lovable/financial-audit.md`.

هل أبدأ؟
