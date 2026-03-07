

# خطة ربط Resend لإرسال الإيميلات

## الوضع الحالي
- **دالة admin-otp**: تحاول إرسال OTP عبر `api.lovable.dev/v1/email/send` (غير موثوق)
- **دالة send-invite**: تستخدم `inviteUserByEmail` من النظام المدمج (لا يصل الإيميل)

## الخطة

### 1. حفظ مفتاح Resend API كسر آمن
- حفظ `RESEND_API_KEY` في أسرار المشروع

### 2. تحديث دالة `admin-otp`
- استبدال استدعاء `api.lovable.dev` بـ Resend API (`https://api.resend.com/emails`)
- إرسال كود OTP مباشرة عبر Resend مع تصميم HTML عربي

### 3. تحديث دالة `send-invite`
- بدلاً من الاعتماد على `inviteUserByEmail` فقط، إرسال إيميل دعوة مخصص عبر Resend
- الخطوات: إنشاء المستخدم عبر `admin.createUser` ثم إرسال إيميل الدعوة عبر Resend مع رابط إعادة تعيين كلمة المرور
- أو: الإبقاء على `inviteUserByEmail` كاحتياطي وإرسال إيميل إضافي عبر Resend كتأكيد

### 4. المرسل
- Resend يتيح الإرسال من `onboarding@resend.dev` للاختبار بدون نطاق مخصص
- لاحقاً يمكن ربط نطاق مخصص من لوحة Resend

### ملاحظة تقنية
- سيتم استخدام `fetch("https://api.resend.com/emails", { ... })` مع المفتاح المحفوظ
- كلا الدالتين ستستخدمان Resend مباشرة لضمان وصول الإيميلات

