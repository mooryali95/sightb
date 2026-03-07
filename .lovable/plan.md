

## تحليل مشكلة عدم إرسال الرسائل

### السبب الرئيسي: CORS يمنع الطلبات من المعاينة

كلا الدالتين (`admin-otp` و `send-invite`) تحددان قائمة نطاقات مسموحة:
- `sightb.lovable.app`
- `sight.basserh.com`  
- `localhost:5173` / `localhost:8080`

لكن رابط المعاينة الحالي هو `id-preview--8e5cefc0-...lovable.app` وهو **غير موجود في القائمة**. نتيجة لذلك، المتصفح يمنع استجابة الخادم بسبب فشل فحص CORS (preflight).

**الدليل**: سجلات `send-invite` فارغة تماما -- الطلب لا يصل للدالة أصلا لأن المتصفح يحجبه.

بينما `admin-otp` لديه سجلات ناجحة من `sight.basserh.com` (لأن هذا النطاق مدرج في القائمة).

### مشكلة إعادة تعيين كلمة المرور

سجلات المصادقة تُظهر أن `resetPasswordForEmail` **يعمل بنجاح** - الطلب يمر عبر Lovable Cloud email hook وليس عبر edge function. المشكلة المحتملة هي أن `redirectTo` يستخدم `window.location.origin` مما يعني أن الرابط في البريد قد يوجه المستخدم لعنوان المعاينة بدلا من النطاق الحقيقي.

---

### خطة الإصلاح

#### 1. توسيع CORS ليشمل جميع نطاقات lovable.app
في كلتا الدالتين (`admin-otp` و `send-invite`)، تغيير منطق CORS من قائمة ثابتة إلى فحص ديناميكي يسمح بأي نطاق فرعي من `lovable.app`:

```typescript
function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const isAllowed = 
    ALLOWED_ORIGINS.includes(origin) || 
    origin.endsWith(".lovable.app");
  const allowedOrigin = isAllowed ? origin : ALLOWED_ORIGINS[0];
  return { "Access-Control-Allow-Origin": allowedOrigin, ... };
}
```

#### 2. تثبيت redirectTo لإعادة تعيين كلمة المرور
في `Login.tsx`، استخدام النطاق الحقيقي بدلا من `window.location.origin`:

```typescript
const redirectTo = "https://sight.basserh.com/reset-password";
```

#### 3. إعادة نشر الدالتين
نشر `admin-otp` و `send-invite` بعد التعديل لتفعيل التغييرات.

---

### ملخص
| المشكلة | السبب | الحل |
|---------|-------|------|
| الدعوات لا تُرسل | CORS يحجب المعاينة | إضافة `*.lovable.app` للنطاقات المسموحة |
| OTP لا يعمل من المعاينة | نفس السبب | نفس الحل |
| رابط إعادة التعيين | `window.location.origin` يُرجع عنوان المعاينة | تثبيت الرابط على النطاق الحقيقي |

