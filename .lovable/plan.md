
## المحاور الثلاثة

### 1) إصلاح صلاحية "ادمن الشركة" (omarabdelhaamid@gmail.com)

**السبب الجذري المُكتشف:** المستخدم يحمل دور `admin` بنطاق `company` فقط (شركة `30eb7908…`)، لكن الواجهة (`useRole.isAdmin`) ودالة قاعدة البيانات `has_role()` يفحصان حصراً `scope_type = 'system'`. لذلك كل مستخدم admin مرتبط بشركة يُعامَل كـ "مطّلع" خارج صفحات الشركة، وحتى داخلها يفقد ميزات الادمن.

**الحل:**
- **الواجهة (`src/hooks/useRole.tsx`)**:
  - إبقاء `isOwner` و `isAdmin` كما هي (صلاحيات نظام عامة).
  - إضافة `isScopedAdmin: boolean` (صحيح لأي ادمن سواء system أو company أو project).
  - إضافة `isAdminFor(scopeType, scopeId)` التي تُرجع true إذا كان النظام-ادمن، أو ادمن للشركة المُمرَّرة، أو ادمن للمشروع المُمرَّر، أو ادمن للشركة الأم لمشروع.
  - تعديل `canEdit` ليستخدم نفس المنطق (موجود جزئياً).
- **استخدامات `isAdmin` في الكود (إجراء فحص شامل واستبدال حسب السياق):**
  - عناصر تخص "كل النظام" (سجل النظام، إدارة المستخدمين، حذف الشركات/المشاريع، الإعدادات العامة) → تبقى `isAdmin` (system فقط).
  - عناصر داخل صفحة مشروع/شركة (تبويب "السجل" داخل المشروع، الموافقة على المصروفات، إنشاء دفعات، إدارة العهد، حذف العناصر، إنشاء التسويات) → تنتقل إلى `isAdminFor('project', projectId)` أو `isAdminFor('company', companyId)`.
  - الملفات المتأثرة (تقريباً): `ProjectDetail.tsx`, `ExpensesSection.tsx`, `CustodySection.tsx`, `FundsSection.tsx`, `CashLedgerSection.tsx`, `BudgetSection.tsx`, `BaselineSection.tsx`, `BudgetAmendmentManager.tsx`, `RevenueSection.tsx`, `ResourcePayablesSection.tsx`, `AuditLogSection.tsx`, `MilestonesSection.tsx`, `ChangeOrdersSection.tsx`, `RisksSection.tsx`, `CommitmentsSection.tsx`, `CompanyDetail.tsx`, `dashboard/CompanyManagement.tsx`.
- **قاعدة البيانات** (لا حاجة لتعديل بيانات هذا المستخدم): الدوال الموجودة `can_edit` و `has_access` تدعم النطاقات بالفعل. سيتم التحقق فقط أن سياسات RLS الحساسة (مثل إنشاء `project_funds`) تسمح بـ company-admin ضمن نطاقه. أي سياسة تستخدم `has_role(... 'admin')` system-only ستُكمَّل بـ `OR can_edit(... 'project'/'company', ...)` عند الضرورة (إنشاء/حذف الدفعات، حذف التسويات).

### 2) تبسيط التبويبات إلى 5 رئيسية فقط (داخل `ProjectDetail.tsx`)

**الهيكل الحالي:** مجموعتان متداخلتان (5 مجموعات × مجموع 14 تبويب فرعي) — مربك خصوصاً على الجوال.

**الهيكل الجديد المُقترَح (مستوى واحد، 5 تبويبات):**

```text
┌──────────┬──────────┬──────────┬──────────┬──────────┐
│ نظرة عامة │ التخطيط  │  المالية  │  المتابعة │  الإدارة  │
└──────────┴──────────┴──────────┴──────────┴──────────┘
```

داخل كل تبويب يُستخدم **Accordion / Sub-sections عمودية** بدل تبويبات فرعية أفقية:

- **نظرة عامة:** ExecutiveSummary + AIExecutiveInsights.
- **التخطيط:** المراحل (Milestones) + الموارد (Resources) في أقسام قابلة للطيّ.
- **المالية:** الموازنة، خط الأساس، المصروفات، الدفعات (funds)، الالتزامات، العهد، الإيرادات، مستحقات الموارد — جميعاً كـ Accordion items مع شارات (badges) للعناصر المعلّقة.
- **المتابعة:** التحليلات (Charts) + ما-إذا.
- **الإدارة:** أوامر التغيير، المخاطر، السجل (للأدمن فقط).

