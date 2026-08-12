-- =====================================================================
-- P0-01 — توحيد ترميز العملة على ISO 4217
-- =====================================================================
--
-- الغرض: العملة اليوم نصّ حر قيمته الافتراضية رمز العرض 'ر.س' لا رمز
-- ISO. هذا يمنع أي فحص آلي للخلط بين العملات، ويجعل المقارنة بين
-- المشاريع مستحيلة برمجياً.
--
-- القرار: تطبيع إلى ISO 4217 + قيد CHECK. **بلا تحويل بأسعار صرف.**
-- معيار IAS 21 يشترط سعر التاريخ عند الإثبات الأولي وسعر الإقفال
-- للبنود النقدية وترحيل الفروق إلى الدخل؛ جدول أسعار مبسّط يُنتج
-- أرقاماً لا تجتاز تدقيقاً. الجمع عبر عملات مختلفة يُمنع في الواجهة
-- ويُعرض مفصولاً لكل عملة بدل تحويله صامتاً.
--
-- الجداول المتأثرة: public.projects · public.payment_requests
--
-- ⚠️  نفّذ كل خطوة على حدة. لا تنتقل للخطوة 1 قبل قراءة نتيجة الخطوة 0.
--
-- ملاحظة على الصياغة: كل عبارة مكتفية بذاتها وتحمل خريطة التحويل
-- داخلها. النسخة الأولى استعملت دالة في pg_temp فسقطت بخطأ
-- «schema pg_temp does not exist» — محرّر Supabase قد يوزّع العبارات
-- على اتصالات مجمّعة، فلا يعيش أي كائن مؤقت بينها. لا حالة مشتركة هنا.
-- =====================================================================


-- ─────────────────────────────────────────────────────────────────────
-- الخطوة 0 — فحص فقط (لا تُعدِّل شيئاً). شغّلها أولاً واقرأ النتيجة.
-- ─────────────────────────────────────────────────────────────────────
-- إن ظهرت أي قيمة غير 'ر.س' فأبلغني بها قبل المتابعة: الخطوة 1
-- مكتوبة لترفض ما لا تعرفه بدل أن تخمّنه.

SELECT 'projects' AS table_name, currency, count(*) AS rows
FROM public.projects GROUP BY currency
UNION ALL
SELECT 'payment_requests', currency, count(*)
FROM public.payment_requests GROUP BY currency
ORDER BY table_name, rows DESC;


-- ─────────────────────────────────────────────────────────────────────
-- الخطوة 1 — التحقق من أن كل قيمة معروفة. شغّلها وحدها.
-- ─────────────────────────────────────────────────────────────────────
-- ترفع خطأً صريحاً وتتوقف إن وُجدت قيمة خارج الخريطة. أفضل من تخمين
-- خاطئ يمرّ صامتاً.

DO $$
DECLARE
  _bad text;
BEGIN
  WITH map(raw, iso) AS (
    VALUES
      ('SAR','SAR'), ('ر.س','SAR'), ('ر.س.','SAR'), ('ريال','SAR'),
      ('ريال سعودي','SAR'), ('SR','SAR'), ('﷼','SAR'), ('','SAR'),
      ('USD','USD'), ('$','USD'), ('دولار','USD'),
      ('EUR','EUR'), ('€','EUR'), ('يورو','EUR'),
      ('GBP','GBP'), ('£','GBP'),
      ('AED','AED'), ('د.إ','AED'), ('درهم','AED'),
      ('KWD','KWD'), ('د.ك','KWD'),
      ('BHD','BHD'), ('د.ب','BHD'),
      ('QAR','QAR'), ('ر.ق','QAR'),
      ('OMR','OMR'), ('ر.ع','OMR'),
      ('JOD','JOD'), ('د.أ','JOD'),
      ('EGP','EGP'), ('ج.م','EGP')
  ),
  present(c) AS (
    SELECT currency FROM public.projects
    UNION
    SELECT currency FROM public.payment_requests
  )
  SELECT string_agg(DISTINCT quote_literal(p.c), ', ')
    INTO _bad
    FROM present p
   WHERE NOT EXISTS (
     SELECT 1 FROM map m WHERE upper(btrim(p.c)) = upper(m.raw)
   );

  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION
      'قيم عملة غير معروفة: %. أضفها إلى خريطة VALUES في الخطوتين 1 و2 ثم أعد التنفيذ.', _bad;
  END IF;

  RAISE NOTICE 'كل قيم العملة معروفة — يمكن المتابعة إلى الخطوة 2.';
