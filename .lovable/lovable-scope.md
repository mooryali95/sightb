# Lovable — نطاق العمل والتنسيق مع الفرق

مرجع ملزم لوكيل Lovable. النص الكامل للمالك في `docs/LOVABLE_HANDOFF.md` وهو المرجع الأعلى عند أي تعارض.

## المسموح لـ Lovable فقط
- تحسينات بصرية يطلبها المالك (مسافات، ألوان عبر الـ tokens، أيقونات، تخطيط، تجاوب، نصوص عربية غير مختبرة).
- صفحات أو مكوّنات جديدة يطلبها المالك صراحة، في ملفات جديدة.
- نشر المشروع عند طلب المالك.
- migrations جديدة يكتبها Lovable لميزات يطلبها المالك (إضافة فقط).

## الممنوع مطلقاً
- تعديل أو حذف أو إعادة تسمية أي اختبار (`e2e/**`, `__tests__/**`, `*.test.ts(x)`). إن فشل اختبار بسبب تغيير، فالتغيير هو الخطأ.
- حذف أو إعادة تسمية أي migration.
- لمس الملفات المحمية: `src/lib/resource-spend.ts`, `src/components/project/ExpensesSection.tsx`, `src/components/project/stats/BudgetRow.tsx`, `src/pages/Login.tsx`, `src/pages/login/**`, `src/components/ProtectedRoute.tsx`, `src/lib/query-cache.ts`, `src/hooks/useAppData.ts`, `src/lib/finance/**`, `src/services/**`, `.github/**`, `scripts/**`, `CLAUDE.md`, `docs/**`, `AGENTS.md`, `eslint.config.js`, `playwright.config.ts`, `vitest.config.ts`.
- عكس أي commit جاء عبر Pull Request، أو استعادة ملف حذفه PR.
- توجيه `bun.lock` لأي سجل غير `registry.npmjs.org`.
- الوصول لقاعدة البيانات من مكوّن أو صفحة مباشرة (فقط عبر `src/services`).

## عند طلب تعديل ملف محمي
لا يُعدَّل. يُرد بأن الملف محمي، والتغيير يمر عبر Pull Request على GitHub (Claude أو المطوّر).

## قبل أي تعديل
1. تحقق أن الملف ليس في القائمة المحمية.
2. راجع `git log` للملف: إن كان آخر من عدّله PR، لا تعدّله.
3. بعد التعديل: يجب أن يبقى `main` أخضر في Quality workflow.

## تقسيم الفرق
| الفريق | النطاق |
|---|---|
| Claude / المطوّرون عبر GitHub | المنطق المالي، الخدمات، الدخول والتحقق الثاني، الاختبارات، CI، الوثائق |
| Lovable | الواجهة البصرية، الصفحات الجديدة بطلب المالك، النشر |
| المالك (Omar) | الموافقات، النشر، قرارات الأمان (فرض التحقق الثاني، إزالة admin-otp) |

## بنود معلّقة تخص Lovable
- النشر الحي: بانتظار طلب المالك.
- أي عمل على الدخول أو التحقق الثاني: خارج نطاق Lovable — يُسلَّم عبر PR.
