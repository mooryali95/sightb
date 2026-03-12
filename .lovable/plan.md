

# خطة: ضمان عرض جميع الأرقام بالصيغة الإنجليزية

## المشاكل المكتشفة

1. **`AuditLogSection.tsx` سطر 140**: يستخدم `toLocaleString('ar-SA')` — يُنتج أرقام عربية-هندية (٠١٢٣)
2. **`chart.tsx` سطر 212**: يستخدم `toLocaleString()` بدون تحديد locale — قد يُنتج أرقام عربية حسب المتصفح
3. **لا يوجد تحويل للمدخلات**: إذا كتب المستخدم أرقام عربية-هندية (٠-٩) في حقول الإدخال، تُرسل كما هي

## الحل

### 1. دالة مركزية لتحويل الأرقام العربية-الهندية إلى إنجليزية
إضافة `normalizeDigits(input: string): string` في `src/lib/utils.ts` تستبدل ٠-٩ بـ 0-9

### 2. إصلاح المواقع الثلاثة
- `AuditLogSection.tsx`: تغيير `'ar-SA'` → `'en-US'`
- `chart.tsx`: إضافة `'en-US'` للـ `toLocaleString`
- تطبيق `normalizeDigits` في `validations.ts` كـ `.transform()` على الحقول الرقمية النصية

### 3. CSS لضمان الخط الرقمي
إضافة `font-variant-numeric: tabular-nums` مع التأكد أن خط JetBrains Mono (الموجود فعلاً) يُستخدم للأرقام

## الملفات المتأثرة
- `src/lib/utils.ts` — إضافة `normalizeDigits`
- `src/lib/validations.ts` — تطبيق التحويل على المدخلات
- `src/components/project/AuditLogSection.tsx` — إصلاح locale
- `src/components/ui/chart.tsx` — إصلاح locale

