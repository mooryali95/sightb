## الموجة الثانية: تسطيح التبويبات + الشارات الذكية + إكمال Mobile-First

### الهدف
تبسيط جذري للملاحة داخل المشروع، إضافة Information Scent عبر شارات ذكية، وإكمال نمط Mobile-First لكل النماذج المالية المتبقية.

---

### 1. تسطيح التبويبات في `ProjectDetail.tsx`

التبويبات الرئيسية الخمسة فقط (بدون أي Sub-tabs أفقية):

| التبويب | المحتوى (Accordion عمودي) |
|---|---|
| **نظرة عامة** | Executive Summary + AI Insights + Smart Alerts |
| **التخطيط** | Baseline · Budget · Monthly Plan · Milestones · Resources |
| **المالية** | Expenses · Commitments · Funds · Custody · Revenue · Resource Payables · Cash Ledger |
| **المتابعة** | Charts · Gantt · Risks · Change Orders · What-If |
| **الإدارة** | Audit Log · Budget Amendments · إعدادات المشروع |

- استخدام `Accordion type="multiple"` مع حفظ الحالة في `searchParams` (deep-link).
- إزالة كل `TabsList` المتداخلة الحالية.

### 2. الشارات الذكية (Information Scent)

شارة بجوار اسم كل تبويب رئيسي تعكس حالات تستحق الانتباه:

- **المالية**: عدد المصروفات المعلّقة + عدد البنود التي تجاوزت 90% من ميزانيتها (لون `health-warning`/`health-critical`).
- **المتابعة**: عدد المخاطر العالية + أوامر التغيير المعلّقة.
- **التخطيط**: مؤشر إذا لم يُعتمد Baseline بعد.
- **الإدارة**: عدد التعديلات في آخر 7 أيام (للأدمن فقط).

تنفيذ عبر hook موحّد `useTabBadges(projectId)` يحسب القيم من الـ store.

### 3. ترويسة المشروع (Header)

- زر إجراءات موحّد `⋯` (DropdownMenu) يجمع: تصدير، أرشفة، إعدادات، حذف.
- إزالة الأزرار المبعثرة في الترويسة.
- تثبيت ارتفاع الترويسة وإضافة `sticky top-0` على شريط التبويبات.

### 4. إكمال Mobile-First للنماذج المالية

تحويل النماذج التالية لاستخدام `ResponsiveFormDialog` بنفس نمط `ExpensesSection`:

- `CustodySection.tsx`
- `RevenueSection.tsx`
- `CommitmentsSection.tsx`
- `ChangeOrdersSection.tsx`
- `BudgetSection.tsx` (نموذج إضافة/تعديل البند)
- `MilestonesSection.tsx`
- `RisksSection.tsx`

تحسينات موحّدة لكل نموذج:
- Sticky footer للأزرار
- `h-11` للحقول و`inputMode="decimal"` للأرقام
- Bottom Sheet `h-[92vh]` على الجوال

### 5. مكوّن `ResponsiveDataTable`

مكوّن جديد يعرض:
- **Desktop**: جدول `<Table>` كالمعتاد
- **Mobile**: قائمة بطاقات `Card` مع الحقول الأهم + زر `⋯` للإجراءات

سيُستخدم في: Expenses, Commitments, Funds, Custody, Revenue, Resource Payables.

### 6. FAB موحّد على الجوال

زر عائم (Floating Action Button) أسفل-يسار في صفحة المشروع، يعرض الإجراء الأساسي حسب التبويب النشط (مثلاً: + مصروف، + إيراد).

### 7. Empty States + Onboarding خفيف

- استبدال كل القوائم الفارغة بمكوّن `EmptyState` (موجود مسبقًا) مع CTA واضح.
- Tooltip أول مرة يُلمح إلى `Ctrl+K` للبحث الشامل (يُحفظ في localStorage).

---

### الملفات المتأثرة

```text
src/pages/ProjectDetail.tsx              (تسطيح التبويبات + Header)
src/hooks/useTabBadges.ts                (جديد)
src/components/ResponsiveDataTable.tsx   (جديد)
src/components/MobileFAB.tsx             (جديد)
src/components/project/CustodySection.tsx
src/components/project/RevenueSection.tsx
src/components/project/CommitmentsSection.tsx
src/components/project/ChangeOrdersSection.tsx
src/components/project/BudgetSection.tsx
src/components/project/MilestonesSection.tsx
src/components/project/RisksSection.tsx
src/components/AppSidebar.tsx            (Onboarding tooltip لـ Ctrl+K)
```

لا تغييرات على قاعدة البيانات أو منطق الأعمال — كله UI/UX.

---

### ماتريكس التقدّم (سيُسلَّم بعد التنفيذ)

سأرسل في نهاية التنفيذ ماتريكس Mermaid يوضّح:
- ما اكتمل في الموجات 1 و 2
- ما تبقّى للموجة 3 (لو وُجد)
- نسبة الإنجاز لكل محور (Design Tokens, IA, Mobile-First, A11y, Onboarding)

