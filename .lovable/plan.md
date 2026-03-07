

## المرحلة التالية: جودة الكود وإعادة الهيكلة

تم إنجاز مرحلة **الأمان** ✅. المرحلة التالية من القائمة هي **جودة الكود**، وتشمل:

### 1. تقسيم `ProjectDetail.tsx` إلى مكونات منفصلة
- فصل كل تبويب (الميزانية، المصروفات، الإيرادات، EVM، التقارير) إلى ملف مستقل داخل `src/components/project/`

### 2. تقسيم `useStore.ts` باستخدام Zustand Slices
- فصل المتجر إلى شرائح: `companySlice`, `portfolioSlice`, `projectSlice`, `budgetSlice`, `expenseSlice`, `revenueSlice`

### 3. إزالة `as any` وإكمال أنواع TypeScript
- استبدال جميع `as any` بأنواع صحيحة من `types.ts` أو تعريفات مخصصة

### 4. إضافة Error Boundaries
- إنشاء مكون `ErrorBoundary` عام ولفّه حول المكونات الحرجة (Dashboard, ProjectDetail)

### 5. استخدام React Query بدل Zustand للبيانات من الخادم
- نقل عمليات التحميل (`loadAll`, `loadProject`) إلى `useQuery` hooks مع caching وrefetching تلقائي

---

بعد هذه المرحلة تبقى المرحلة الثالثة: **الميزات الوظيفية** (Pagination، إصلاح EVM، PDF العربي، Realtime، الاختبارات، CI/CD، README).

هل تريد البدء بتنفيذ مرحلة جودة الكود؟