**ميزات إضافية:**
- في الجوال (`<md`): شريط التبويبات يصبح **scrollable horizontally** مع snap، وحجم touch target ≥ 44px.
- حفظ آخر قسم مفتوح داخل كل تبويب في `searchParams` (`?tab=finance&section=expenses`).
- شارة (badge) على التبويب الرئيسي تجمع كل المعلّقات (مصروفات بانتظار الموافقة، أوامر تغيير، مخاطر عالية).

### 3) تحسين Mobile-First لكل النماذج المالية

نمط موحد لجميع النماذج (`ExpensesSection`, `CustodySection`, `FundsSection`, `RevenueSection`, `BudgetSection`, `CommitmentsSection`, `ResourcePayablesSection`, `BudgetAmendmentManager`):

**استبدال `Dialog` بـ `Sheet` (drawer من الأسفل) على الجوال:**
- استخدام `useIsMobile()` لاختيار `Sheet side="bottom"` بدل `Dialog` عند `isMobile === true`.
- الـ Sheet يأخذ `h-[92vh]` مع `overflow-y-auto` ومنطقة محتوى آمنة (safe-area).

**هيكل الحقول داخل النموذج (Mobile-first → Desktop):**
- شبكة عمود واحد افتراضياً، تتحول إلى عمودين فوق `md`.
- جميع `Input/Select/Textarea` بـ `h-12` (≥48px) على الجوال، خط 16px (لمنع تكبير iOS).
- Labels فوق الحقول دائماً (لا inline على الجوال).
- أزرار الإجراء في **شريط ثابت أسفل الشاشة** (`sticky bottom-0`) داخل الـ Sheet مع زر أساسي عريض.
- حقول العملة: `inputMode="decimal"` و عرض رمز العملة inside-input.
- التواريخ: `<input type="date">` أصلي على الجوال (يفتح picker النظام).
- اختيارات طويلة (Resource/Budget Item): `Combobox` مع بحث فوري بدل `Select` ثابت.

**جداول البيانات على الجوال:**
- استبدال الجدول الأفقي بـ **بطاقات (Card list)** على `<md`: كل صف يصبح بطاقة بـ 3 حقول رئيسية + قائمة "..." للإجراءات.
- إجراءات Swipe (يسار = حذف، يمين = تعديل) عبر مكتبة خفيفة أو long-press لقائمة سياق.
- شريط فلاتر يتحول إلى Sheet "فلاتر" بزر filter في الأعلى.

**زر FAB (Floating Action Button) "إضافة" داخل التبويب المالي على الجوال** — يظهر دائماً ويفتح القسم الصحيح (مصروف/عهدة/دفعة) بناءً على القسم النشط في الـ Accordion.

---

## التفاصيل التقنية

- لن يتم تعديل `src/integrations/supabase/client.ts` ولا `types.ts`.
- لن يتم تعديل `omarabdelhaamid@gmail.com` يدوياً في قاعدة البيانات — سيعمل تلقائياً بعد إصلاح المنطق.
- قد تُحدَّث 1-2 سياسات RLS عبر migration: `project_funds INSERT/DELETE` و `fund_settlements DELETE` لتسمح بـ company/project admin بدل system-admin فقط.
- ستُحدَّث ذاكرة `mem://auth/access-control` لتوثيق أن "ادمن الشركة" يحصل على صلاحيات ادمن داخل شركته فقط.
- تحديث `mem://project/tab-navigation` للهيكل الجديد (5 تبويبات + Accordion).
- تحديث `mem://ui/localization-and-rtl` بإرشادات mobile-first الموحَّدة.

## نقاط للتحقق بعد التنفيذ

1. تسجيل دخول كـ `omarabdelhaamid@gmail.com` وفتح مشروع داخل شركته → يجب رؤية أزرار الإضافة/الحذف/الموافقة.
2. تحجيم المعاينة إلى 393px → فتح "إضافة مصروف" → يجب أن يُفتح Sheet من الأسفل بحقول واضحة.
3. عدّ التبويبات الرئيسية = 5، والأقسام داخلها Accordion.
4. اختبار Viewer الحقيقي (دور viewer) يبقى للقراءة فقط.