END;
$$;


-- ─────────────────────────────────────────────────────────────────────
-- الخطوة 2 — الترحيل. معاملة واحدة: تنجح كاملة أو تتراجع كاملة.
-- ─────────────────────────────────────────────────────────────────────
--
-- لماذا تبدأ بتعريف الهوية:
--
-- على الجدولين مُشغِّلا تدقيق — trg_audit_projects وtrg_audit_payreq —
-- يقرآن auth.uid() ويكتبانها في system_audit_log.user_id المُعرَّف
-- NOT NULL. ومحرّر Supabase يعمل بلا مستخدم مُصادَق، فترجع NULL ويفشل
-- التحديث بـ:
--
--   ERROR: 23502: null value in column "user_id" of relation
--          "system_audit_log" violates not-null constraint
--
-- الحل السهل تعطيل المُشغِّلات (session_replication_role = replica).
-- مرفوض عمداً: تغيير جماعي لعملة كل المشاريع في نظام مالي بلا أثر
-- يقول من فعله ومتى هو بالضبط ما يرفعه المدقق كملاحظة — والمفارقة أن
-- نُعطّل نظام تدقيق مبنيّ بعناية لنُمرّر تعديلاً مالياً.
--
-- بدلاً من ذلك تُعرَّف الجلسة بهوية مالك النظام، فيُسجَّل الترحيل باسمه
-- في system_audit_log كأي تعديل آخر. الإعداد transaction-local
-- (المعامل الثالث = true)، فينتهي أثره بانتهاء المعاملة.

BEGIN;

-- 0/3 · عرّف الجلسة بمالك النظام حتى تعمل مُشغِّلات التدقيق.
DO $$
DECLARE
  _uid uuid;
BEGIN
  -- المقارنة نصية لا بتحويل enum: 'owner' أُضيفت إلى app_role في هجرة
  -- لاحقة، فلو لم تكن مطبَّقة على هذه القاعدة لفشل التحويل بخطأ
  -- «invalid input value for enum». المقارنة النصية تتجاوز ذلك.
  SELECT user_id INTO _uid
    FROM public.user_roles
   WHERE scope_type::text = 'system'
     AND role::text IN ('owner', 'admin')
   ORDER BY (role::text = 'owner') DESC, created_at
   LIMIT 1;

  IF _uid IS NULL THEN
    RAISE EXCEPTION
      'لا يوجد مالك ولا مدير نظام في user_roles — لا يمكن نسب الترحيل إلى أحد.';
  END IF;

  -- auth.uid() تقرأ من أيّ من الإعدادين حسب نسخة Supabase؛ يُضبطان معاً.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid)::text, true);
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true);

  RAISE NOTICE 'سيُسجَّل الترحيل في سجل التدقيق باسم: %', _uid;
END;
$$;

-- 1/3 · تطبيع projects
WITH map(raw, iso) AS (
  VALUES
    ('SAR','SAR'), ('ر.س','SAR'), ('ر.س.','SAR'), ('ريال','SAR'),
    ('ريال سعودي','SAR'), ('SR','SAR'), ('﷼','SAR'), ('','SAR'),
    ('USD','USD'), ('$','USD'), ('دولار','USD'),
    ('EUR','EUR'), ('€','EUR'), ('يورو','EUR'),
    ('GBP','GBP'), ('£','GBP'),
    ('AED','AED'), ('د.إ','AED'), ('درهم','AED'),
    ('KWD','KWD'), ('د.ك','KWD'),
    ('BHD','BHD'), ('د.ب','BHD'),
    ('QAR','QAR'), ('ر.ق','QAR'),
    ('OMR','OMR'), ('ر.ع','OMR'),
    ('JOD','JOD'), ('د.أ','JOD'),
    ('EGP','EGP'), ('ج.م','EGP')
)
UPDATE public.projects p
   SET currency = m.iso
  FROM map m
 WHERE upper(btrim(p.currency)) = upper(m.raw)
   AND p.currency IS DISTINCT FROM m.iso;

