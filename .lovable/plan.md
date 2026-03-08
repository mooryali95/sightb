

# خطة إصلاح النظام المالي — Financial System Fix

## ملخص المشكلات المؤكدة بعد مراجعة الكود

1. **EVM معطّل** — `finance.ts:113`: `percentComplete = totalActual / totalPlanned` يجعل EV = AC دائماً، فـ CPI = 1 دائماً
2. **حساب الربح متناقض** — `Dashboard.tsx:77`: `totalRevenue = ... || totalContractValue` يستخدم قيمة العقد كإيراد، بينما `getProjectSummary` لا تفعل ذلك
3. **getCurrentMonth غير موجودة** — لا توجد دالة لحساب الشهر الحالي من `startDate`، يُستخدم `durationMonths/2` ثابتاً
4. **BudgetItem.month حقل واحد** — لا يدعم نطاق شهري
5. **Revenue بدون حالة** — لا فرق بين مخطط ومفوتر ومحصّل

## خطة التنفيذ

### المرحلة 1: Migration قاعدة البيانات

migration واحد يتضمن:

- **projects**: إضافة `percent_complete`, `contract_type`, `retention_percent`, `management_reserve`
- **budget_items**: إضافة `start_month`, `end_month`, `cost_type`, `cost_class` + ملء `start_month`/`end_month` من `month` الحالي
- **revenues**: إضافة `revenue_type`, `status` (default `collected`), `invoice_number`, `invoice_date`, `collection_date`
- **milestones**: جدول جديد بالكامل مع RLS (select/insert/update/delete بنفس نمط الجداول الأخرى)
- **change_orders**: جدول جديد بالكامل مع RLS
- تفعيل audit triggers على الجدولين الجديدين

### المرحلة 2: تحديث Types (`types/project.ts`)

- تحديث `Project`, `BudgetItem`, `Revenue` interfaces بالحقول الجديدة
- إضافة `Milestone`, `ChangeOrder` interfaces
- إضافة labels عربية: `REVENUE_TYPE_LABELS`, `REVENUE_STATUS_LABELS`, `COST_TYPE_LABELS`, `CONTRACT_TYPE_LABELS`
- إعادة هيكلة `ProjectSummary` ليشمل: `effectiveContractValue`, `contractRemaining`, `budgetRemaining`, `plannedProfit`, `collectedRevenue`, `invoicedRevenue`, `accountsReceivable`, `realizedProfit`, `burnRate`, `percentComplete`

### المرحلة 3: إعادة كتابة المنطق المالي (`lib/finance.ts`)

- إصلاح `getProjectSummary` — يقبل `changeOrders` كمعامل، يحسب `effectiveContractValue` و 3 أنواع ربح منفصلة
- إضافة `getCurrentMonth(startDate, durationMonths)` — حساب حقيقي من التاريخ
- إصلاح `calculateEVM` — يقبل `percentComplete` كمعامل، `EV = (percentComplete/100) * BAC`
- إعادة كتابة `getBaselineMonthlyPV` — دعم `startMonth`/`endMonth` + `costType` (one_time/recurring/fixed)
- إضافة `getPlannedMonthlyCashFlow`, `getCashFlowForecast`, `getEffectiveContractValue`

### المرحلة 4: تحديث Store (`store/helpers.ts` + `store/useStore.ts`)

- تحديث mappers: `mapProject`, `mapBudgetItem`, `mapRevenue` بالحقول الجديدة
- إضافة `mapMilestone`, `mapChangeOrder`
- إضافة `milestones`, `changeOrders` إلى state مع CRUD كامل
- تحديث `loadAll` لتحميل الجدولين الجديدين
- تحديث `addProject`/`updateProject` بالحقول الجديدة
- تحديث `addBudgetItem`/`updateBudgetItem` و `addRevenue`/`updateRevenue` بالحقول الجديدة

### المرحلة 5: تحديث الواجهات

**ProjectDetail.tsx:**
- إضافة `MilestonesSection` — جدول مراحل مع نسبة إنجاز ووزن، تحديث تلقائي لـ `percentComplete` للمشروع
- إضافة `ChangeOrdersSection` — جدول أوامر تغيير مع حالة وأثر مالي
- تحديث `BudgetSection` — حقلين "من شهر"/"إلى شهر" + `costType`
- تحديث `RevenueSection` — `revenueType` + `status` مع badges ملونة + ملخص أعلى القسم
- تحديث `BaselineSection` — استخدام `percentComplete` و `getCurrentMonth` الحقيقيين
- تحديث Stats cards — ربح مخطط + متبقي من الموازنة بدل المتبقي من العقد
- ترتيب tabs: المراحل | الموارد | الموازنة | خط الأساس | المصروفات | العهد | الإيرادات | أوامر التغيير | التحليلات | السجل

**Dashboard.tsx:**
- إزالة `|| totalContractValue` من حساب الإيراد
- استخدام `getProjectSummary` الموحّدة مع `changeOrders`
- تحديث Stats cards: عرض "الربح المخطط" بدل "صافي الربح"

**NewProject.tsx:**
- إضافة select لـ `contractType` + حقل `retentionPercent`

### المرحلة 6: تحديث التصدير والتنبيهات

- `lib/export.ts`: إضافة sheets "التدفق النقدي" و"أوامر التغيير" في Excel، وصفحة ملخص تنفيذي في PDF
- `BudgetAlerts.tsx`: تنبيه عند CPI < 0.85

## ملاحظات تقنية

- جميع الحقول الجديدة في DB لها defaults لضمان التوافق مع البيانات القديمة
- عمود `month` في `budget_items` يبقى للتوافق، الكود الجديد يستخدم `start_month`/`end_month`
- Revenue `status` default = `collected` حتى لا تتأثر البيانات الحالية
- حجم التغيير كبير (~10 ملفات)، سيتم التنفيذ على دفعات مترابطة

