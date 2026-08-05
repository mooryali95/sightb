# تحليل معماري + خطة تحسين البناء والتكامل

## الوضع الحالي (متحقَّق منه)

- **الحجم**: 196 ملف TS/TSX (~36 ألف سطر). أضخم الملفات: `ResourcePayablesSection.tsx` (2078)، `FundsSection.tsx` (917)، `ExpensesSection.tsx` (839)، `types/project.ts` (833)، `export.ts` (801)، `resourcePayableSlice.ts` (738).
- **الاختبارات**: 111/111 خضراء (9 ملفات) + pgTAP في CI.
- **الباكاند**: 72 migration، 10 edge functions، 35 جدولاً بـ RLS.
- **طبقة البيانات**: `src/services/db.ts` (retry + offline queue) مطبَّقة على الـ slices، لكن ما زالت صفحات ومكوّنات تستورد عميل قاعدة البيانات مباشرة: `UserManagement.tsx`، `SystemAuditLog.tsx`، `MobileExpenseCapture.tsx`، `AIExecutiveInsights.tsx`، `SsotExplainButton.tsx`، `useRole.tsx`، `useSessionTimeout.tsx`، `store/helpers.ts`.
- **TypeScript**: `strictNullChecks: false`، `noImplicitAny: false`، و`as any` منتشر في مسارات الاستعلام (`supabase as any` في 11 ملفاً) — أنواع `types.ts` المولَّدة غير مستفاد منها فعلياً.
- **حالة الخادم**: `@tanstack/react-query` مثبَّت لكن **غير مستخدَم في أي ملف**؛ كل التحميل يتم عبر `loadAll()` في Zustand عند الإقلاع (تحميل جماعي لكل الجداول).
- **البناء**: Vite افتراضي بلا تقسيم chunks يدوي؛ `xlsx` + `jspdf` + `recharts` تُحمَّل ضمن حزم الصفحات.
- **DB linter**: 10 تحذيرات كلها من فئة "SECURITY DEFINER قابلة للتنفيذ" (2 لـ anon، 8 لـ authenticated).

## المشاكل الجوهرية

1. **ازدواج مصدر البيانات**: `loadAll` يسحب كل الجداول لكل المستخدمين عند الدخول → بطء إقلاع وتضخم ذاكرة، وبلا cache/invalidation منظم رغم وجود react-query.
2. **تسريب طبقة البيانات**: صفحات تتحدث مباشرةً مع العميل فتفوّت retry/offline/logging.
3. **ضعف أمان الأنواع**: `strictNullChecks: false` + `as any` يلغيان فائدة الأنواع المولَّدة، ويخفيان أخطاء nullable في الحسابات المالية.
4. **مكوّنات ضخمة**: ملفات الأقسام تتجاوز 800–2000 سطر وتخلط عرضاً ومنطقاً ونماذج.
5. **حجم الحزمة**: مكتبات التصدير الثقيلة غير مؤجَّلة.
6. **تحذيرات SECURITY DEFINER** على انتقاء دوال في الـ API schema.

## الخطة — 3 مراحل

### المرحلة 1: إغلاق طبقة الوصول للبيانات
- ترحيل الملفات الستة المتبقية إلى `services/` (خدمات: `userService`، `auditService`، `mobileExpenseService`، `aiService`، `ssotService`).
- منع الانحدار عبر قاعدة ESLint `no-restricted-imports` تحظر استيراد عميل القاعدة خارج `src/services/` و`src/integrations/`.
- توحيد `store/helpers.ts` على `db.userId()`.

### المرحلة 2: نموذج بيانات الخادم والأداء
- إدخال React Query فعلياً: تحويل `loadProjectData` / `loadCompanyData` إلى queries بمفاتيح مُنظَّمة مع `staleTime`، وإبقاء Zustand للحالة المحلية (اختيارات، فلاتر) فقط.
- تقليم `loadAll` إلى الحد الأدنى للإقلاع (الشركات + المحافظ + المشاريع)، وتحميل البقية عند الطلب.
- تقسيم الحزمة: `manualChunks` لـ `xlsx`/`jspdf`/`recharts` + استيراد ديناميكي داخل `lib/export.ts`.

### المرحلة 3: صرامة الأنواع والباكاند
- تفعيل `strictNullChecks` تدريجياً (`src/lib/finance/**` و`src/services/**` أولاً) وإزالة `supabase as any` باستخدام `Database` المولَّد.
- تفكيك `ResourcePayablesSection.tsx` و`FundsSection.tsx` و`ExpensesSection.tsx` إلى (جدول / نموذج / لوحة تفاصيل / hook منطق).
- migration واحد يضبط صلاحيات الدوال الـ 10 المُبلَّغ عنها: REVOKE من `PUBLIC`/`anon`، ومنح `authenticated` فقط للدوال المقصود استدعاؤها من العميل.

## تفاصيل تقنية

- لا تغيير في المخطط سوى منح/سحب صلاحيات التنفيذ.
- كل مرحلة تُغلَق بـ `bun run test` (111 حالياً) + فحص أنواع، مع إضافة اختبارات للخدمات الجديدة.
- المراحل مستقلة ويمكن تنفيذ أي منها منفردة.
