
## التقييم الاحترافي (UI + UX)

بعد مراجعة الكود الفعلي (`ProjectDetail.tsx`, `Dashboard.tsx`, `AppLayout.tsx`, `AppSidebar.tsx`, `index.css`)، ما يلي ملخّص نقاط الضعف المؤثّرة فعلياً، مرتّبة حسب الأثر، يليها الخطة.

---

### تقييم تجربة المستخدم (UX) — 30 سنة خبرة

| # | المشكلة | الأثر |
|---|---------|------|
| 1 | **التبويبات لا تزال مزدوجة فعلياً**: 5 مجموعات + 14 تبويب فرعي أفقي. الخطة السابقة لم تُطبَّق كما يجب — لا يوجد Accordion داخل التبويب المالي، الفرعية لا تزال أفقية. | حِمل إدراكي عالٍ، تشتّت |
| 2 | **عدم وجود Information Scent**: لا توجد شارات (badges) فعلية على التبويبات الرئيسية تُظهر "ماذا يحتاج انتباهي" (مصروفات معلّقة، تجاوز موازنة، مخاطر مفتوحة). | المستخدم لا يعرف أين يذهب |
| 3 | **رأس الصفحة مزدحم**: اسم + شارة + breadcrumb + ميتا + 5 أزرار أيقونية + Select حالة، كلها في شريط واحد. على الجوال تتكسّر بفوضى. | فقدان التسلسل البصري |
| 4 | **عدم اتّساق نقاط الإجراء**: زر "إضافة" داخل كل قسم بنمط مختلف (أحياناً Dialog، أحياناً Sheet، الأحجام مختلفة، مكان الزر غير ثابت). | افتقار للقابلية للتنبؤ |
| 5 | **Sidebar شجرة عميقة**: شركات → محافظ → مشاريع — قابلة للتمدد بلا حدود. لا يوجد "العناصر الأخيرة" أو "المثبّت" أو بحث inline. | بطء في التنقّل اليومي |
| 6 | **Empty States ضعيفة**: "لا توجد بيانات" نص خام بدون CTA يُرشد لما يجب فعله. | إحباط للمستخدم الجديد |
| 7 | **Feedback متأخّر**: العمليات الكتابية تستخدم toast فقط، بدون optimistic update واضح أو حالات Loading/Saved/Error inline داخل النموذج. | يبدو التطبيق "بطيء" |
| 8 | **Mobile gaps**: رغم تحسين نموذج المصروفات، باقي النماذج (Custody, Revenue, Funds, Commitments, Budget) لا تزال Dialog ضيّق على الجوال؛ الجداول لا تزال تتمدّد أفقياً. | غير صالح للاستخدام الميداني |
| 9 | **Discoverability منخفض**: Ctrl+K موجود لكن غير مُعلَن؛ لا يوجد onboarding خفيف لأول مشروع/أول مصروف. | الميزات المتقدّمة "مدفونة" |
| 10 | **Cognitive Overload في رأس المشروع**: 8+ بطاقات إحصائية + EVM + Health + Burn rate في طيّ واحد قبل أن يفهم المستخدم السياق. | شلل قراءة |

---

### تقييم الواجهة البصرية (UI) — 35 سنة خبرة

