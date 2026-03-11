

# خطة: إصلاح صلاحيات المشاهد + تقسيم لوحة التحكم

---

## المشكلة 1: المشاهد/المحرر لا يرى الشركة في الشريط الجانبي

### السبب الجذري
دالة `has_access` في قاعدة البيانات تدعم التسلسل من **شركة → مشروع** (من لديه صلاحية على شركة يرى مشاريعها)، لكنها **لا تدعم العكس**: من لديه صلاحية على مشروع فقط لا يرى الشركة الأم.

المستخدم `omarabdelhaamid@gmail.com` لديه دور `editor` على مشروع واحد فقط (`scope_type=project`). عند تحميل الشركات، سياسة RLS تستدعي `has_access(uid, 'company', company_id)` — ولأن المستخدم ليس لديه `scope_type=system` ولا `scope_type=company`، لا تظهر له أي شركة.

### الحل
تحديث دالة `has_access` لإضافة تسلسل عكسي: إذا كان المستخدم لديه صلاحية على مشروع تابع لشركة معينة، يُسمح له برؤية تلك الشركة.

```sql
-- إضافة شرط جديد في has_access:
OR (
  _scope_type = 'company'::scope_type 
  AND user_roles.scope_type = 'project'::scope_type
  AND user_roles.scope_id IN (
    SELECT id FROM public.projects WHERE company_id = _scope_id
  )
)
```

---

## المشكلة 2: تقسيم Dashboard.tsx (942 سطر)

### التقسيم المقترح

| المكون الجديد | المحتوى | الأسطر تقريباً |
|---|---|---|
| `DashboardFilters.tsx` | شريط الفلاتر + البحث + الفترة الزمنية | ~80 |
| `DashboardStats.tsx` | بطاقات الإحصائيات الأربع | ~50 |
| `DashboardCharts.tsx` | رسم المصروفات + دائرة الحالات + مصفوفة الصحة | ~150 |
| `PortfolioPerformance.tsx` | أداء المحافظ | ~50 |
| `AttentionProjects.tsx` | مشاريع تحتاج انتباه + أعلى المخاطر | ~100 |
| `ProjectCards.tsx` | بطاقات المشاريع | ~80 |
| `ProjectsTable.tsx` | جدول المشاريع الكامل | ~80 |
| `CompanyManagement.tsx` | إدارة الشركات (أرشفة/حذف) | ~80 |

**Dashboard.tsx** يبقى كمنسق (~150 سطر) يحسب البيانات ويمررها كـ props.

---

## الملفات المتأثرة

- **Migration SQL** — تحديث دالة `has_access`
- `src/components/dashboard/DashboardFilters.tsx` — جديد
- `src/components/dashboard/DashboardStats.tsx` — جديد
- `src/components/dashboard/DashboardCharts.tsx` — جديد
- `src/components/dashboard/PortfolioPerformance.tsx` — جديد
- `src/components/dashboard/AttentionProjects.tsx` — جديد
- `src/components/dashboard/ProjectCards.tsx` — جديد
- `src/components/dashboard/ProjectsTable.tsx` — جديد
- `src/components/dashboard/CompanyManagement.tsx` — جديد
- `src/pages/Dashboard.tsx` — إعادة كتابة كمنسق