-- 2/3 · تطبيع payment_requests
WITH map(raw, iso) AS (
  VALUES
    ('SAR','SAR'), ('ر.س','SAR'), ('ر.س.','SAR'), ('ريال','SAR'),
    ('ريال سعودي','SAR'), ('SR','SAR'), ('﷼','SAR'), ('','SAR'),
    ('USD','USD'), ('$','USD'), ('دولار','USD'),
    ('EUR','EUR'), ('€','EUR'), ('يورو','EUR'),
    ('GBP','GBP'), ('£','GBP'),
    ('AED','AED'), ('د.إ','AED'), ('درهم','AED'),
    ('KWD','KWD'), ('د.ك','KWD'),
    ('BHD','BHD'), ('د.ب','BHD'),
    ('QAR','QAR'), ('ر.ق','QAR'),
    ('OMR','OMR'), ('ر.ع','OMR'),
    ('JOD','JOD'), ('د.أ','JOD'),
    ('EGP','EGP'), ('ج.م','EGP')
)
UPDATE public.payment_requests pr
   SET currency = m.iso
  FROM map m
 WHERE upper(btrim(pr.currency)) = upper(m.raw)
   AND pr.currency IS DISTINCT FROM m.iso;

-- 3/3 · الافتراضي الجديد + قيد يمنع عودة النص الحر
ALTER TABLE public.projects         ALTER COLUMN currency SET DEFAULT 'SAR';
ALTER TABLE public.payment_requests ALTER COLUMN currency SET DEFAULT 'SAR';

ALTER TABLE public.projects         DROP CONSTRAINT IF EXISTS projects_currency_iso4217;
ALTER TABLE public.payment_requests DROP CONSTRAINT IF EXISTS payment_requests_currency_iso4217;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_currency_iso4217
  CHECK (currency IN ('SAR','USD','EUR','GBP','AED','KWD','BHD','QAR','OMR','JOD','EGP'));

ALTER TABLE public.payment_requests
  ADD CONSTRAINT payment_requests_currency_iso4217
  CHECK (currency IN ('SAR','USD','EUR','GBP','AED','KWD','BHD','QAR','OMR','JOD','EGP'));

COMMIT;


-- ─────────────────────────────────────────────────────────────────────
-- الخطوة 3 — تحقق. المتوقع: كل الصفوف بـ'SAR'، والقيدان موجودان.
-- ─────────────────────────────────────────────────────────────────────

SELECT 'projects' AS table_name, currency, count(*) AS rows
FROM public.projects GROUP BY currency
UNION ALL
SELECT 'payment_requests', currency, count(*)
FROM public.payment_requests GROUP BY currency
ORDER BY table_name;

SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conname LIKE '%currency_iso4217%'
ORDER BY table_name;

-- دليل أن القيد يعمل: هذا يجب أن يفشل. ألغِ التعليق لتجربته ثم أعده.
-- UPDATE public.projects SET currency = 'ر.س' WHERE id = (SELECT id FROM public.projects LIMIT 1);

-- أثر الترحيل في سجل التدقيق — يجب أن تظهر صفوف باسم مالك النظام.
SELECT user_email, action, entity_type, count(*) AS rows, max(created_at) AS at
FROM public.system_audit_log
WHERE created_at > now() - interval '10 minutes'
GROUP BY user_email, action, entity_type
ORDER BY at DESC;


-- ─────────────────────────────────────────────────────────────────────
-- التراجع — إن لزم. يُعيد النص الحر والافتراضي القديم.
-- ملاحظة: لا يُعيد رموز العرض إلى الصفوف؛ الواجهة تتعامل مع 'SAR'
-- بلا مشكلة، ورمز العرض يُشتق منها عند العرض (src/lib/currency.ts).
-- ─────────────────────────────────────────────────────────────────────
/*
BEGIN;
ALTER TABLE public.projects         DROP CONSTRAINT IF EXISTS projects_currency_iso4217;
ALTER TABLE public.payment_requests DROP CONSTRAINT IF EXISTS payment_requests_currency_iso4217;
ALTER TABLE public.projects         ALTER COLUMN currency SET DEFAULT 'ر.س';
ALTER TABLE public.payment_requests ALTER COLUMN currency SET DEFAULT 'ر.س';
COMMIT;
*/


-- ─────────────────────────────────────────────────────────────────────
-- ملاحظة على المنازل العشرية
-- ─────────────────────────────────────────────────────────────────────
-- KWD وBHD وOMR تُكتب بثلاث منازل عشرية لا اثنتين (ISO 4217 exponent=3).
-- عرض الواجهة مثبّت على منزلتين، وهو صحيح لـSAR — وهي العملة الوحيدة
-- المستعملة اليوم. إن أُدخلت إحدى العملات الثلاث فعلياً، يلزم تعديل
-- formatCurrency لتشتقّ عدد المنازل من العملة.
