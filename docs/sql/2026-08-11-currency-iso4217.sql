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
-- ⚠️ نفّذ الخطوات بالترتيب. لا تنتقل للخطوة 1 قبل قراءة نتيجة الخطوة 0.
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
-- الخطوة 1 — الترحيل. كتلة واحدة داخل معاملة: إمّا تنجح كاملة أو
-- تتراجع كاملة. ترفع خطأً صريحاً عند أي قيمة غير معروفة.
-- ─────────────────────────────────────────────────────────────────────

BEGIN;

-- 1/4 · دالة تطبيع مؤقتة: ترجمة رموز العرض الشائعة إلى ISO 4217.
CREATE OR REPLACE FUNCTION pg_temp.to_iso4217(_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text := upper(btrim(coalesce(_raw, '')));
BEGIN
  RETURN CASE
    -- الريال السعودي بكل صوره المستعملة في البيانات والواجهة
    WHEN v IN ('SAR', 'ر.س', 'ر.س.', 'ريال', 'ريال سعودي', 'SR', '﷼') THEN 'SAR'
    WHEN v IN ('USD', '$', 'دولار')                                   THEN 'USD'
    WHEN v IN ('EUR', '€', 'يورو')                                    THEN 'EUR'
    WHEN v IN ('AED', 'د.إ', 'درهم')                                  THEN 'AED'
    WHEN v IN ('KWD', 'د.ك')                                          THEN 'KWD'
    WHEN v IN ('BHD', 'د.ب')                                          THEN 'BHD'
    WHEN v IN ('QAR', 'ر.ق')                                          THEN 'QAR'
    WHEN v IN ('OMR', 'ر.ع')                                          THEN 'OMR'
    WHEN v IN ('JOD', 'د.أ')                                          THEN 'JOD'
    WHEN v IN ('EGP', 'ج.م')                                          THEN 'EGP'
    WHEN v IN ('GBP', '£')                                            THEN 'GBP'
    WHEN v = ''                                                       THEN 'SAR'  -- فراغ ⇒ الافتراضي
    ELSE NULL                                                          -- غير معروف ⇒ يُرفَض أدناه
  END;
END;
$$;

-- 2/4 · ارفض الترحيل إن وُجدت قيمة لا تعرفها الدالة.
--        أفضل من تخمين خاطئ يمرّ صامتاً.
DO $$
DECLARE
  _bad text;
BEGIN
  SELECT string_agg(DISTINCT quote_literal(c), ', ') INTO _bad
  FROM (
    SELECT currency AS c FROM public.projects
    UNION
    SELECT currency FROM public.payment_requests
  ) s
  WHERE pg_temp.to_iso4217(c) IS NULL;

  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION
      'قيم عملة غير معروفة: %. أضفها إلى pg_temp.to_iso4217 ثم أعد التنفيذ.', _bad;
  END IF;
END;
$$;

-- 3/4 · التطبيع.
UPDATE public.projects
   SET currency = pg_temp.to_iso4217(currency)
 WHERE currency IS DISTINCT FROM pg_temp.to_iso4217(currency);

UPDATE public.payment_requests
   SET currency = pg_temp.to_iso4217(currency)
 WHERE currency IS DISTINCT FROM pg_temp.to_iso4217(currency);

-- 4/4 · الافتراضي الجديد + قيد يمنع عودة النص الحر.
--        القائمة إقليمية وقابلة للتوسيع بـALTER واحد لاحقاً.
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
-- الخطوة 2 — تحقق. المتوقع: كل الصفوف بـ'SAR'، والقيدان موجودان.
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

-- يجب أن يفشل هذا (دليل أن القيد يعمل). ألغِ التعليق لتجربته:
-- INSERT INTO public.projects (name, currency) VALUES ('probe', 'ر.س');


-- ─────────────────────────────────────────────────────────────────────
-- التراجع — إن لزم. يُعيد النص الحر والافتراضي القديم.
-- ملاحظة: لا يُعيد رموز العرض إلى الصفوف؛ الواجهة تتعامل مع
-- 'SAR' بلا مشكلة، ورمز العرض يُشتق منها عند العرض.
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
