# خطة: إصلاح مشكلة الإغلاق + الموجة الرابعة

## أولاً: تشخيص مشكلة "لا أستطيع إغلاق النموذج" على الموبايل

**السبب الجذري** (بعد فحص `Sheet` + `ResponsiveFormDialog`):

1. زر الإغلاق `X` موروث من `SheetContent` بحجم صغير جداً (`h-4 w-4`) ومُموضع بـ `absolute right-4 top-4`. في وضع RTL يظهر بصرياً على اليسار، ويتداخل مع منطقة العنوان، وأحياناً يختفي خلفه أو يكون target صغيراً جداً للمس (أصغر من 44px Apple HIG).
2. ارتفاع الـ Sheet `h-[92vh]` يترك مساحة overlay صغيرة جداً (8vh) للضغط خارجه، وغالباً تكون مغطاة بشريط المتصفح.
3. لا يوجد زر **"إلغاء"** صريح في الـ footer — كل النماذج فيها فقط زر "حفظ" واحد، فلا يجد المستخدم مخرجاً واضحاً.
4. عند فتح Select داخل Sheet، يفتح في portal منفصل وقد يحجب زر الإغلاق.

## الإصلاحات (مشتركة لكل النماذج)

### 1) تحسين `ResponsiveFormDialog`
- إضافة **drag-handle** علوي (شريط رمادي 36×4px) كإشارة بصرية للسحب.
- إخفاء زر `X` الافتراضي من Sheet (CSS) واستبداله بزر إغلاق كبير (44×44) في الـ header، يسار العنوان في RTL، مع `aria-label="إغلاق"`.
- جعل الـ overlay قابل للضغط للإغلاق (موجود افتراضياً في Radix لكن نتأكد من عدم تعطيله).
- تقليل الارتفاع إلى `h-[90vh]` وإضافة `max-h-[90dvh]` لاحترام شريط المتصفح.
- في الـ footer: فرض زرّين (إلغاء + حفظ) كقالب موحّد عبر prop جديد `secondaryAction`.

### 2) تحديث جميع النماذج الثمانية
كل قسم يمرر الآن:
```
footer={<PrimarySecondary onCancel={...} primaryLabel="حفظ" />}
```
لضمان وجود مخرج آمن دائماً.

### 3) دعم زر "Back" في الموبايل
ربط `history.pushState` عند فتح Sheet للسماح بزر "رجوع" في المتصفح بإغلاقه (تجربة native-app).

---

## ثانياً: الموجة الرابعة — جداول متجاوبة + حالات فارغة + تنظيف نهائي

### 4) `ResponsiveDataTable` جديد
- **Desktop ≥768px**: `<Table>` كلاسيكي مع أعمدة قابلة للفرز.
- **Mobile <768px**: قائمة `Card` عمودية، كل بطاقة تعرض الحقل الأساسي + شارة الحالة + قائمة `⋯` للإجراءات.
- Props: `columns`, `data`, `mobileCard(row)`, `actions(row)`, `emptyState`, `onRowClick`.

### 5) تطبيق `ResponsiveDataTable` على
`ExpensesSection`, `RevenueSection`, `CommitmentsSection`, `ChangeOrdersSection`, `MilestonesSection`, `RisksSection`, `CustodySection`, `BudgetSection`.

### 6) `EmptyState` شامل
استبدال كل نصوص "لا توجد بيانات" بمكوّن `EmptyState` مع أيقونة + CTA يفتح نفس نموذج الإضافة.

### 7) تنظيف ألوان Tailwind المتبقية
مسح `text-emerald-*`, `bg-amber-*`, `text-red-500` من بقية الملفات (Dashboard, Portfolio, Reports) واستبدالها بـ `health-good/warning/critical`.

---

## ثالثاً: تحليل UI شامل لكل الصفحات (تقرير + إصلاحات سريعة)

سأنفذ مسحاً يدوياً على المسارات التالية وأطبّق إصلاحات سريعة في نفس الجولة:

| الصفحة | المشاكل المرصودة (مبدئياً) | الإصلاح |
|---|---|---|
| `/welcome` (Landing) | CTA غير واضح على الموبايل | تكبير الزر + sticky bottom |
| `/dashboard` | جداول أفقية تفيض على الموبايل | تطبيق `ResponsiveDataTable` |
| `/projects/:id` | TabBar أفقي قد يتقطع | scroll-snap + مؤشر تبويب نشط أوضح |
| `/portfolio/:id` | كروت مشاريع متراصة بدون تنفس | grid responsive + spacing |
| `/companies/:id` | header مزدحم | دمج الإجراءات في dropdown |
| `/users` | جدول صلاحيات صعب على الموبايل | بطاقات + filter chips |
| `/audit-log` | صفوف طويلة | truncate + expandable |
| `/login` و `/reset` | حقول صغيرة | `h-12` + `inputMode` مناسب |

سأقدم في النهاية **مصفوفة تقدّم نهائية** (Markdown) تظهر:
- ما اكتمل ✅
- ما يحتاج جولة لاحقة ⏳
- توصيات معمارية للمستقبل 💡

---

## ملفات ستُعدَّل/تُنشأ
- **جديد**: `src/components/ResponsiveDataTable.tsx`, `src/components/FormFooter.tsx`
- **تعديل**: `src/components/ResponsiveFormDialog.tsx` (drag handle + close + dvh + back-button)
- **تعديل**: 8 ملفات `*Section.tsx` (footer موحّد + جدول متجاوب + EmptyState)
- **تعديل**: صفحات `Dashboard`, `PortfolioDetail`, `CompanyDetail`, `UserManagement`, `Login`, `Landing`
- **توثيق**: `.lovable/plan.md` يحتوي تقرير UI الشامل والمصفوفة النهائية

## ملاحظات
- لا تغييرات على قاعدة البيانات أو RLS أو منطق العمل — فقط UI/UX/A11y.
- نلتزم بالـ design tokens والـ semantic colors. لا ألوان Tailwind خام جديدة.
- نحافظ على RTL والأرقام الإنجليزية.
