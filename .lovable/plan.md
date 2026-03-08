

# خطة بناء طبقة إدارة المحافظ — Portfolio Management Layer

## نظرة عامة

بناء نظام متكامل لإدارة المحافظ والشركات يشمل: جداول جديدة (risks, indirect_costs, periodic_snapshots)، صفحات تفصيلية للمحفظة والشركة، وقسم مخاطر في تفاصيل المشروع، مع تحسينات على لوحة التحكم والتنقل الجانبي.

---

## المرحلة 1: Migration قاعدة البيانات

migration واحد يتضمن:

- **portfolios**: إضافة `target_revenue`, `target_margin`, `fiscal_year`, `notes`
- **risks**: جدول جديد مع `project_id`/`portfolio_id` (أحدهما مطلوب)، `probability`, `impact`, `financial_impact`, `category`, `status`, `mitigation_plan`, `owner`
  - RLS: SELECT/INSERT/UPDATE/DELETE بنفس نمط الجداول الحالية (owner check + `has_access` على project_id أو portfolio_id عبر company_id)
  - Audit triggers: `audit_update` و `audit_delete`
- **indirect_costs**: جدول جديد مربوط بـ `company_id`، مع `category`, `description`, `amount`, `month`, `date`, `allocation_method`
  - RLS: owner + `can_edit`/`has_access` على company_id
- **periodic_snapshots**: جدول جديد مع `entity_type`, `entity_id`, `period`, `metrics` (JSONB)
  - RLS: owner + admin
- تحديث audit triggers لتشمل `risks` و `indirect_costs` في قائمة الجداول التي تستخرج `project_id`

---

## المرحلة 2: تحديث Types (`types/project.ts`)

- تحديث `Portfolio` interface بالحقول الجديدة (`targetRevenue`, `targetMargin`, `fiscalYear`, `notes`)
- إضافة `Risk` interface + types (`RiskProbability`, `RiskImpact`, `RiskCategory`, `RiskStatus`) + labels عربية + ألوان
- إضافة `IndirectCost` interface + `IndirectCostCategory` type + labels
- إضافة `PeriodicSnapshot` interface
- إضافة `PortfolioSummary` interface (يجمّع مؤشرات المشاريع: totalContractValue, totalActual, aggregatePlannedProfit, weightedPercentComplete, averageCPI, atRiskProjects, openRisks, totalFinancialExposure, revenueAchievement)
- إضافة `CompanySummary` interface (يجمّع PortfolioSummary + indirectCosts + netProfitAfterIndirect)
- إضافة `HealthStatus` type ('healthy' | 'warning' | 'critical') + labels + ألوان

---

## المرحلة 3: إنشاء `src/lib/portfolio.ts`

ملف جديد منفصل عن finance.ts يحتوي:

- **`getPortfolioSummary()`**: يصفّي المشاريع التابعة، يحسب `getProjectSummary` لكل مشروع، يجمّع المؤشرات (totalContractValue, totalEffectiveValue, totalPlanned, totalActual, collectedRevenue, invoicedRevenue, plannedProfit, realizedProfit, weightedPercentComplete, averageCPI مرجّح، atRiskProjects, openRisks, totalFinancialExposure, revenueAchievement)
- **`getCompanySummary()`**: يحسب PortfolioSummary لكل محفظة + المشاريع المستقلة، يطرح indirectCosts من الربح
- **`getHealthScore()`**: يُرجع healthy/warning/critical بناءً على عدد المشاريع المتعثرة وهامش الربح

---

## المرحلة 4: تحديث Store

**`store/helpers.ts`**:
- تحديث `mapPortfolio` بالحقول الجديدة
- إضافة `mapRisk`, `mapIndirectCost`, `mapSnapshot`

**`store/useStore.ts`**:
- إضافة `risks: Risk[]` + `addRisk`/`updateRisk`/`deleteRisk`
- إضافة `indirectCosts: IndirectCost[]` + `addIndirectCost`/`updateIndirectCost`/`deleteIndirectCost`
- إضافة `snapshots: PeriodicSnapshot[]` + `saveSnapshot`/`loadSnapshots`
- تحديث `loadAll` لتحميل `risks` و `indirect_costs`
- تحديث `updatePortfolio` بالحقول الجديدة (`targetRevenue`, `targetMargin`, `fiscalYear`, `notes`)

