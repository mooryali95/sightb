# خطة مراجعة وتصحيح الأخطاء — 3 مراحل

## الوضع الحالي (المسح الشامل)

| المصدر | النتيجة |
|---|---|
| Runtime Errors | لا توجد أخطاء وقت التشغيل |
| Console Logs | تحذير واحد: `fetchPriority` على `<img>` في `Landing.tsx:64` |
| Vitest (91 اختبار) | جميعها تنجح ✅ |
| Security Scans (Wiz / Supabase / Connector / Agent) | لا توجد ثغرات مفتوحة ✅ |
| Supabase Linter | 76 تحذير من نوعين فقط: <br>• 38× `0028_anon_security_definer_function_executable` <br>• 38× `0029_authenticated_security_definer_function_executable` |

كل تحذيرات Linter من فئة **SECURITY DEFINER functions قابلة للتنفيذ من العموم/المسجّلين** — كل دوال `public.*` التي تستخدم `SECURITY DEFINER` (مثل `has_role`, `is_admin`, مساعدات RBAC، triggers helpers) ممنوحة `EXECUTE` افتراضياً لكل من `anon` و `authenticated`.

---

## التصنيف

### 1) أخطاء الكود (Code)
- **C1**: تحذير React: `fetchPriority` بصيغة camelCase على عنصر DOM في `src/pages/Landing.tsx` (صورة الـ hero). يجب أن يكون `fetchpriority` lowercase (أو استخدام `loading="eager"` فقط).

### 2) أخطاء تقنية / أمنية (Technical & Security)
- **T1**: 76 تحذير Supabase Linter — `SECURITY DEFINER` بدون `REVOKE EXECUTE FROM PUBLIC`.
  - يجب على كل دالة في `public` أن تُصنَّف:
    - دوال يستدعيها العميل عبر RPC (مثل `has_role` إن استُخدمت من العميل) → تبقى لكن مع `REVOKE FROM PUBLIC, anon` ومنح `EXECUTE` لـ `authenticated` فقط.
    - دوال داخلية (triggers helpers، audit helpers، email enqueue) → `REVOKE EXECUTE FROM PUBLIC, anon, authenticated` ومنح `service_role` فقط.

### 3) الهيكل (Structure)
- لا توجد مشاكل هيكلية في الكود (لا أخطاء build، لا اختبارات فاشلة، لا runtime errors).
- نقطة مراجعة فقط: تأكيد عدم وجود دوال SECURITY DEFINER قديمة غير مستخدمة (orphans) يمكن حذفها بدل تعديل صلاحياتها.

### 4) البيانات (Data)
- لا توجد جداول بدون RLS، ولا policies مفتوحة، ولا أعمدة حساسة مكشوفة (Security scan نظيف).
- لا تغييرات schema مطلوبة.

### 5) الإدارة (Management / Ops)
- تحديث ملف `@security-memory` ليُوثِّق سياسة الـ EXECUTE الجديدة، حتى لا تعاد المشكلة في migrations لاحقة.
- إضافة قاعدة في `mem://` (Core) تُلزم كل `CREATE FUNCTION ... SECURITY DEFINER` بـ `REVOKE EXECUTE FROM PUBLIC` ومنح صريح للأدوار المطلوبة فقط.

---

## المراحل الثلاث

### 🔹 المرحلة 1 — إصلاحات سريعة (Code + Quick Wins)
**الهدف**: تنظيف Console وتحديث التوثيق. لا تغييرات DB.

1. **C1**: تصحيح `fetchPriority` → `fetchpriority` في `src/pages/Landing.tsx:64` (أو إزالتها والاكتفاء بـ `loading="eager"`).
2. فحص أي تحذيرات camelCase مشابهة في باقي الصفحات (`grep -r fetchPriority src/`).
3. تشغيل `bunx vitest run` للتأكد من بقاء 91/91 ✅.

**الناتج**: console نظيف، لا regressions.

---

### 🔹 المرحلة 2 — تصلب الأمان (Technical / DB Security)
**الهدف**: إغلاق 76 تحذير Linter بدون كسر التطبيق.

1. استعلام كل دوال `public` ذات `SECURITY DEFINER`:
   ```sql
   SELECT p.proname, pg_get_function_identity_arguments(p.oid)
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.prosecdef=true;
   ```
2. تصنيف كل دالة (مَن يستدعيها فعلياً: client RPC؟ trigger داخلي؟ edge function؟).
3. Migration واحدة:
   - `REVOKE EXECUTE ON FUNCTION public.<fn>(...) FROM PUBLIC, anon, authenticated;`
   - `GRANT EXECUTE ON FUNCTION public.<fn>(...) TO <only-needed-roles>;`
   - مثال: `has_role` → `GRANT EXECUTE ... TO authenticated;`
   - مثال: helpers الـ triggers و enqueue_email → `GRANT EXECUTE ... TO service_role;` فقط.
4. إعادة تشغيل `supabase--linter` للتأكد أن العدد = 0.
5. اختبار يدوي في الواجهة: تسجيل دخول، تحميل dashboard، تنفيذ عملية كتابة (expense) للتحقق من عدم كسر RBAC.

**الناتج**: 0 تحذيرات Linter، RBAC يعمل كما هو.

---

### 🔹 المرحلة 3 — الحَوكمة والتوثيق (Management)
**الهدف**: منع تكرار المشاكل في migrations مستقبلية.

1. تحديث `@security-memory` بسياسة:
   > كل `CREATE FUNCTION ... SECURITY DEFINER` في schema `public` يجب أن يتبعه فوراً `REVOKE EXECUTE FROM PUBLIC` ثم `GRANT EXECUTE` صريح للأدوار المطلوبة فقط (`authenticated` أو `service_role`).
2. إضافة قاعدة Core في `mem://index.md` بنفس المضمون.
3. تحديث `.lovable/plan.md` بسجل ما تم في المراحل 1+2.
4. (اختياري) إضافة سكربت فحص بسيط في `scripts/` يقرأ الـ migrations الأخيرة ويُحذِّر إذا وجد `SECURITY DEFINER` بدون `REVOKE`.

**الناتج**: ذاكرة محدّثة + توثيق + (اختيارياً) حارس استباقي.

---

## ملاحظات

- لا توجد أخطاء runtime، ولا اختبارات فاشلة، ولا ثغرات في security scans — هذه الخطة وقائية بالأساس + إصلاح تحذير واحد UI + إغلاق تحذيرات Linter.
- لن تُلمس ملفات Supabase auto-gen (`client.ts`, `types.ts`, `.env`).
- لن تُعدَّل أي policies RLS قائمة — فقط صلاحيات `EXECUTE` على الدوال.
- بعد موافقتك سأبدأ بالمرحلة 1، وأنتظر تأكيدك قبل الانتقال للمرحلة 2.
