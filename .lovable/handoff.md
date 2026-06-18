# Rouya — Project Handoff & Migration Guide

> ملف مرجعي شامل لتسهيل استلام/نقل المشروع داخل Lovable لأي وكيل أو مطوّر جديد.
> اللغة: العربية في الواجهة (RTL)، الكود والتعليقات بالإنجليزية.

---

## 1) نبذة عن المنتج

- **الاسم التجاري:** Rouya — منصة إدارة المشاريع الخاصة بشركة **Basserh**.
- **الهدف:** إدارة محفظة مشاريع (Portfolios → Projects) مع تتبع كامل للموازنات، الالتزامات، العهد المالية، الموارد، والمصروفات، ومؤشرات EVM (CPI/SPI/EAC/ETC) ولوحات تنفيذية.
- **اللغة/الاتجاه:** عربي RTL بالكامل. الأرقام **إنجليزية (0-9)** فقط والتقويم **ميلادي** — يتم تطبيع الأرقام العربية/الهندية قبل الحفظ.
- **الجمهور:** فِرَق إدارة المشاريع، الإدارة المالية، الإدارة التنفيذية.

---

## 2) Stack تقني

| الطبقة | التقنية |
|---|---|
| Frontend | React 18 + Vite 5 + TypeScript 5 |
| UI | Tailwind v3 + shadcn/ui + Radix + lucide-react + framer-motion |
| Forms | react-hook-form + zod |
| State | Zustand (slices) + React Query |
| Charts | recharts |
| PDF/Excel | jspdf, jspdf-autotable, xlsx (export.ts) |
| Backend | **Lovable Cloud** (Supabase): Postgres + Auth + Storage + Edge Functions |
| AI | Lovable AI Gateway (Gemini/OpenAI عبر edge function) |
| Email | Lovable Emails (transactional + auth via auth-email-hook) |
| Tests | Vitest (91 tests — يجب أن تبقى خضراء) |

> ❌ لا تُستبدل أي من هذه التقنيات (لا Next.js، لا Vue، لا Mongo). Lovable يعتمد Vite/React فقط.

---

## 3) الأوامر الأساسية

```bash
bun install
bun run dev        # محلي
bun run build      # بناء
bun run test       # Vitest (91/91 يجب أن تنجح)
bun run lint
```

> لا تُشغّل `bun run build` أو `tsc` يدوياً داخل Lovable — البناء يعمل تلقائياً.

---

## 4) هيكل المجلدات

```
src/
  pages/              # الصفحات الموجّهة بـ react-router
  components/
    project/          # أقسام صفحة المشروع (Expenses, Funds, Commitments, ...)
    dashboard/        # لوحة Portfolio
    ui/               # shadcn primitives + inspector-panel + table-density-toggle
  store/
    useStore.ts       # Zustand root
    slices/           # company/project/budget/fund/baseline/...
  hooks/              # useAuth, useRole, useSessionTimeout, useTableDensity, useResponsiveTableLabels...
  lib/
    finance.ts        # EVM / CPI / SPI / EAC / VAT
    funds.ts          # حسابات العهد + التسويات
    resource-payables.ts
    budget-comparison.ts
    export.ts         # PDF/Excel
    validations.ts    # zod schemas
  integrations/supabase/   # AUTO-GEN — لا تُعدّل
  types/project.ts

supabase/
  migrations/         # 66 ملف مرتب زمنياً — لا تُعدّل القديم، أنشئ جديد فقط
  functions/          # edge functions

.lovable/
  plan.md
  financial-audit.md
  handoff.md          # ← هذا الملف

mem://                # ذاكرة Lovable طويلة المدى (انظر mem://index.md)
```

---

## 5) قاعدة البيانات (Public Schema)

**35 جدول.** عناوين رئيسية:

- **التنظيم:** `companies`, `portfolios`, `projects`
- **التخطيط/الموازنة:** `cost_baselines`, `baseline_items`, `budget_items`, `budget_amendments`, `change_orders`, `milestones`
- **التنفيذ المالي:** `expenses`, `commitments`, `payment_requests`, `revenues`, `indirect_costs`, `periodic_snapshots`
- **العهد والموارد:** `project_funds`, `fund_settlements`, `cash_transfers`, `settlement_events`, `custodies`, `resources`, `resource_reimbursements`, `resource_settlements`
- **المخاطر:** `risks`
- **المستخدمون والصلاحيات:** `profiles`, `user_roles` (Enum `app_role`: admin/editor/viewer), `user_invites`, `admin_otp_codes`, `trusted_devices`
- **التدقيق:** `audit_log`, `system_audit_log`
- **البريد:** `email_send_log`, `email_send_state`, `email_unsubscribe_tokens`, `suppressed_emails`

### قواعد ذهبية (لا تُكسر)

