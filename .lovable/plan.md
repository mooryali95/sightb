

## خطة التحسينات — تتبع المصاريف ومقاييس PMI

### 1. فصل Contingency Reserve في BudgetSection
**الملف:** `src/components/project/BudgetSection.tsx`

إضافة قسم "تحليل الاحتياطيات" بعد جدول ملخص الفئات:
- حساب `contingencyPlanned` و `contingencyActual` من `budgetItems` و `expenses` بفئة `contingency`
- عرض: الموازنة بدون احتياطي، احتياطي مخطط/مصروف/متبقي، الاحتياطي الإداري
- يتطلب تمرير `managementReserve` كـ prop جديد (من `ProjectDetail`)

### 2. ربط تلقائي للمصروفات غير المربوطة
**الملف:** `src/components/project/BudgetSection.tsx`

- إضافة زر "ربط تلقائي حسب الفئة" في تنبيه المصروفات غير المربوطة
- منطق: لكل مصروف بدون `budgetItemId`، البحث عن أول بند موازنة بنفس الفئة والمشروع
- استدعاء `updateExpense(id, { budgetItemId })` لكل مصروف مطابق

### 3. Resource Cost Variance في ResourcesSection
**الملف:** `src/components/project/ResourcesSection.tsx`

- إضافة props: `budgetItems` و `expenses` (تمريرها من `ProjectDetail`)
- لكل مورد: حساب التكلفة المخططة (من `budgetItems` المربوطة بالمورد) والفعلية (من `expenses` المربوطة)
- عرض أعمدة إضافية: المخطط، الفعلي، الانحراف، نسبة الانحراف

### 4. Cost Trend Chart في ChartsSection
**الملف:** `src/components/project/ChartsSection.tsx`

- إضافة props: `expenses`, `totalPlanned`, `durationMonths`
- رسم LineChart جديد بثلاثة خطوط:
  - المصروف الفعلي لكل شهر
  - المعدل التراكمي (burnRate المتوسط)
  - متوسط الصرف المخطط شهرياً (`totalPlanned / durationMonths`)

### 5. Project Health Matrix في Dashboard
**الملف:** `src/pages/Dashboard.tsx`

- إضافة ScatterChart بعد قسم "أداء المحافظ"
- المحور X: نسبة الصرف (spendRate %)، المحور Y: نسبة الإنجاز (percentComplete %)
- تلوين النقاط: أخضر (إنجاز عالي + صرف قليل)، أحمر (إنجاز قليل + صرف عالي)، أصفر (وسط)

### 6. Period-over-Period Comparison في Dashboard
**الملف:** `src/pages/Dashboard.tsx`

- زر "مقارنة مع الشهر السابق" يجلب آخر `periodic_snapshots`
- عرض: القيمة الحالية ← السابقة ← التغيير (↑/↓/→) لكل مؤشر رئيسي

### 7. Snapshot Auto-Save في Dashboard
**الملف:** `src/pages/Dashboard.tsx`

- زر "حفظ لقطة الشهر الحالي"
- يحسب summaries لكل مشروع/محفظة/شركة ويحفظها كـ `PeriodicSnapshot` بـ period = `YYYY-MM`

### 8. تحديث README.md
**الملف:** `README.md`

- وصف النظام بالعربية، التقنيات، هيكل الملفات، خطوات إضافة مشروع، الصلاحيات

### الملفات المعدّلة

| الملف | التغيير |
|-------|---------|
| `src/components/project/BudgetSection.tsx` | قسم الاحتياطيات + ربط تلقائي |
| `src/components/project/ResourcesSection.tsx` | Resource Cost Variance |
| `src/components/project/ChartsSection.tsx` | Cost Trend Chart |
| `src/pages/ProjectDetail.tsx` | تمرير props جديدة للمكونات |
| `src/pages/Dashboard.tsx` | Health Matrix + مقارنة + لقطات |
| `README.md` | توثيق حقيقي |

لا حاجة لأي migration — جميع البيانات متوفرة حالياً.