| # | المشكلة | الأثر |
|---|---------|------|
| 1 | **التسلسل الطباعي مكسور**: H1 المشروع `text-base md:text-xl` فقط (16/20px) — صغير جداً لصفحة مشروع كاملة؛ بينما `stat-value-hero` ضخم. الهرمية معكوسة. | المشروع لا "يقود" الصفحة |
| 2 | **الرأس يستخدم `from-emerald-500/10` صراحة** بدل توكن دلالي — يكسر ال design system وقاعدة الـ tokens. | تنافر بصري + صعوبة تطوير |
| 3 | **اللون الأساسي Navy + الذهبي**: تنفيذ جيد لكن **يُساء استخدامه** — Health Score يستخدم `text-emerald-600`/`text-amber-600`/`text-red-600` مباشرة (Tailwind raw colors)، يكسر التوحيد ويفشل في dark mode. | Inconsistency |
| 4 | **Shadow & elevation غير منظَّمة**: `shadow-card`, `shadow-elevated`, `shadow-gold` معرَّفة لكن نادراً ما تُستخدم؛ معظم البطاقات بـ `border` فقط — تبدو "مسطّحة بلا عمق". | فقر في العمق |
| 5 | **Density غير متّزنة**: `p-6` ثابت في AppLayout، بينما البطاقات بداخلها `p-4`، والجداول `py-3`. لا يوجد "rhythm" واضح. | عدم انسجام |
| 6 | **خط واحد لكل شيء** (Noto Kufi Arabic): جيد للعربية لكن للأرقام يستخدم JetBrains Mono — التباين بين الخطّين حاد بدون pairing مدروس. | تشويش بصري |
| 7 | **Border radius مختلطة**: `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-full` بدون قاعدة. | شخصية مرئية مهتزّة |
| 8 | **Focus states ضعيفة**: `--ring` ذهبي معرَّف لكن غير مرئي بوضوح على Inputs/Buttons. سيئ للوصول وللمستخدم الخبير المعتمد على لوحة المفاتيح. | فشل WCAG |
| 9 | **Motion بدون نظام**: `framer-motion` يُستخدم بشكل عشوائي (fade+y على بعض الصفحات فقط)، لا يوجد توقيت/easing موحَّد. | يبدو "هواة" |
| 10 | **الأيقونات لا تتبع نظاماً**: lucide بأحجام مختلفة (`w-3 w-4 w-5 w-6`) في نفس السياق. | عدم انضباط |

---

## الخطة المقترحة (3 موجات)

### الموجة 1 — Information Architecture & رأس المشروع (أعلى أثر)

1. **تنفيذ فعلي لتبسيط التبويبات**:
   - إزالة `tabGroups + subTabs` المتداخلة من `ProjectDetail.tsx`.
   - 5 تبويبات مستوى واحد فقط: نظرة عامة | التخطيط | المالية | المتابعة | الإدارة.
   - داخل المالية + التخطيط + الإدارة: استخدام `Accordion` (موجود في المشروع) بأقسام قابلة للطيّ مع حفظ آخر قسم مفتوح في URL.

2. **شارات ذكية على التبويبات الرئيسية** (Information Scent):
   - "المالية" → عدد المصروفات المعلّقة + عدد البنود التي تجاوزت 90% من الموازنة.
   - "الإدارة" → أوامر تغيير معلّقة + مخاطر عالية مفتوحة.
   - "التخطيط" → معالم متأخّرة.
   - شارة بلون دلالي (`warning`/`destructive`) لا أرقام عشوائية.

3. **رأس مشروع جديد بهرمية صحيحة**:
   - الصف 1: Breadcrumb فقط (نظيف).
   - الصف 2: H1 بحجم `text-2xl md:text-3xl` + Badge حالة + قائمة ⋯ واحدة لكل الإجراءات (Edit/Status/Archive/Export) بدل 5 أيقونات.
   - الصف 3: شريط "Health pill" واحد مدمج: `Health • CPI • SPI • Burn` بسطر أفقي مع tooltip لكل قيمة.

### الموجة 2 — Design System Hardening (UI)

4. **توكنات Health/Status موحّدة** في `index.css`:
   - استبدال raw colors (`text-emerald-600`) بـ `text-success`, `text-warning`, `text-destructive`.
   - إضافة فئات `.health-good`, `.health-warning`, `.health-critical` تستخدم التوكنات + opacity 12% للخلفيات.

5. **سلّم Typography منضبط**:
   - H1: 28-30px، H2: 22px، H3: 18px، body: 14-15px، caption: 12px.
   - فرض رقمي tabular-nums على كل المالي.
   - إضافة كلاس `.heading-display` للأرقام البطولية فقط (Hero stats).

