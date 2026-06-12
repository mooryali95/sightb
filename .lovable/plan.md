# تحليل UI كامل لمنصة "رؤية" — مراجعة خبير

## 1) الانطباع العام

المنصة غنية وظيفياً (لوحة تحكم، تفاصيل مشروع بـ24+ قسم، تقارير، RBAC، RTL، عربي). لكن من منظور تجربة المستخدم والتصميم البصري هناك **تضخم معرفي (Cognitive Overload)** واضح: كثافة بيانات عالية بدون تسلسل بصري صارم، تكرار للأنماط، وغياب لغة تصميم موحّدة بين الأقسام.

---

## 2) نقاط القوة

- التزام جيد بـ RTL والعربية والأرقام الإنجليزية + التقويم الميلادي.
- نظام Tokens دلالي (success/warning/destructive، health-good/warning/critical).
- بنية Slices منظمة في الـ Store، وتحميل من مرحلتين، و RBAC ناضج.
- وجود Smart Notifications, Global Search (Ctrl+K), Session Timeout, Audit Log.
- تغطية اختبارات Vitest 91/91.

---

## 3) المشاكل الجوهرية (مرتبة حسب الأولوية)

### A. الهيكل والمعمارية البصرية

1. **ProjectDetail = 924 سطر** و **24 قسم/تاب** في صفحة واحدة → كابوس تنقّل. لا توجد مجموعات منطقية (Finance / Schedule / People / Governance).
2. **AppLayout بدون Hero/Page-Header موحّد** — كل صفحة تخترع رأسها الخاص.
3. **Sidebar طويل وثابت** بدون Pin/Recents؛ السياق المالي اليومي للمستخدم غير مرئي من الـ Shell.
4. **Breadcrumb موجود لكن مخفي على الموبايل** ولا يحمل سياق الفلاتر/الفترة.

### B. التصميم البصري (Visual Design)

5. **Landing**: مركّب جامد، تباين معتدل، الـ Hero ضعيف الشخصية (Logo + H1 + 3 بطاقات متطابقة). لا توجد لحظة WOW.
6. **بطاقات المزايا متطابقة الوزن** → لا هرمية. يجب Bento أو Asymmetric.
7. **الذهبي #C9A84C** نادر الاستخدام؛ مهدور كـ accent. يحتاج Policy واضحة (CTA + Highlights فقط).
8. **Typography**: عنوان واحد كبير ثم body رمادي — بدون Display/Eyebrow/Caption. النصوص العربية تحتاج Font Pairing احترافي (مثل IBM Plex Sans Arabic + Tajawal Display).
9. **Density** متطرفة في الجداول (Dashboard/ProjectDetail) — لا Zebra، لا Sticky Header، لا Column Pinning، لا Density Toggle.
10. **Charts** متعددة المكتبات (Recharts) لكن بدون Theme موحّد، وبدون Empty/Loading/Error States متّسقة.

### C. سلوك التفاعل (Interaction)

11. **Tabs أفقية بدون Overflow Indicator** — على الموبايل تختفي تابات.
12. **عدم وجود Command Palette حقيقي** (Ctrl+K) متعدد الفئات: مشاريع، شركات، أوامر، تنقل، إنشاء سريع.
13. **Filters على الـ Dashboard** متفرقة (Drawer/Popover/Inline) بدون "Save View".
14. **Bulk actions** غير موجودة في الجداول (موافقات مصروفات، أرشفة).
15. **Drill-down** ضعيف؛ لا "Inspector Panel" جانبي للسجلات (يفتح Dialog يكسر السياق).

### D. الأداء المُدرَك (Perceived Performance)

16. كل البيانات تُحمّل دفعة عبر `loadAll` → First Paint بطيء على بيانات حقيقية.
17. **Skeletons** متوفرة في Dashboard فقط؛ غائبة في ProjectDetail والصفحات الفرعية.
18. لا Optimistic UI في الإضافات اليومية (المصروفات، الإيرادات، أوامر التغيير).

### E. الوصولية (a11y)

19. تباين الـ Muted على الخلفيات الفاتحة قريب من حدّ WCAG AA.
20. غياب `aria-live` للإشعارات الحيّة، و focus-trap ضعيف داخل بعض الـ Dialogs الكبيرة.
21. أحجام لمس على الموبايل أصغر من 44px في بعض الأزرار الأيقونية.

### F. RTL

