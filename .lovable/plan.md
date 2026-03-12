

# خطة تنفيذ المهام الخمس

---

## المهمة 1: إعادة هيكلة التبويبات

### التوزيع المقترح (4 مجموعات):

```text
التخطيط          المالية           المتابعة         الإدارة
─────────       ─────────        ─────────       ─────────
• المراحل       • الموازنة        • التحليلات      • أوامر التغيير
• الموارد       • خط الأساس      • ما-إذا         • المخاطر
                • المصروفات                       • السجل (admin)
                • العهد
                • الإيرادات
```

### التنفيذ:
- إنشاء مكون `ProjectTabGroups` يعرض المجموعات الأربع كـ dropdown menus أو nested tabs
- كل مجموعة تدعم `badge` رقمي للتنبيهات المستقبلية (مثل: عدد أوامر التغيير المعلقة، مخاطر مفتوحة)
- التصميم: شريط علوي بـ 4 أزرار مجموعات، عند الضغط تظهر التبويبات الفرعية
- **الملفات**: `src/pages/ProjectDetail.tsx`

---

## المهمة 2: إصلاح مشاكل الأمان

### أ. Audit Log (لا تغيير مطلوب)
`logDeletion` **بالفعل no-op** — الكود الحالي يقول: *"audit logging is now handled exclusively by database triggers"*. لكن لا يزال يُستدعى في `deleteBaseline`, `deleteMilestone`, `deleteChangeOrder`. سأزيل الاستدعاءات المتبقية وأتحقق أن RLS على `audit_log` يمنع INSERT من العميل (✅ محقق حالياً).

### ب. RLS + نظام الأدوار
السياسات الحالية **تستخدم بالفعل** `has_access()` و `can_edit()` — ✅ لا تحتاج تعديل. مراجعة مكتملة.

### ج. Realtime لـ useRole
- إضافة `supabase.channel('user-roles-changes')` مع subscription على `postgres_changes` لجدول `user_roles`
- عند تغيير أي دور للمستخدم الحالي → إعادة fetch + toast
- **Migration**: `ALTER PUBLICATION supabase_realtime ADD TABLE public.user_roles;`
- **الملفات**: `src/hooks/useRole.tsx`

### د. listUsers() في send-invite
- استبدال `supabaseAdmin.auth.admin.listUsers()` بـ `supabaseAdmin.from('profiles').select('id').eq('email', normalizedEmail).maybeSingle()`
- **الملفات**: `supabase/functions/send-invite/index.ts`

### هـ. Device Fingerprint validation
- إضافة regex validation للـ fingerprint في `admin-otp` (يجب أن يكون UUID صالح)
- **الملفات**: `supabase/functions/admin-otp/index.ts`

### و. (supabase as any) في useRole
- إصلاح typing باستخدام `.select('id, role, scope_type, scope_id')` مع type assertion مناسب
- **الملفات**: `src/hooks/useRole.tsx`

### ز. كلمة المرور المؤقتة
- استبدال `crypto.randomUUID().slice(0, 16) + "Aa1!"` بتوليد عشوائي كامل بأحرف وأرقام ورموز
- **الملفات**: `supabase/functions/send-invite/index.ts`

---

## المهمة 3: Session Timeout للمدراء

### قاعدة البيانات:
- إضافة حقل `last_activity` (timestamptz) إلى جدول `trusted_devices`
- إضافة حقل `session_timeout_minutes` (integer, default 60)

### العميل:
- إنشاء hook `useAdminSessionTimeout` يتتبع click/keypress/mousemove
- كل 60 ثانية يتحقق: إذا آخر نشاط > timeout → يعيد طلب OTP
- يعرض countdown قبل الانتهاء بـ 5 دقائق عبر toast أو banner
- **الملفات**: `src/hooks/useAdminSessionTimeout.tsx`, `src/pages/Login.tsx`, `supabase/functions/admin-otp/index.ts`

---

## المهمة 4: Input Sanitization

### التنفيذ:
- إضافة دالة `sanitizeText(input: string): string` في `src/lib/utils.ts`
  - تزيل HTML tags، تهرّب `<`, `>`, `"`, `'`, `&`
  - تقطع whitespace زائد
- تطبيقها في store قبل إرسال البيانات (في `addRisk`, `addBudgetItem`, `addExpense`, إلخ)
- أو الأفضل: تطبيقها كـ zod `.transform()` في `validations.ts`
- **الملفات**: `src/lib/utils.ts`, `src/lib/validations.ts`

---

## المهمة 5: الربط البصري بين المصروفات والموازنة

### التنفيذ:
- إنشاء مكون `BudgetUtilizationBar` مستقل في `src/components/project/BudgetUtilizationBar.tsx`
  - يعرض شريط تقدم بالنسبة المئوية (planned vs actual)
  - ألوان: أخضر < 75%، أصفر 75-90%، أحمر > 90%
  - toast تلقائي عند تجاوز 90%
- دمجه في `ExpensesSection` فوق جدول المصروفات، يتفاعل مع الفئة المحددة في الفلتر
- **الملفات**: `src/components/project/BudgetUtilizationBar.tsx`, `src/components/project/ExpensesSection.tsx`

---

## ترتيب التنفيذ والملفات المتأثرة

| المهمة | الملفات |
|--------|---------|
| 1 | `ProjectDetail.tsx` |
| 2أ | `store/helpers.ts`, `useStore.ts` (إزالة logDeletion calls) |
| 2ج | `useRole.tsx`, migration SQL |
| 2د | `send-invite/index.ts` |
| 2هـ | `admin-otp/index.ts` |
| 2و | `useRole.tsx` |
| 2ز | `send-invite/index.ts` |
| 3 | `useAdminSessionTimeout.tsx` (جديد), `Login.tsx`, migration SQL |
| 4 | `utils.ts`, `validations.ts` |
| 5 | `BudgetUtilizationBar.tsx` (جديد), `ExpensesSection.tsx` |

