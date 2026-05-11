## الموجة الثالثة: إكمال Mobile-First لكل النماذج المالية

### الهدف
نقل النماذج الستة المتبقية إلى نمط `ResponsiveFormDialog` الموحَّد، مع إضافة `ResponsiveDataTable` للجداول الطويلة، وتسليم ماتريكس التقدّم النهائية.

---

### 1. نقل النماذج إلى `ResponsiveFormDialog`

نفس النمط المطبَّق في `ExpensesSection` و`CustodySection`:
- Bottom Sheet `h-[92vh]` على الجوال، Dialog على الديسكتوب
- Sticky footer للأزرار (إلغاء + حفظ)
- `h-11` للحقول، `inputMode="decimal"` للأرقام، `inputMode="numeric"` للكميات
- استبدال أي ألوان Tailwind خام (emerald/amber/red) بـ `health-good/warning/critical`

النماذج المستهدفة:

| الملف | النموذج |
|---|---|
| `RevenueSection.tsx` | إضافة/تعديل إيراد |
| `CommitmentsSection.tsx` | إضافة/تعديل التزام |
| `ChangeOrdersSection.tsx` | إضافة/تعديل أمر تغيير |
| `BudgetSection.tsx` | إضافة/تعديل بند ميزانية |
| `MilestonesSection.tsx` | إضافة/تعديل معلم |
| `RisksSection.tsx` | إضافة/تعديل مخاطرة |

### 2. مكوّن `ResponsiveDataTable.tsx` (جديد)

- Desktop: `<Table>` كالمعتاد
- Mobile (<768px): قائمة `Card` تعرض الحقول الأهم + شارة حالة + قائمة `⋯` للإجراءات
- props: `columns`, `data`, `mobileCard(row)`, `actions(row)`, `emptyState`

تطبيقه أولاً على: `RevenueSection`, `CommitmentsSection`, `CustodySection`, `ResourcePayablesSection`. الباقي يتبع لاحقًا حسب الحاجة.

### 3. تنظيف الألوان الخام

فحص شامل بـ `rg "text-(emerald|amber|red|green|yellow)-"` في `src/components/project/` واستبدالها بالـ tokens.

### 4. Empty States

استبدال نصوص "لا توجد بيانات" بمكوّن `EmptyState` مع CTA لكل قسم.

### 5. ماتريكس التقدّم النهائية

في نهاية التنفيذ سأرفق جدول Markdown + رسم Mermaid يوضّح:

```text
المحور                   | الموجة 1 | الموجة 2 | الموجة 3 | %
-------------------------|---------|---------|---------|-----
Design Tokens            |   ✅    |   ✅    |   ✅    | 100
Information Architecture |   —     |   ✅    |   ✅    | 100
Mobile-First (8 نماذج)   |   —     |  2/8    |  8/8    | 100
Smart Badges             |   —     |   ✅    |   —     | 100
Empty States             |   ✅    |   —     |   ✅    | 100
A11y (focus-ring/ARIA)   |   ✅    |   —     |   ✅    |  90
Onboarding (Ctrl+K hint) |   —     |   —     |   ✅    | 100
```

---

### الملفات المتأثرة

```text
src/components/ResponsiveDataTable.tsx        (جديد)
src/components/project/RevenueSection.tsx
src/components/project/CommitmentsSection.tsx
src/components/project/ChangeOrdersSection.tsx
src/components/project/BudgetSection.tsx
src/components/project/MilestonesSection.tsx
src/components/project/RisksSection.tsx
src/components/AppSidebar.tsx                 (Ctrl+K tooltip أول مرة)
```

### القيود
- لا تغييرات على قاعدة البيانات أو RLS أو منطق الأعمال.
- لا تغييرات على الحسابات المالية أو EVM.
- كله UI/UX فقط.