1. **RLS مُفعّل على كل جدول public**، مع `GRANT` صريح. Migration بدون GRANT = خطأ.
2. **الأدوار في جدول منفصل** (`user_roles`) — never on profiles. التحقق عبر `public.has_role(uid, role)` (SECURITY DEFINER + `REVOKE EXECUTE FROM PUBLIC, anon, authenticated`).
3. **كل SECURITY DEFINER في public:** `SET search_path = public` + REVOKE/GRANT صريح.
4. **Net Storage Policy:** المبالغ تُخزّن **بدون VAT**. الضريبة تُحسب ديناميكياً من `projects.tax_percent`.
5. **Soft delete** (أرشفة) افتراضياً. DB يستخدم `ON DELETE CASCADE` للنزاهة.
6. **Budget Lock:** بعد اعتماد الـ baseline يُمنع تعديل الموازنة مباشرةً — يجب Change Order.

---

## 6) المنطق الأعمالي الحرج

- **EVM (lib/finance.ts):** PV/EV/AC، CPI=EV/AC، SPI=EV/PV، EAC=BAC/CPI، ETC=EAC-AC.
- **Health Score:** Critical إذا CPI<0.7 أو Risk≥50%، Warning في الحدود الوسطى.
- **العهد:** spent = direct expenses + custody draw + outstanding advances + cash transfers out − transfers in. التسوية تُغلق العهدة وتُسجّل `settlement_events`.
- **Resource Payables:** تتبع المستحقات للموردين بفصل التسوية عن السداد.
- **التنبيهات الذكية:** تحذير عند تجاوز 90% من الموازنة، وإقفال تلقائي للعهد عند 100%.

---

## 7) الأمان

- جلسة 30 دقيقة (useSessionTimeout) + تحذير قبل انتهاء الجلسة.
- 2FA (OTP) للأدمن قبل عمليات الكتابة الحساسة، مع بصمة المتصفح (trusted_devices) 30 يوم.
- XSS sanitization عند العرض.
- Audit log للكتابة من جانب السيرفر فقط.
- HIBP password check عند التسجيل.
- لا توجد تسجيلات Anonymous.

---

## 8) Edge Functions

| Function | غرض |
|---|---|
| `ai-executive-summary` | ملخص تنفيذي ذكي عبر Lovable AI |
| `extract-receipt-data` | OCR للفواتير |
| `admin-otp` | إرسال/تحقق OTP الأدمن |
| `admin-email-status` | فحص حالة البريد |
| `send-invite` / `accept-invite` / `delete-user` | إدارة دورة حياة المستخدمين |
| `auth-email-hook` | تخصيص بريد المصادقة |
| `process-email-queue` | معالجة طابور البريد |

> جميعها تعتمد على Lovable Cloud secrets — لا تطلب من المستخدم مفاتيح خارجية إلا للضرورة.

---

## 9) UI/UX قواعد ملزمة

- **Tokens فقط:** ممنوع `text-emerald-*`, `bg-amber-*`. استعمل semantic (`success/warning/destructive`) و helpers (`health-good/warning/critical`).
- **Inspector Panel** للعرض القراءة فقط، **Dialog** للتحرير.
- **الجداول:** Sticky header + `TableDensityToggle` + Mobile cards (`useResponsiveTableLabels`).
- **Confirm dialogs** لأي حذف.
- **Viewers** لا يرون أي زر تحرير/حذف — `readOnly` prop يُمرَّر من `useRole`.
- **التنقل العام:** Ctrl+K (GlobalSearch) + SmartNotifications.

---

## 10) خطوات استلام المشروع (Checklist)

1. اقرأ هذا الملف + `mem://index.md` + الذاكرات المرجعية (especially `mem://architecture/data-loading-strategy`).
2. شغّل `bun install && bun run test` — تأكد 91/91.
3. افتح المعاينة، سجّل دخول كـ Admin، تأكّد من تحميل البورتفوليو والمشاريع.
4. راجع آخر 5 migrations لفهم آخر التغييرات.
5. قبل أي ميزة جديدة:
   - تحقق من الذاكرة (`mem://`) لتجنب تكرار قرارات مرفوضة.
   - تحقق من RLS/GRANT/SECURITY DEFINER policies.
   - أضف اختبار Vitest للمنطق المالي الجديد.
6. لا تعدّل `src/integrations/supabase/*`, `.env`, ولا migrations قديمة.

---

## 11) ما لا يجب فعله مطلقاً

- ❌ تخزين Roles على `profiles`.
- ❌ كشف Service Role Key أو DB password.
- ❌ إدخال أرقام عربية/هندية أو تاريخ هجري في DB.
- ❌ تخزين مبالغ شاملة الضريبة.
- ❌ تعديل الموازنة بعد قفل الـ baseline دون Change Order.
- ❌ استخدام ألوان Tailwind خام (`text-emerald-*` ...).
- ❌ إضافة Anonymous sign-ups أو auto-confirm email.
- ❌ ذكر "Supabase" للمستخدم — قُل "Lovable Cloud / Backend".

---

## 12) روابط مرجعية داخلية

- خطة التطوير: `.lovable/plan.md`
- تدقيق مالي: `.lovable/financial-audit.md`
- فهرس الذاكرة: `mem://index.md`
- اختبارات: `src/lib/__tests__/*`

---

_آخر تحديث: تم توليده تلقائياً بواسطة وكيل Lovable._