---

## المرحلة 5: إنشاء صفحة `PortfolioDetail.tsx`

صفحة كاملة تشبه Dashboard لكن لمحفظة واحدة:

- **Header**: اسم المحفظة + الشركة + badge الصحة (أخضر/أصفر/أحمر) + زر تصدير
- **4 بطاقات StatCard**: إجمالي قيمة العقود | إجمالي المصروفات | الربح المخطط | الإنجاز المرجّح %
- **شريط الأهداف**: progress bar (الإيراد المحصّل / المستهدف) إذا targetRevenue > 0
- **جدول مقارنة المشاريع**: المشروع | القيمة | المخطط | المصروف | الربح | الإنجاز% | الصحة — مرتّب بالصحة، ألوان، النقر → /project/:id
- **رسوم بيانية**: Pie (توزيع المصروفات حسب المشروع) + Bar (الربح المخطط لكل مشروع)
- **قسم المخاطر**: جدول + badges ملونة + Dialog إضافة + ملخص (عدد مفتوحة + تعرض مالي)
- **تدفق نقدي مجمّع**: Line Chart يجمع cashFlow لكل المشاريع

---

## المرحلة 6: إنشاء صفحة `CompanyDetail.tsx`

- **Header**: اسم الشركة + عدد المحافظ والمشاريع
- **4 بطاقات**: إجمالي العقود | المصروفات | صافي الربح بعد غير المباشرة | المتعثرة
- **بطاقات المحافظ**: كل محفظة بطاقة ملخص قابلة للنقر → PortfolioDetail
- **التكاليف غير المباشرة**: جدول + نموذج إضافة + إجمالي + أثرها على الربح
- **المشاريع المستقلة**: جدول بالمشاريع بدون محفظة

---

## المرحلة 7: إضافة RisksSection في ProjectDetail.tsx

tab جديد "المخاطر" بعد "أوامر التغيير":
- جدول: العنوان | الاحتمال | الأثر | الأثر المالي | الفئة | الحالة | المسؤول
- badges ملونة للاحتمال والأثر
- ملخص: عدد مفتوحة + إجمالي التعرض
- Dialog إضافة/تعديل + ConfirmDeleteDialog

---

## المرحلة 8: تحديث Routes و Sidebar

**App.tsx**: إضافة routes `/portfolio/:id` و `/company/:id` مع ProtectedRoute + ErrorBoundary

**AppSidebar.tsx**: تغيير سلوك النقر:
- النقر على **اسم** الشركة → `navigate(/company/:id)`
- النقر على **السهم** (ChevronDown) → toggle expand
- نفس الشيء للمحفظة: النقر على الاسم → `/portfolio/:id`، السهم → expand

---

## المرحلة 9: تحسين Dashboard

- قسم **"أداء المحافظ"**: بطاقات لكل محفظة (اسم + عدد مشاريع + إجمالي + إنجاز% + صحة) — قابلة للنقر
- قسم **"مشاريع تحتاج انتباه"**: مشاريع بـ spendRate > 90% أو on-hold/cancelled — بطاقة تحذيرية
- قسم **"أعلى المخاطر"**: أعلى 5 مخاطر مفتوحة حسب financialImpact

---

## المرحلة 10: تحديث Export

- `exportPortfolioToExcel()`: sheets (ملخص المحفظة + مقارنة المشاريع + المخاطر)
- `exportCompanyToExcel()`: sheets (ملخص الشركة + أداء المحافظ + التكاليف غير المباشرة)

---

## ملاحظات تقنية

- كل الحسابات client-side — لا stored procedures
- RLS بنفس نمط الجداول الحالية (owner + has_access/can_edit + admin)
- UI عربي RTL بالكامل، framer-motion للحركات، recharts للرسوم
- حجم التغيير: ~15 ملف (migration + 3 ملفات جديدة + تعديل ~10 ملفات موجودة)
- سيتم التنفيذ على دفعات: DB → Types → Logic → Store → Pages → UI updates