6. **سلّم Elevation**:
   - 3 مستويات فقط: `flat` (border-only)، `raised` (shadow-card)، `floating` (shadow-elevated).
   - تطبيق raised على جميع stat cards و dashboard widgets، floating على Sheets/Dialogs/Popovers.

7. **Focus & Motion موحَّدة**:
   - `--ring` مرئي بوضوح (offset-2 + ring-2) على كل تفاعل لوحة مفاتيح.
   - `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)`، مدد قياسية 150/250/400ms، تطبيق ثابت عبر framer-motion.

8. **Border radius**: قاعدة واحدة — inputs/buttons `rounded-lg`, cards/dialogs `rounded-xl`, badges/pills `rounded-full`. حذف `rounded-md` المختلطة.

### الموجة 3 — Mobile-First اكتمال + Polish

9. **توسيع `ResponsiveFormDialog`** لكل النماذج المالية المتبقية: `CustodySection`, `RevenueSection`, `FundsSection`, `CommitmentsSection`, `BudgetAmendmentManager`, `BudgetSection`. نفس النمط المُطبَّق بالفعل على المصروفات.

10. **جداول → بطاقات على الجوال**: مكوّن مشترك `ResponsiveDataTable` يعرض `<table>` فوق `md` و `Card list` تحته، مع زرّ إجراءات `⋯` لكل بطاقة.

11. **FAB موحَّد** في صفحة المشروع على الجوال (موضع ثابت أسفل-يسار) يفتح "إضافة سريعة": مصروف / عهدة / دفعة، بناءً على آخر قسم نشط.

12. **Empty states موجَّهة** (component جديد `<EmptyState icon title description action />`) لاستخدامه في كل القوائم الفارغة مع CTA واضح.

13. **Sidebar تحسينات**:
    - بحث inline في أعلى الـ sidebar يُصفّي الشركات/المشاريع فورياً.
    - قسم "الأخيرة" (آخر 3 مشاريع زيارة، مخزّنة في localStorage).
    - تلميحة لطيفة `Ctrl+K` بجانب البحث.

14. **Onboarding خفيف** لأول استخدام: 3 خطوات فقط (إنشاء شركة → مشروع → موازنة) عبر `Popover` تتبع المؤشّر، يمكن تخطّيه.

---

## الملفات المتأثرة

```text
src/index.css                                    (توكنات health, motion, ease, type scale)
src/components/AppLayout.tsx                     (rhythm + density)
src/components/AppSidebar.tsx                    (بحث inline + recent + Ctrl+K hint)
src/pages/ProjectDetail.tsx                      (header + tabs flat + accordions + smart badges)
src/components/ResponsiveFormDialog.tsx          (موجود — توسيع استخدامه)
src/components/EmptyState.tsx                    (جديد)
src/components/ResponsiveDataTable.tsx           (جديد)
src/components/project/{Custody,Revenue,Funds,
  Commitments,Budget,BudgetAmendmentManager}.tsx (هجرة لنفس النمط الموبيلي)
src/components/project/ExecutiveSummary.tsx      (تقليل البطاقات + Health Pill)
```

لا تغييرات في قاعدة البيانات. لا تغييرات في منطق الأعمال. كل العمل في طبقة العرض.

---

## مخرجات التحقق بعد التنفيذ

1. عدّ التبويبات الرئيسية في صفحة المشروع = 5، بلا تبويبات فرعية أفقية.
2. شارات على التبويبات تُظهر العناصر التي تحتاج انتباه.
3. رأس المشروع: H1 ≥ 28px، Breadcrumb منفصل، إجراءات في قائمة `⋯` واحدة.
4. كل النماذج المالية على الجوال (393px) تُفتح كـ Sheet من الأسفل بنفس النمط.
5. كل الجداول على `<md` تتحوّل إلى بطاقات.
6. كل ألوان الحالة تستخدم توكنات (success/warning/destructive)، صفر raw Tailwind colors.
7. Focus ring مرئي وواضح على كل عنصر تفاعلي.
8. Empty states كلها تحتوي على CTA.
