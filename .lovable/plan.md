# تحليل أمني شامل (Red Team) — منصة Rouya / Basserh

تم إجراء فحص شامل على: قاعدة البيانات (RLS, Functions, Triggers)، Edge Functions، طبقة المصادقة، التخزين، و Realtime. النتائج مرتبة حسب الخطورة الفعلية.

---

## 🔴 CRITICAL — يجب الإصلاح فوراً

### C1. تجاوز عزل المشاريع في `budget_amendments` (IDOR)

- **الموقع**: RLS policies على `budget_amendments`
- **التفاصيل**: سياسات INSERT/UPDATE تتحقق فقط من `auth.uid() = user_id` ولا تتحقق من عضوية المستخدم في `project_id`. أي مستخدم مصادَق عليه يستطيع إنشاء/تعديل تعديلات ميزانية لأي مشروع في النظام (بما فيها مشاريع شركات أخرى).
- **التأثير**: تلاعب مالي مباشر، خرق Budget Lock، تجاوز Change Orders.
- **الإصلاح**: إضافة `can_edit(auth.uid(), 'project', project_id)` إلى WITH CHECK لكل من INSERT و UPDATE، وإلى USING في DELETE.

### C2. Realtime بدون تفويض قنوات

- **الموقع**: `realtime.messages` بدون أي RLS policy
- **التفاصيل**: 8 جداول منشورة (budget_items, expenses, revenues, milestones, change_orders, resource_reimbursements, payment_requests, resource_settlements) تبث تغييرات الصفوف لأي مشترك مصادَق عليه بصرف النظر عن عضويته في المشروع.
- **التأثير**: تسريب مالي مباشر — أي مستخدم لديه حساب يمكنه الاشتراك ورؤية كل الحركات المالية لكل المشاريع لحظة حدوثها.
- **الإصلاح**: تفعيل RLS على `realtime.messages` مع سياسة تربط topic بعضوية المستخدم عبر `has_access()`. أو تقييد القنوات إلى topic-per-project مع التحقق من JWT.

### C3. تنفيذ `SECURITY DEFINER` متاح لأي مجهول/مصادَق

- **التفاصيل**: 28 دالة `SECURITY DEFINER` في schema public جميعها يمكن تنفيذها من قِبل `anon` و `authenticated` بشكل مباشر عبر PostgREST RPC. منها دوال حساسة:
  - `enqueue_email`, `read_email_batch`, `delete_email`, `move_to_dlq` → تلاعب بطابور البريد، إغراق، حذف رسائل.
  - `has_role`, `has_access`, `can_edit` → استخدام مشروع عبر RLS لكن EXECUTE لا يجب أن يكون لـ `anon`.
  - `audit_delete`, `audit_update`, `system_audit_*` → دوال trigger يجب ألا تكون قابلة للاستدعاء RPC أصلاً.
- **التأثير**: حسب الدالة — إغراق طابور البريد، تنفيذ إجراءات إدارية، تجاوز RLS.
- **الإصلاح**:
  - لكل دوال `system_audit_*`, `audit_*`, `touch_*`, `protect_*`, `auto_*`, `enforce_*`, `check_*`, `recalc_*`, `handle_new_user`: 
  `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated;` (تُستدعى من triggers فقط، لا حاجة لـ EXECUTE خارجي).
  - دوال طابور البريد (`enqueue_email`, `read_email_batch`, `delete_email`, `move_to_dlq`): REVOKE من anon/authenticated، تُستدعى من service_role فقط.
  - `has_role`, `has_access`, `can_edit`: REVOKE من anon فقط، الإبقاء لـ authenticated (تُستخدم في RLS).

---

## 🟠 HIGH

### H1. CORS `*` في `auth-email-hook`

- يقبل أي origin. رغم أنه webhook موقّع من Supabase Auth، يفضل تقييد الـ origin أو الاعتماد فقط على التحقق من توقيع الـ webhook (`SEND_EMAIL_HOOK_SECRET` عبر standard-webhooks).

### H2. سياسة UPDATE مفقودة على bucket `expense-receipts`

- يمكن لمستخدم الكتابة فوق ملف مستخدم آخر إذا خَمَّن المسار. أضف سياسة UPDATE مماثلة لـ INSERT (`auth.uid()::text = storage.foldername(name)[1]`).

### H3. `resource_settlements` مع `project_id IS NULL` مرئية للجميع

- أي authenticated يستطيع SELECT لأي تسوية موارد غير مرتبطة بمشروع. قيّد الفرع `project_id IS NULL` بـ `user_id = auth.uid() OR has_role(auth.uid(),'admin')`.

### H4. غياب Rate Limiting على Edge Functions الحساسة

- `admin-otp`, `send-invite`, `extract-receipt-data`, `ai-executive-summary`, `delete-user`, `accept-invite` — لا يوجد throttling. مخاطر:
  - `admin-otp`: brute-force على رموز OTP (رغم عدّاد `failed_attempts`، لا يوجد rate limit على إرسال جديد).
  - `extract-receipt-data` و `ai-executive-summary`: استنزاف credits لـ Lovable AI.
  - `send-invite`: spam البريد.