22. بعض الأيقونات الاتجاهية (chevron, arrow) لا تنعكس تلقائياً.
23. Sparkline/Gantt: محور الزمن من اليسار لليمين — مخالف للقراءة العربية.

### G. النماذج (Forms)

24. حقول الأرقام بدون تنسيق فوري (Thousand Separator)، ولا Currency Adornment موحّد.
25. لا "Form Stepper" في New Project/New Portfolio رغم كثرة الحقول.
26. رسائل الخطأ عامة، بدون inline + summary.

### H. التصميم على الموبايل

27. التابات داخل ProjectDetail غير قابلة للاستخدام عملياً على 393px.
28. الجداول تتحول إلى Scroll أفقي بدون "Card View" بديل.
29. MobileFAB موجود لكن غير ذكي حسب السياق (يجب أن يقترح الإجراء الأنسب لكل صفحة).

---

## 4) خطة تحسين على 3 مراحل

### المرحلة 1 — Foundation & Quick Wins (أسبوع 1)

- توحيد **PageHeader** + **PageToolbar** + **SectionCard** كمكوّنات أساسية.
- إعادة تنظيم تابات ProjectDetail في **5 مجموعات**:
Executive · Financial · Schedule · People & Resources · Governance.
- إضافة **Density Toggle** + **Sticky Header** + **Zebra** للجداول الكبيرة.
- إضافة Skeletons لكل صفحة فرعية، و Optimistic UI لـ المصروفات.
- ضبط Tokens الذهبي: استخدامه فقط لـ Primary CTA + KPI Highlights.
- تحسين Landing: Hero عمودين (نص قوي + بصري Bento)، Eyebrow + Display + Sub.
- معالجة Contrast/Touch Targets/RTL Chevrons.

### المرحلة 2 — Information Architecture & Power Features (أسبوع 2-3)

- **Inspector Panel** جانبي (Slide-over) للسجلات بدل Dialogs الثقيلة.
- **Command Palette** متعدد الفئات (Cmd+K) مع Recents و Quick Create.
- **Saved Views** للفلاتر على الـ Dashboard + ProjectsTable + Expenses.
- **Bulk Actions** (Approve/Reject/Archive/Export) + Selection Toolbar.
- **Mobile Card View** بديل للجداول + FAB سياقي.
- **Smart Notifications v2** مع تجميع، فلترة، و read/unread state.
- **Charts Theme** موحّد + Empty/Loading/Error states قياسية.
- تحسين Gantt لـ RTL (محور من اليمين لليسار).

### المرحلة 3 — Design Language & WOW (أسبوع 4+)

- **Design System v2**:
  - Typography Scale (Display/H1/H2/Eyebrow/Body/Caption/Mono للأرقام).
  - Spacing 4-pt scale موحّد، Radius/Shadow tokens، Elevation system.
  - Motion tokens (durations/easings) + Framer presets.
- **Landing Redesign** باتجاه Editorial-Premium:
  - Hero Asymmetric + KPI ribbon حيّ + Bento Features + Trust strip.
- **Executive Summary v2** كـ Storytelling Dashboard (Hero KPI + Sparklines + Health Narrative + Top Risks + Cash Runway).
- **Empty States مرسومة** لكل قسم بشخصية بصرية واحدة.
- **A11y Audit** كامل (WCAG 2.2 AA) + Keyboard map موثّق.
- **Style Guide داخلي** صفحة `/design` لعرض المكوّنات والحالات.

---

## 5) قرارات تحتاج موافقتك قبل البدء

1. هل أبدأ بإعادة هيكلة **تابات ProjectDetail** (تأثير كبير، عالي القيمة) أم بـ **Landing Redesign** (تأثير تسويقي)؟
  نعم
2. هل تريد **Design System v2** الكامل (Typography + Tokens جديدة)، أم نحافظ على الـ Tokens الحالية ونحسّن الاستخدام فقط؟
  بناء بالكامل
3. هل نتبنى **Inspector Panel** كبديل افتراضي للـ Dialogs الكبيرة؟ (يغيّر سلوك ~15 شاشة)
  نعم 
4. أولوية الموبايل: **Card View للجداول** أم **إعادة تنظيم التابات** أولاً؟

اعادة التنظيم

بعد إجاباتك أحوّل المرحلة المختارة إلى خطة تنفيذية تفصيلية بملفات محددة وترتيب Commits.