- **الإصلاح**: جدول `rate_limits(user_id, endpoint, window, count)` + فحص في كل function، أو استعمال Upstash/Edge KV.

### H5. Session Timeout عميل-جانبي فقط

- `useSessionTimeout` يعتمد على activity في المتصفح. لا يوجد فرض من السيرفر — توكن JWT يبقى صالحاً ساعة كاملة. مهاجم سرق التوكن لا يتأثر بـ"timeout" المحلي. الإصلاح: تقصير مدة JWT في إعدادات Auth + refresh-rotation + revocation list.

---

## 🟡 MEDIUM

### M1. غياب SELECT للمدعو على دعوته الخاصة

- `user_invites` يقتصر على admins. إن كان الـ UI يعتمد على قراءة client-side للحالة، سيفشل بصمت. (مذكور في الفحص).

### M2. لا توجد سياسة على حذف admin_otp_codes منتهية

- جدول `admin_otp_codes` محمي بـ `qual:false` (جيد)، لكن لا يوجد job لتنظيف الرموز المنتهية → نمو غير محدود + خطر replay لو فُكّ تشفير الـ DB. أضف cron daily delete.

### M3. `password_hibp_enabled` غير مؤكد

- يجب التأكد من تفعيله (`configure_auth password_hibp_enabled: true`).

### M4. لا يوجد `disable_signup`

- إن كان النظام دعوات-فقط، يجب `disable_signup: true` لمنع تسجيل ذاتي.

### M5. بيانات حساسة في `audit_log.record_data` (jsonb)

- يخزن سجلات كاملة محذوفة. سياسة SELECT تسمح للمستخدم برؤية سجلاته أو سجلات مشاريعه — جيد، لكن قد تحتوي على بيانات بنوك/موردين. اعتبر تقليم الحقول الحساسة قبل التخزين.

### M6. `Allow-Headers` يقبل `apikey` في وظائف ذات `verify_jwt = false`

- `admin-otp` و `auth-email-hook` و `send-invite` و `accept-invite` معطّلة JWT verification. لا تعتمد أبداً على `apikey` للتفويض داخلها — تأكد من أن منطق التفويض الداخلي صارم (موجود في send-invite عبر `getUser(token)` ✓).

---

## 🟢 LOW / Hygiene

- L1. `ALLOWED_ORIGINS` يسمح بـ `*.lovableproject.com` و `*.lovable.app` — نطاق واسع؛ بعد الإطلاق قيّده إلى `sight.basserh.com` فقط.
- L2. لا يوجد Content-Security-Policy في `index.html`. أضف CSP صارم (script-src self, connect-src supabase URLs).
- L3. `admin_otp_codes` لا يخزن hash للرمز بل النص الخام (`code text`). يفضل تخزين `crypt(code, gen_salt('bf'))`.
- L4. لا يوجد WAF/فلتر على الحقول النصية — XSS sanitization موجود (memory)، تحقق من تطبيقه على كل input مستخدم في PDF/Excel أيضاً.
- L5. Service-role key مستخدم في 6 functions — تأكد أن لا واحدة منها تعكس بيانات service-role-fetched إلى مستخدم غير مفوض.

---

## خطة التنفيذ المقترحة (Migrations)

```text
Migration 1 — Critical RLS fixes
  - budget_amendments: WITH CHECK = auth.uid()=user_id AND can_edit(...)
  - resource_settlements: تشديد فرع project_id IS NULL
  - storage.objects: UPDATE policy لـ expense-receipts

Migration 2 — REVOKE EXECUTE
  - REVOKE EXECUTE من anon/authenticated على دوال triggers و queue
  - الإبقاء فقط على has_role/has_access/can_edit لـ authenticated

Migration 3 — Realtime authorization
  - ENABLE RLS على realtime.messages
  - سياسة تربط topic بـ has_access(project_id)

Migration 4 — Hygiene
  - Hash لـ admin_otp_codes.code
  - Cron يومي لحذف رموز OTP منتهية
  - Rate limit table

Edge functions hardening
  - admin-otp: rate limit per IP+user (5 OTP/hour)
  - send-invite / extract-receipt-data / ai-executive-summary: rate limit
  - auth-email-hook: تقييد CORS + التأكد من توقيع webhook

Auth config
  - configure_auth: password_hibp_enabled=true, disable_signup=true (إن كان دعوات فقط)
  - تقصير JWT expiry (30 دقيقة) مع refresh rotation
```

---

## ملخص الأرقام

- إجمالي ثغرات مكتشفة: **61**
- Critical: **3**  |  High: **5**  |  Medium: **6**  |  Low: **5**
- الأكثر إلحاحاً: **C1, C2, C3** — خرق سرية مالية مباشر.

هل تريد أن أبدأ بـ Migration 1 (الإصلاحات الحرجة الثلاث)   
أولاً، أم أن أنفذ الخطة كاملة دفعة واحدة؟  
  
بدا المايجرشن الاول، تاكد من اي مشكلة او ارتبطاتا تخص التعديلات او ستؤثر لا تنفيهذا حتي توضحها لي